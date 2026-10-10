/**
 * Non-régression des exports : le contenu métier du CCTP (Word) et de la DPGF (Excel) doit survivre à toute
 * refonte de la présentation. Seuls le contenu et les formules sont vérifiés, jamais le style.
 */
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { beforeAll, describe, expect, it } from "vitest";
import { setAiProviderForTests } from "../../server/ai/client.js";
import { fakeProvider } from "../../server/ai/fake.js";
import { runJob, setJobKickerForTests } from "../../server/jobs/runner.js";
import { adminSession, setupTestServer, TestBrowser } from "./helpers.js";

let admin: TestBrowser;
let projectId = "";
let cctpId = "";
let dpgfId = "";

/** Texte des paragraphes d'une partie Word, dans l'ordre. */
async function docxText(bytes: Uint8Array, part = "word/document.xml"): Promise<string[]> {
  const zip = await JSZip.loadAsync(bytes);
  const xml = (await zip.file(part)?.async("string")) ?? "";
  return [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)]
    .map((m) => [...m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((t) => t[1]).join(""))
    .map((t) => t.replace(/&apos;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">"))
    .filter((t) => t.trim());
}

beforeAll(async () => {
  const ctx = await setupTestServer();
  admin = (await adminSession(ctx.app)).browser;
  setJobKickerForTests(async (id) => {
    await runJob(id);
  });
  setAiProviderForTests(fakeProvider);
  const client = (await admin.request("/api/admin/clients", { body: { name: "Commune de test", sector: "public", country: "MA", city: "Rabat" } })).json.client;
  const project = await admin.request("/api/admin/projects", {
    body: { name: "Groupe scolaire Al Amal", country: "MA", city: "Rabat", clientId: client.id, marketType: "appel_offres_ouvert", sector: "public", currency: "MAD" },
  });
  projectId = project.json.project.id;
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
  const lines = (await admin.request(`/api/admin/dpgf/${dpgfId}`)).json.lines as Array<{ id: string; code: string; designation: string }>;
  await admin.request(`/api/admin/dpgf/lines/${lines.find((l) => l.designation === "Béton armé pour semelles filantes")!.id}`, { method: "PATCH", body: { unitPrice: "1250.50" } });
  await admin.request(`/api/admin/dpgf/lines/${lines.find((l) => l.designation === "Installation de chantier")!.id}`, { method: "PATCH", body: { unitPrice: "35000" } });
});

describe("export Word du CCTP", () => {
  it("garde la couverture, le sommaire, les articles, les exigences et l'annexe des références", async () => {
    const res = await admin.request(`/api/admin/cctp/${cctpId}/export.docx`);
    expect(res.status).toBe(200);
    const text = await docxText(res.bytes);
    const all = text.join("\n");
    // Couverture : type de document, titre, affaire, maître d'ouvrage, localisation.
    expect(all).toMatch(/CAHIER DES CLAUSES TECHNIQUES PARTICULI[ÈE]RES/i);
    expect(all).toContain("CCTP, lot 01 Gros œuvre");
    expect(all).toContain("Groupe scolaire Al Amal");
    expect(all).toContain("Commune de test");
    expect(all).toContain("Rabat");
    // Sommaire actualisable et numérotation des chapitres et articles.
    expect(all).toContain("Sommaire");
    const zip = await JSZip.loadAsync(res.bytes);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toMatch(/TOC [^<]*\\o/);
    expect(text).toContain("1 Généralités");
    expect(text).toContain("1.1 Objet du présent CCTP");
    expect(text).toContain("3 Mise en œuvre");
    // Contenu rédigé, exigence citant la référence, annexe.
    expect(all).toContain("Les travaux sont exécutés conformément à RPS 2000.");
    expect(all).toContain("Implantation contrôlée");
    expect(all).toMatch(/Annexe/);
    expect(all).toContain("Règlement de construction parasismique");
    // Pagination dans le pied de page.
    const parts = Object.keys(zip.files).filter((f) => /word\/footer\d*\.xml$/.test(f));
    const footers = (await Promise.all(parts.map((p) => zip.file(p)!.async("string")))).join("");
    expect(footers).toMatch(/PAGE/);
  });
});

describe("export Excel de la DPGF", () => {
  it("garde les quantités numériques, les formules de montant, de sous-total et de taxe", async () => {
    const res = await admin.request(`/api/admin/dpgf/${dpgfId}/export.xlsx`);
    expect(res.status).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(res.bytes) as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet("DPGF")!;
    expect(sheet).toBeTruthy();
    const rows: Array<{ row: ExcelJS.Row; texts: string[] }> = [];
    sheet.eachRow((row) => rows.push({ row, texts: (row.values as unknown[]).map((v) => (v && typeof v === "object" && "formula" in (v as object) ? `=${(v as { formula: string }).formula}` : String(v ?? ""))) }));
    const beton = rows.find((r) => r.texts.some((t) => t.startsWith("Béton armé pour semelles filantes")))!;
    expect(beton).toBeTruthy();
    const cells = beton.row.values as unknown[];
    // Quantité et prix numériques, montant calculé par formule arrondie au centime.
    expect(cells).toContain(10.2);
    expect(cells).toContain(1250.5);
    const amount = cells.find((v) => v && typeof v === "object" && "formula" in (v as object)) as { formula: string; result?: unknown };
    expect(amount.formula).toMatch(/ROUND\([A-Z]+\d+\*[A-Z]+\d+,2\)/);
    // Sous-totaux et totaux sans double compte.
    const formulas = rows.flatMap((r) => r.texts.filter((t) => t.startsWith("=")));
    expect(formulas.some((f) => /^=SUBTOTAL\(9,/.test(f))).toBe(true);
    const totalHt = rows.find((r) => r.texts.some((t) => /Total hors taxes/i.test(t)))!;
    expect(totalHt.texts.some((t) => /^=SUBTOTAL\(9,/.test(t))).toBe(true);
    const vat = rows.find((r) => r.texts.some((t) => /taxe sur la valeur ajoutée|TVA/i.test(t)))!;
    expect(vat.texts.some((t) => /^=ROUND\(.*20.*\/100,2\)$/.test(t))).toBe(true);
    const ttc = rows.find((r) => r.texts.some((t) => /toutes taxes/i.test(t)))!;
    expect(ttc.texts.some((t) => /^=[A-Z]+\d+\+[A-Z]+\d+$/.test(t))).toBe(true);
  });
});
