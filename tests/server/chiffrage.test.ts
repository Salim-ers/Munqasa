/**
 * Corrections du chiffrage (fournisseur IA simulé) : pertes jamais appliquées deux fois, décompositions
 * impossibles signalées sans tableau vide ni total à zéro, coûts inconnus jamais affichés « 0,00 », statut
 * imprimé calculé sur les données, correction des sous-détails déjà enregistrés par le contrôle indépendant.
 */
import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setAiProviderForTests } from "../../server/ai/client.js";
import { fakeBuilder, fakeProvider, setFakeBuilder } from "../../server/ai/fake.js";
import { schema } from "../../server/db/index.js";
import { runJob, setJobKickerForTests } from "../../server/jobs/runner.js";
import { pdfPlainText } from "../../server/services/pdf-text.js";
import { adminSession, setupTestServer, type TestBrowser } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setupTestServer>>;
let admin: TestBrowser;
let projectId = "";
let dpgfId = "";
let betonId = "";
const original = fakeBuilder("sous_detail");

const get = (path: string) => admin.request(`/api/admin/exports/${path}`);
const pdfText = async (bytes: Uint8Array) => (await pdfPlainText(bytes)).join("\n").replace(/\s+/g, " ");
async function cells(bytes: Uint8Array, sheetName: string): Promise<Array<{ value: unknown; formula: string | null; result: unknown }>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  const out: Array<{ value: unknown; formula: string | null; result: unknown }> = [];
  wb.getWorksheet(sheetName)!.eachRow((row) => row.eachCell((cell) => out.push({ value: cell.value, formula: cell.formula ?? null, result: cell.formula ? (cell.value as { result?: unknown }).result : cell.value })));
  return out;
}
type Line = { id: string; code: string; kind: string; designation: string; quantity: string | null; unitPrice: string | null };
const lines = async () => (await admin.request(`/api/admin/dpgf/${dpgfId}`)).json.lines as Line[];
const breakdowns = async () =>
  (await admin.request(`/api/admin/dpgf/${dpgfId}/breakdowns`)).json as {
    postes: Array<{ line: Line; breakdown: { id: string; decomposition: string; missingCharacteristics: string[]; notes: string | null; components: Array<{ id: string; quantity: string; lossRate: string | null; lossMode: string; sourceNote: string }>; result: { state: string; figures: Array<{ grossQuantity: string; amount: string | null }> } } | null }>;
    issues: Array<{ message: string; severity: string }>;
  };

beforeAll(async () => {
  ctx = await setupTestServer();
  admin = (await adminSession(ctx.app)).browser;
  setJobKickerForTests(async (id) => {
    await runJob(id);
  });
  setAiProviderForTests(fakeProvider);
  projectId = (await admin.request("/api/admin/projects", { body: { name: "Résidence", country: "MA", city: "Rabat", marketType: "appel_offres_ouvert", sector: "public", currency: "MAD" } })).json.project.id;
  const lotId = (await admin.request(`/api/admin/projects/${projectId}/lots`, { body: { code: "01", name: "Gros œuvre", tradeFamily: "gros_oeuvre" } })).json.lot.id;
  const item = (await admin.request(`/api/admin/projects/${projectId}/work-items`, { body: { code: "GO-01", designation: "Béton armé pour semelles filantes", unit: "m3", lotId } })).json.workItem;
  const measure = (
    await admin.request(`/api/admin/work-items/${item.id}/measurements`, {
      body: { label: "SF1", method: "volume", formula: "L * l * h", inputs: [{ name: "L", value: "42.5" }, { name: "l", value: "0.6" }, { name: "h", value: "0.4" }], unit: "m3" },
    })
  ).json.measurement;
  await admin.request(`/api/admin/measurements/${measure.id}/validate`, { body: { status: "verifie" } });
  await admin.request(`/api/admin/projects/${projectId}/cctp`, { body: { lotId, detailLevel: "synthetique", useMetre: true, referenceIds: [], consent: true } });
  const cctpId = (await admin.request(`/api/admin/projects/${projectId}/cctp`)).json.items[0].id;
  await admin.request(`/api/admin/projects/${projectId}/dpgf`, { body: { cctpDocumentId: cctpId, vatRate: "20", consent: true } });
  dpgfId = (await admin.request(`/api/admin/projects/${projectId}/dpgf`)).json.items[0].id;
  betonId = (
    await admin.request("/api/admin/library/prices", {
      body: { designation: "Béton prêt à l’emploi pour semelles", kind: "materiau", unit: "m3", unitPrice: "809.2673", currency: "MAD", country: "MA", origin: "devis_fournisseur", priceDate: new Date().toISOString().slice(0, 10) },
    })
  ).json.price.id;
});

