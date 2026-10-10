/**
 * Moteur d'export : chaque document dans chacun de ses formats, contenu identique entre l'éditable et le
 * PDF, formules Excel, montants en lettres, versions figées, dossier ZIP, thème sombre, gros documents.
 */
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { setAiProviderForTests } from "../../server/ai/client.js";
import { fakeProvider } from "../../server/ai/fake.js";
import { schema } from "../../server/db/index.js";
import { runJob, setJobKickerForTests } from "../../server/jobs/runner.js";
import { pdfPlainText } from "../../server/services/pdf-text.js";
import { adminSession, setupTestServer, TestBrowser } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setupTestServer>>;
let admin: TestBrowser;
let projectId = "";
let cctpId = "";
let dpgfId = "";

const get = (path: string) => admin.request(`/api/admin/exports/${path}`);
const pdfText = async (bytes: Uint8Array) => (await pdfPlainText(bytes)).join("\n").replace(/\s+/g, " ");
const pages = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount();
async function workbook(bytes: Uint8Array) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  return wb;
}
function formulas(sheet: ExcelJS.Worksheet): string[] {
  const out: string[] = [];
  sheet.eachRow((row) => row.eachCell((cell) => cell.formula && out.push(cell.formula)));
  return out;
}

beforeAll(async () => {
  ctx = await setupTestServer();
  admin = (await adminSession(ctx.app)).browser;
  setJobKickerForTests(async (id) => {
    await runJob(id);
  });
  setAiProviderForTests(fakeProvider);
  const client = (await admin.request("/api/admin/clients", { body: { name: "Agence urbaine", sector: "public", country: "MA", city: "Fès" } })).json.client;
  projectId = (await admin.request("/api/admin/projects", { body: { name: "Centre culturel", country: "MA", city: "Fès", clientId: client.id, marketType: "appel_offres_ouvert", sector: "public", currency: "MAD" } })).json.project.id;
  const lotId = (await admin.request(`/api/admin/projects/${projectId}/lots`, { body: { code: "01", name: "Gros œuvre", tradeFamily: "gros_oeuvre" } })).json.lot.id;
  const item = (await admin.request(`/api/admin/projects/${projectId}/work-items`, { body: { code: "GO-01", designation: "Béton armé pour semelles filantes", unit: "m3", lotId } })).json.workItem;
  const measure = (
    await admin.request(`/api/admin/work-items/${item.id}/measurements`, {
      body: { label: "SF1", method: "volume", formula: "L * l * h", inputs: [{ name: "L", value: "42.5" }, { name: "l", value: "0.6" }, { name: "h", value: "0.4" }], unit: "m3" },
    })
  ).json.measurement;
  await admin.request(`/api/admin/measurements/${measure.id}/validate`, { body: { status: "verifie" } });
  const reference = (await admin.request("/api/admin/references", { body: { scope: "MA", kind: "reglement", code: "RPS 2000", title: "Règlement de construction parasismique", version: "2011" } })).json.reference;
  await admin.request(`/api/admin/projects/${projectId}/cctp`, { body: { lotId, detailLevel: "synthetique", useMetre: true, referenceIds: [reference.id], consent: true } });
  cctpId = (await admin.request(`/api/admin/projects/${projectId}/cctp`)).json.items[0].id;
  await admin.request(`/api/admin/projects/${projectId}/dpgf`, { body: { cctpDocumentId: cctpId, vatRate: "20", consent: true } });
  dpgfId = (await admin.request(`/api/admin/projects/${projectId}/dpgf`)).json.items[0].id;
  const lines = (await admin.request(`/api/admin/dpgf/${dpgfId}`)).json.lines as Array<{ id: string; kind: string; designation: string }>;
  await admin.request(`/api/admin/dpgf/lines/${lines.find((l) => l.designation === "Béton armé pour semelles filantes")!.id}`, { method: "PATCH", body: { unitPrice: "1250.50" } });
  // Un poste sans prix : il doit apparaître comme manquant, jamais compté.
  const chapter = lines.find((l) => l.kind === "chapitre")!;
  await admin.request(`/api/admin/dpgf/${dpgfId}/lines`, { body: { kind: "poste", parentId: chapter.id, designation: "Béton de propreté", unit: "m2", quantity: "34" } });
  // Sous-détail établi à la main sur le poste chiffré.
  const beton = lines.find((l) => l.designation === "Béton armé pour semelles filantes")!;
  const breakdown = (await admin.request(`/api/admin/dpgf/lines/${beton.id}/breakdown`, { body: {} })).json.breakdown;
  await admin.request(`/api/admin/breakdowns/${breakdown.id}/components`, { body: { category: "materiau", designation: "Béton C25/30", unit: "m3", quantity: "1.05", unitCost: "950" } });
  // Planche lue, pour le rapport d'analyse.
  const [file] = await ctx.db
    .insert(schema.sourceFile)
    .values({ projectId, kind: "plan", originalName: "Plans.pdf", mimeType: "application/pdf", sizeBytes: 1000, storageKey: `test/${projectId}/plans.pdf`, status: "verifie" })
    .returning();
  await ctx.db.insert(schema.drawing).values({
    projectId,
    sourceFileId: file!.id,
    pageNumber: 2,
    sheetNumber: "A02",
    title: "Plan du rez-de-chaussée",
    kind: "plan_niveau",
    level: "RDC",
    scaleText: "1/50",
    extraction: {
      sheet: { title: "Plan du rez-de-chaussée", number: "A02", kind: "plan_niveau", level: "RDC", scale: "1/50", readable: true },
      elements: [{ category: "fondation", designation: "Semelle filante SF1", location: "Pourtour", count: 1, material: "Béton armé", dimensions: [{ name: "longueur", value: "42.50", unit: "m", source: "cote_lue" }], confidence: "elevee", note: null }],
      notes: ["Béton de propreté sous semelles."],
      uncertainties: ["Hauteur de la semelle non cotée sur cette planche."],
    },
  });
  await admin.request("/api/admin/library/prices", { body: { designation: "Béton C25/30 prêt à l’emploi", kind: "materiau", unit: "m3", unitPrice: "950.5", currency: "MAD", country: "MA", origin: "devis_fournisseur", priceDate: "2026-09-01" } });
  await admin.request(`/api/admin/dpgf/${dpgfId}/versions`, { body: { note: "Avant chiffrage" } });
});