afterAll(() => {
  if (original) setFakeBuilder("sous_detail", original);
});

describe("sous-détails : pertes et décompositions", () => {
  it("une consommation qui comprend déjà les pertes n'est pas majorée une seconde fois ; un poste trop peu défini est déclaré impossible", async () => {
    setFakeBuilder("sous_detail", (input) => {
      const postes = JSON.parse(input.slice(input.indexOf("["))) as Array<{ lineId: string; designation: string }>;
      return {
        postes: postes.map((p) =>
          /Béton/.test(p.designation)
            ? {
                lineId: p.lineId,
                components: [
                  { category: "materiau", designation: "Béton prêt à l’emploi", unit: "m3", netQuantity: "1.03", lossRate: "3", priceItemId: betonId, justification: "Pour 1 m³ net, consommation de 1,03 m³ incluant 3 % de pertes de mise en place" },
                  { category: "transport", designation: "Acheminement du béton", unit: "m3", netQuantity: "1", lossRate: null, priceItemId: null, justification: "Transport du volume net" },
                ],
                impossible: null,
                notes: null,
              }
            : { lineId: p.lineId, components: [], impossible: { reason: "Nature des installations non définie dans les pièces.", missing: ["surface des cantonnements", "durée du chantier"] }, notes: null },
        ),
      };
    });
    const res = await admin.request(`/api/admin/dpgf/${dpgfId}/breakdowns/generate`, { body: { lineIds: [], consent: true } });
    expect(res.status).toBe(201);
    expect((await admin.request(`/api/admin/agents/jobs/${res.json.job.id}`)).json.job.status).toBe("termine");

    const data = await breakdowns();
    const beton = data.postes.find((p) => /Béton/.test(p.line.designation))!.breakdown!;
    expect(beton.components[0]).toMatchObject({ quantity: "1.030000", lossRate: "3.0000", lossMode: "incluse" });
    expect(beton.components[0]!.sourceNote).toContain("Pertes de 3 % déjà comprises dans la consommation proposée : appliquées une seule fois");
    // 1,03 × 809,2673 = 833,5453 ; le transport reste à chiffrer : coût partiel.
    expect(beton.result.figures[0]).toMatchObject({ grossQuantity: "1.030000", amount: "833.5453" });
    expect(beton.result.state).toBe("partiel");

    const installation = data.postes.find((p) => /Installation/.test(p.line.designation))!.breakdown!;
    expect(installation).toMatchObject({ decomposition: "impossible", missingCharacteristics: ["surface des cantonnements", "durée du chantier"], components: [] });
    expect(installation.notes).toContain("Nature des installations non définie");
    const messages = data.issues.map((i) => i.message);
    expect(messages).toContain("Décomposition impossible, caractéristiques à confirmer (surface des cantonnements, durée du chantier) : poste 1.1 Installation de chantier");
  });

  it("export PDF et Excel : décomposition impossible dite telle quelle, aucun coût inconnu affiché « 0,00 »", async () => {
    const pdf = await get(`sous_details/${dpgfId}/pdf`);
    expect(pdf.status).toBe(200);
    const text = await pdfText(pdf.bytes);
    expect(text).toContain("Décomposition impossible — caractéristiques à confirmer");
    expect(text).toContain("Caractéristiques à confirmer : surface des cantonnements, durée du chantier.");
    expect(text).toContain("Quantité nette");
    expect(text).toContain("Quantité brute");
    expect(text).toContain("partiel, 833,55 MAD");
    expect(text).toContain("Partiel : 1 composant(s) chiffré(s) sur 2, montants non définitifs");
    expect(text).toContain("taux non saisi");
    expect(text).not.toMatch(/0,00 MAD/);
    expect(text).toContain("Généré avec réserves");

    const xlsx = await get(`sous_details/${dpgfId}/xlsx`);
    const all = await cells(xlsx.bytes, "Sous-détails");
    expect(all.some((c) => typeof c.value === "string" && c.value.startsWith("Décomposition impossible — caractéristiques à confirmer"))).toBe(true);
    // Quantité brute : la consommation saisie comprend les pertes, elle n'est pas majorée.
    expect(all.some((c) => c.value === "oui")).toBe(true);
    expect(all.some((c) => c.formula?.includes('"Déboursé sec, partiel"') && c.result === "Déboursé sec, partiel")).toBe(true);
    expect(all.filter((c) => typeof c.result === "number" && c.result === 0)).toEqual([]);
  });
});

describe("DPGF : totaux et statut imprimé", () => {
  it("sans aucun prix : total « non chiffré », jamais 0,00 ; statut « Généré avec réserves »", async () => {
    const pdf = await pdfText((await get(`dpgf/${dpgfId}/pdf`)).bytes);
    expect(pdf).toContain("non chiffré");
    expect(pdf).not.toMatch(/0,00 MAD/);
    expect(pdf).toContain("Généré avec réserves");
    expect(pdf).not.toMatch(/Statut\s*Validé/i);
    const all = await cells((await get(`dpgf/${dpgfId}/xlsx`)).bytes, "DPGF");
    const totalLabel = all.find((c) => c.formula?.includes('"Total hors taxes : aucun poste chiffré"'))!;
    expect(totalLabel.result).toBe("Total hors taxes : aucun poste chiffré");
    expect(all.filter((c) => typeof c.result === "number" && c.result === 0)).toEqual([]);
  });

  it("une partie des postes chiffrée : total dit partiel", async () => {
    const beton = (await lines()).find((l) => l.kind === "poste" && /Béton/.test(l.designation))!;
    await admin.request(`/api/admin/dpgf/lines/${beton.id}`, { method: "PATCH", body: { unitPrice: "1200" } });
    const pdf = await pdfText((await get(`dpgf/${dpgfId}/pdf`)).bytes);
    // 10,2 × 1 200 = 12 240 ; l'installation de chantier n'est pas chiffrée.
    expect(pdf).toContain("Total hors taxes, partiel : 1 poste(s) non chiffré(s) exclu(s)");
    expect(pdf).toContain("12 240,00 MAD");
    const estimation = await pdfText((await get(`estimation/${dpgfId}/pdf`)).bytes);
    expect(estimation).toContain("partielle : le total n’est pas un montant final");
  });

  it("validée par l'utilisateur et complète : « Prêt pour revue », jamais « Validé » sans déclaration professionnelle", async () => {
    const installation = (await lines()).find((l) => l.kind === "poste" && /Installation/.test(l.designation))!;
    await admin.request(`/api/admin/dpgf/lines/${installation.id}`, { method: "PATCH", body: { unitPrice: "35000" } });
    // Une planche analysée : le dossier s'appuie sur une pièce graphique.
    const [file] = await ctx.db.insert(schema.sourceFile).values({ projectId, kind: "plan", originalName: "Plans.pdf", mimeType: "application/pdf", sizeBytes: 1000, storageKey: `test/${projectId}/plans.pdf`, status: "verifie" }).returning();
    await ctx.db.insert(schema.drawing).values({ projectId, sourceFileId: file!.id, pageNumber: 1, extraction: { sheet: { title: "Fondations", number: "A01", kind: "plan_niveau", level: null, scale: "1/50", readable: true }, elements: [], notes: [], uncertainties: [] } });
    const before = await pdfText((await get(`dpgf/${dpgfId}/pdf`)).bytes);
    expect(before).toContain("Vérification automatique réussie");
    const validated = await admin.request(`/api/admin/dpgf/${dpgfId}/validate`, { body: {} });
    expect([200, 201]).toContain(validated.status);
    const after = await pdfText((await get(`dpgf/${dpgfId}/pdf`)).bytes);
    expect(after).toContain("Prêt pour revue");
    expect(after).not.toContain("Validé par un professionnel");
  });
});

describe("contrôle indépendant : pertes comptées deux fois dans des sous-détails déjà enregistrés", () => {
  it("corrige la consommation qui comprend déjà les pertes, et le journalise", async () => {
    const data = await breakdowns();
    const beton = data.postes.find((p) => /Béton/.test(p.line.designation))!.breakdown!;
    // Donnée enregistrée avant la correction : pertes à la fois dans la consommation et dans le taux.
    await ctx.db.update(schema.priceBreakdownComponent).set({ lossMode: "appliquee" }).where(eq(schema.priceBreakdownComponent.id, beton.components[0]!.id));
    expect((await breakdowns()).postes.find((p) => /Béton/.test(p.line.designation))!.breakdown!.result.figures[0]!.amount).toBe("858.5517");
    const res = await admin.request(`/api/admin/projects/${projectId}/dossier/audit`, { body: {} });
    expect(res.status).toBe(201);
    const dossier = (await admin.request(`/api/admin/projects/${projectId}/dossier`)).json as { fixes: Array<{ kind: string; note: string }> };
    const fix = dossier.fixes.find((f) => f.kind === "pertes")!;
    expect(fix.note).toBe("Pertes de 3 % déjà comprises dans la consommation de 1.03 m3 : elles ne sont plus appliquées une seconde fois (montant 858.5517 devient 833.5453).");
    const corrected = (await breakdowns()).postes.find((p) => /Béton/.test(p.line.designation))!.breakdown!;
    expect(corrected.components[0]!.lossMode).toBe("incluse");
    expect(corrected.result.figures[0]!.amount).toBe("833.5453");
  });
});