describe("CCTP", () => {
  it("rend le même contenu en Word et en PDF, avec sommaire et pagination", async () => {
    const pdf = await get(`cctp/${cctpId}/pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(pdf.bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    expect(await pages(pdf.bytes)).toBeGreaterThanOrEqual(5);
    const text = await pdfText(pdf.bytes);
    for (const expected of ["CCTP, lot 01 Gros œuvre", "Centre culturel", "Agence urbaine", "Fès, Maroc", "Sommaire", "1.1 Objet du présent CCTP", "Les travaux sont exécutés conformément à RPS 2000.", "Implantation contrôlée", "Annexe : références citées", "Règlement de construction parasismique", "Page 2 sur"]) {
      expect(text, expected).toContain(expected);
    }
    const docx = await get(`cctp/${cctpId}/docx`);
    expect(docx.status).toBe(200);
    const xml = await (await JSZip.loadAsync(docx.bytes)).file("word/document.xml")!.async("string");
    expect(xml).toContain("Les travaux sont exécutés conformément à RPS 2000.");
    // Polices du site embarquées dans le document Word.
    const parts = Object.keys((await JSZip.loadAsync(docx.bytes)).files);
    expect(parts.some((p) => /word\/fonts\//.test(p))).toBe(true);
  });

  it("propose une version sombre de présentation", async () => {
    const clair = await get(`cctp/${cctpId}/pdf`);
    const sombre = await get(`cctp/${cctpId}/pdf?theme=sombre`);
    expect(sombre.status).toBe(200);
    expect(await pages(sombre.bytes)).toBe(await pages(clair.bytes));
    expect(Buffer.compare(Buffer.from(sombre.bytes), Buffer.from(clair.bytes))).not.toBe(0);
    const docx = await get(`cctp/${cctpId}/docx?theme=sombre`);
    const settings = await (await JSZip.loadAsync(docx.bytes)).file("word/settings.xml")!.async("string");
    expect(settings).toContain("displayBackgroundShape");
  });
});

describe("documents de la DPGF", () => {
  it("DPGF : PDF fidèle, taux de taxe lisible, poste manquant signalé", async () => {
    const text = await pdfText((await get(`dpgf/${dpgfId}/pdf`)).bytes);
    expect(text).toContain("Béton armé pour semelles filantes");
    expect(text).toContain("Taxe sur la valeur ajoutée (20 %)");
    expect(text).toContain("Points à compléter");
    expect(text).toContain("à chiffrer");
    const wb = await workbook((await get(`dpgf/${dpgfId}/xlsx`)).bytes);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["DPGF", "Synthèse"]);
    expect(formulas(wb.getWorksheet("Synthèse")!).some((f) => f.startsWith("'DPGF'!F"))).toBe(true);
  });

  it("BPU : prix en chiffres et en toutes lettres", async () => {
    const wb = await workbook((await get(`bpu/${dpgfId}/xlsx`)).bytes);
    const sheet = wb.getWorksheet("BPU")!;
    const values: unknown[] = [];
    sheet.eachRow((row) => values.push(...(row.values as unknown[])));
    expect(values).toContain(1250.5);
    expect(values).toContain("mille deux cent cinquante dirhams et cinquante centimes");
    const text = await pdfText((await get(`bpu/${dpgfId}/pdf`)).bytes);
    expect(text).toContain("mille deux cent cinquante dirhams et cinquante centimes");
    expect(text).toContain("Bordereau des prix unitaires".toUpperCase().split("").join(" ").slice(0, 3) ? "BPU" : "");
  });

  it("DQE et estimation : formules, totaux et postes non chiffrés", async () => {
    const dqe = await workbook((await get(`dqe/${dpgfId}/xlsx`)).bytes);
    const f = formulas(dqe.getWorksheet("DQE")!);
    expect(f.some((x) => /^IF\(AND\(ISNUMBER\(D\d+\),ISNUMBER\(E\d+\)\),ROUND\(D\d+\*E\d+,2\),""\)$/.test(x))).toBe(true);
    expect(f.some((x) => /^SUBTOTAL\(9,F\d+:F\d+\)$/.test(x))).toBe(true);
    expect(f.some((x) => /^ROUND\(F\d+\*20(\.0+)?\/100,2\)$/.test(x))).toBe(true);
    const estimation = await pdfText((await get(`estimation/${dpgfId}/pdf`)).bytes);
    expect(estimation).toContain("Postes non chiffrés");
    expect(estimation).toContain("Béton de propreté");
    expect(estimation).toContain("ne constitue ni une offre ni un engagement de prix");
    const wb = await workbook((await get(`estimation/${dpgfId}/xlsx`)).bytes);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["DPGF", "Synthèse"]);
  });

  it("sous-détails : composants et prix de vente", async () => {
    const wb = await workbook((await get(`sous_details/${dpgfId}/xlsx`)).bytes);
    const f = formulas(wb.getWorksheet("Sous-détails")!);
    expect(f.some((x) => x.startsWith("IF(ISNUMBER(E"))).toBe(true);
    expect(f.some((x) => x.startsWith("SUMIFS("))).toBe(true);
    const text = await pdfText((await get(`sous_details/${dpgfId}/pdf`)).bytes);
    expect(text).toContain("Béton C25/30");
    expect(text).toContain("Prix de vente unitaire HT");
  });
});

describe("métré et rapports", () => {
  it("note de métrés : formule Excel avec ses valeurs, total, PDF détaillé", async () => {
    const wb = await workbook((await get(`metre/${projectId}/xlsx`)).bytes);
    const f = formulas(wb.getWorksheet("Métré")!);
    expect(f).toContain("ROUND((42.5)*(0.6)*(0.4),4)");
    expect(f.some((x) => x.includes("SUMIFS("))).toBe(true);
    expect(formulas(wb.getWorksheet("Récapitulatif")!).some((x) => x.startsWith("'Métré'!F"))).toBe(true);
    const text = await pdfText((await get(`metre/${projectId}/pdf`)).bytes);
    expect(text).toContain("Béton armé pour semelles filantes");
    expect(text).toContain("L = 42.5");
    expect(text).toMatch(/0\.6 ; h = 0\.4/);
    expect((await get(`metre/${projectId}/docx`)).status).toBe(200);
  });

  it("rapport d'analyse : planches, éléments, sources des cotes, incertitudes", async () => {
    const text = await pdfText((await get(`analyse/${projectId}/pdf`)).bytes);
    expect(text).toContain("Plan du rez-de-chaussée");
    expect(text).toContain("Semelle filante SF1");
    expect(text).toContain("longueur 42.50 m (cote lue)");
    expect(text).toContain("Hauteur de la semelle non cotée sur cette planche.");
    expect((await get(`analyse/${projectId}/docx`)).status).toBe(200);
  });

  it("rapport de contrôle : points relevés, sans valeur de certification", async () => {
    const text = await pdfText((await get(`controle/${projectId}/pdf`)).bytes);
    expect(text).toContain("Rapport de contrôle qualité");
    expect(text).toContain("ne valent ni certification réglementaire");
    expect(text).not.toMatch(/\bconforme\b/i);
  });
});

describe("bibliothèque, versions et dossier complet", () => {
  it("bibliothèque de prix en CSV, Excel et PDF", async () => {
    const csv = await get("bibliotheque/csv?pays=MA");
    expect(csv.status).toBe(200);
    const text = Buffer.from(csv.bytes).toString("utf8");
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain("Code;Désignation;Nature;Portée;Unité;Prix unitaire;Assiette;TVA incluse %;Prix unitaire HT;Devise");
    expect(text).toContain("950,5;MAD");
    expect((await workbook((await get("bibliotheque/xlsx")).bytes)).getWorksheet("Prix")).toBeTruthy();
    expect(await pdfText((await get("bibliotheque/pdf")).bytes)).toContain("Béton C25/30 prêt à l’emploi");
  });

  it("version figée rendue telle qu'à son enregistrement", async () => {
    const versions = (await admin.request(`/api/admin/dpgf/${dpgfId}`)).json.versions as Array<{ id: string; version: number }>;
    const first = versions.find((v) => v.version === 1)!;
    const res = await get(`version/${first.id}/pdf`);
    expect(res.status).toBe(200);
    expect(await pdfText(res.bytes)).toContain("Version enregistrée");
    expect((await get(`version/${first.id}/xlsx`)).status).toBe(200);
    expect((await get(`version/${first.id}/docx`)).status).toBe(400);
  });

  it("dossier complet en ZIP, avec index", async () => {
    const res = await get(`dossier/${projectId}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    const zip = await JSZip.loadAsync(res.bytes);
    const names = Object.keys(zip.files).filter((n) => !n.endsWith("/"));
    for (const folder of ["01 CCTP", "02 DPGF", "03 BPU", "04 DQE", "05 Estimation", "06 Sous-détails", "07 Métrés", "08 Rapports", "09 Versions"]) {
      expect(names.some((n) => n.includes(`/${folder}/`)), folder).toBe(true);
    }
    expect(names.some((n) => n.endsWith(".docx"))).toBe(true);
    expect(names.some((n) => n.endsWith(".xlsx"))).toBe(true);
    const index = await zip.file(names.find((n) => n.endsWith("Contenu du dossier.txt"))!)!.async("string");
    expect(index).toContain("Rapport de contrôle qualité");
    expect(index).not.toContain("non produit");
  });

  it("refuse un format ou un document inconnu", async () => {
    expect((await get(`cctp/${cctpId}/xlsx`)).status).toBe(400);
    expect((await get(`inconnu/${cctpId}/pdf`)).status).toBe(404);
    expect((await get(`cctp/${crypto.randomUUID()}/pdf`)).status).toBe(404);
  });
});

describe("gros document", () => {
  it("rend un CCTP de 240 articles en PDF paginé et en Word", async () => {
    const [document] = await ctx.db.insert(schema.cctpDocument).values({ projectId, title: "CCTP volumineux", country: "MA", phase: "dce", status: "a_valider", currentVersion: 1 }).returning();
    const paragraph = "L’entrepreneur exécute les ouvrages conformément aux plans d’exécution visés, contrôle les supports, consigne les écarts et soumet les adaptations nécessaires avant toute exécution concernée.";
    const sections = [];
    let position = 0;
    for (let c = 1; c <= 20; c++) {
      sections.push({ documentId: document!.id, position: position++, number: String(c), title: `Chapitre ${c}`, kind: "chapitre", content: [] });
      for (let a = 1; a <= 12; a++) {
        sections.push({
          documentId: document!.id,
          position: position++,
          number: `${c}.${a}`,
          title: `Article ${c}.${a}`,
          kind: "article",
          content: [
            { type: "paragraphe", text: paragraph, items: [], referenceIds: [] },
            { type: "exigence", text: "Les tolérances d’exécution sont celles des plans visés.", items: [], referenceIds: [] },
            { type: "liste", text: null, items: ["Réception des supports", "Contrôle géométrique", "Constat contradictoire"], referenceIds: [] },
            { type: "paragraphe", text: paragraph, items: [], referenceIds: [] },
          ],
        });
      }
    }
    await ctx.db.insert(schema.cctpSection).values(sections);
    const started = Date.now();
    const pdf = await get(`cctp/${document!.id}/pdf`);
    expect(pdf.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(60_000);
    const count = await pages(pdf.bytes);
    expect(count).toBeGreaterThan(60);
    const text = await pdfText(pdf.bytes);
    expect(text).toContain("Article 20.12");
    expect(text).toContain(`Page ${count} sur ${count}`);
    expect((await get(`cctp/${document!.id}/docx`)).status).toBe(200);
  }, 120_000);
});
