/**
 * Validation V4 (phase 10) : cas de la grille de tests qui ne sont pas couverts ailleurs.
 * - devis détaillé : 80 lignes en sections, descriptions longues, options, deux taux de TVA, remises ; PDF de
 *   plusieurs pages, Word et Excel sans anomalie de rendu, chaque désignation présente dans le PDF ;
 * - DPGF aux descriptions longues : DPGF, BPU, DQE et estimation sans anomalie de rendu ;
 * - totaux multi-lots : devis depuis deux DPGF (TVA 20 % et 10 %), totaux vérifiés au centime ;
 * - conversion d'unités : équivalences et conversions exactes, prix à la tonne appliqué à un poste au kilogramme ;
 * - isolation des affaires : DPGF ou plans d'une autre affaire refusés ;
 * - compatibilité : génération lancée avec l'ancienne forme d'entrée, anomalie enregistrée sans point d'audit.
 */
import { and, eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { setAiProviderForTests } from "../../server/ai/client.js";
import { fakeProvider } from "../../server/ai/fake.js";
import { schema } from "../../server/db/index.js";
import { createJob, runJob, setJobKickerForTests } from "../../server/jobs/runner.js";
import { dossierExportAudit } from "../../server/services/export-audit.js";
import { pdfPlainText } from "../../server/services/pdf-text.js";
import { createQuote, loadQuote, recomputeQuote } from "../../server/services/quotes.js";
import { compatibleUnits, convertPrice, isKnownUnit, normalizeUnit, sameUnit, unitFactor } from "../../server/services/units.js";
import { adminSession, setupTestServer, type TestBrowser } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setupTestServer>>;
let admin: TestBrowser;

const plain = (text: string) => text.replace(/[  ]/g, " ").replace(/\s+/g, " ");
const LONG = "Fourniture et mise en œuvre conformément aux prescriptions du CCTP, y compris toutes sujétions de façonnage, de coupe, de fixation, de calfeutrement et de nettoyage en fin d’intervention, protection des ouvrages voisins, évacuation des déchets en décharge agréée et remise en état des lieux après travaux.";

async function project(name: string, lots: Array<[string, string, string]> = []) {
  const created = await admin.request("/api/admin/projects", { body: { name, country: "MA", city: "Rabat", marketType: "appel_offres_ouvert", sector: "public", currency: "MAD" } });
  const id = created.json.project.id as string;
  const lotIds: string[] = [];
  for (const [code, lotName, tradeFamily] of lots) lotIds.push((await admin.request(`/api/admin/projects/${id}/lots`, { body: { code, name: lotName, tradeFamily } })).json.lot.id);
  return { id, lotIds };
}

/** DPGF saisie directement : un chapitre, des postes chiffrés avec leurs montants. */
async function dpgf(projectId: string, lotId: string | null, vatRate: string, postes: Array<{ designation: string; unit: string; quantity: string; unitPrice: string | null; description?: string }>) {
  const [doc] = await ctx.db.insert(schema.dpgf).values({ projectId, lotId, title: `DPGF ${projectId.slice(0, 4)} ${lotId?.slice(0, 4) ?? ""}`, currency: "MAD", vatRate, status: "a_valider" }).returning();
  const [chapter] = await ctx.db.insert(schema.dpgfLine).values({ dpgfId: doc!.id, position: 0, kind: "chapitre", code: "1", designation: "Travaux" }).returning();
  let position = 1;
  for (const [i, p] of postes.entries()) {
    const amount = p.unitPrice === null ? null : (Math.round(Number(p.quantity) * Number(p.unitPrice) * 100) / 100).toFixed(2);
    await ctx.db.insert(schema.dpgfLine).values({ dpgfId: doc!.id, parentId: chapter!.id, position: position++, kind: "poste", code: `1.${i + 1}`, designation: p.designation, description: p.description ?? null, unit: p.unit, quantity: p.quantity, unitPrice: p.unitPrice, amount, quantitySource: "Saisie", cctpRef: "3.1" });
  }
  return doc!;
}

beforeAll(async () => {
  ctx = await setupTestServer();
  admin = (await adminSession(ctx.app)).browser;
  setJobKickerForTests(async (id) => {
    await runJob(id);
  });
  setAiProviderForTests(fakeProvider);
});

describe("documents longs", () => {
  it("rend un devis détaillé de plusieurs pages sans anomalie, chaque désignation présente", async () => {
    const { id } = await project("Résidence Les Orangers");
    const created = await admin.request("/api/admin/quotes", { body: { mode: "projet", projectId: id, title: "Résidence Les Orangers, tous corps d’état" } });
    expect(created.status).toBe(201);
    const quoteId = created.json.quote.id as string;
    const designations: string[] = [];
    for (const [s, section] of ["Terrassements et fondations", "Gros œuvre et maçonnerie", "Menuiseries extérieures et intérieures", "Revêtements, peinture et finitions"].entries()) {
      const head = await admin.request(`/api/admin/quotes/${quoteId}/lines`, { body: { kind: "section", designation: section } });
      const sectionId = head.json.lines.find((l: { designation: string }) => l.designation === section).id as string;
      for (let i = 1; i <= 20; i++) {
        const designation = `${section.split(" ")[0]} poste ${s + 1}.${i}, ouvrage détaillé de référence ${String(i).padStart(2, "0")}`;
        designations.push(designation);
        const res = await admin.request(`/api/admin/quotes/${quoteId}/lines`, {
          body: { kind: "ligne", parentId: sectionId, designation, description: i % 3 === 0 ? LONG : null, unit: ["m2", "m3", "ml", "u", "ens"][i % 5], quantity: String(10 + i * 3.25), unitPrice: String(45 + i * 12.5), vatRate: i % 4 === 0 ? "10" : "20", discountRate: i % 7 === 0 ? "5" : null },
        });
        expect(res.status).toBe(201);
      }
    }
    await admin.request(`/api/admin/quotes/${quoteId}/lines`, { body: { kind: "option", designation: "Option, volets roulants motorisés", description: LONG, unit: "u", quantity: "24", unitPrice: "1850" } });
    await admin.request(`/api/admin/quotes/${quoteId}`, { method: "PATCH", body: { discountRate: "3", validityDays: 60, paymentTerms: "Paiement à 30 jours." } });
    const detail = (await admin.request(`/api/admin/quotes/${quoteId}`)).json;
    expect(detail.totals.state).toBe("complet");
    expect(detail.totals.vat.map((v: { rate: string }) => Number(v.rate))).toEqual([10, 20]);

    for (const format of ["pdf", "docx", "xlsx"] as const) {
      const res = await admin.request(`/api/admin/quotes/${quoteId}/export/${format}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("x-talab-mise-en-page"), format).toBe("0");
      if (format === "pdf") {
        const pages = (await PDFDocument.load(res.bytes)).getPageCount();
        expect(pages).toBeGreaterThanOrEqual(4);
        // Le contrôle de rendu relit chaque texte à ses coordonnées (aucune anomalie, donc rien de tronqué) ;
        // ici, chaque ligne du devis se retrouve par son numéro de poste, la désignation passant à la ligne dans sa cellule.
        const text = plain((await pdfPlainText(new Uint8Array(res.bytes))).join(" "));
        for (const d of designations) expect(text, d).toContain(/poste \d+\.\d+,/.exec(d)![0]);
        expect(text).toContain("Option, volets roulants motorisés");
        expect(text).toMatch(/Page \d+ sur \d+/);
      }
    }
  });

  it("rend une DPGF aux descriptions longues et ses documents dérivés sans anomalie", async () => {
    const { id, lotIds } = await project("Collège de Témara", [["01", "Gros œuvre", "gros_oeuvre"]]);
    const doc = await dpgf(
      id,
      lotIds[0]!,
      "20",
      Array.from({ length: 45 }, (_, i) => ({ designation: `Béton armé pour élément de structure numéro ${i + 1}, classe d’exposition XC2, dosage et armatures selon notes de calcul`, description: LONG, unit: "m3", quantity: String(5 + i), unitPrice: i % 6 === 0 ? null : String(1200 + i * 10) })),
    );
    for (const kind of ["dpgf", "bpu", "dqe", "estimation"]) {
      for (const format of ["pdf", "xlsx"]) {
        const res = await admin.request(`/api/admin/exports/${kind}/${doc.id}/${format}`);
        expect(res.status, `${kind} ${format}`).toBe(200);
        expect(res.headers.get("x-talab-mise-en-page"), `${kind} ${format}`).toBe("0");
      }
    }
  });
});

describe("totaux multi-lots", () => {
  it("additionne deux lots à des taux de TVA différents, au centime près", async () => {
    const { id, lotIds } = await project("Groupe scolaire de Salé", [
      ["01", "Gros œuvre", "gros_oeuvre"],
      ["12", "Peinture", "second_oeuvre"],
    ]);
    const a = await dpgf(id, lotIds[0]!, "20", [
      { designation: "Béton armé en fondation", unit: "m3", quantity: "10", unitPrice: "1250.50" },
      { designation: "Regards de visite", unit: "u", quantity: "3", unitPrice: "333.33" },
    ]);
    const b = await dpgf(id, lotIds[1]!, "10", [
      { designation: "Peinture acrylique sur murs", unit: "m2", quantity: "120.5", unitPrice: "18.40" },
      { designation: "Préparation des supports", unit: "ens", quantity: "1", unitPrice: "1500" },
    ]);
    const quote = await createQuote(ctx.db, { mode: "dpgf", projectId: id, dpgfIds: [a.id, b.id], dpgfId: a.id, lotIds });
    const totals = await recomputeQuote(ctx.db, quote.id);
    // 10 × 1 250,50 + 3 × 333,33 = 13 504,99 ; 120,5 × 18,40 + 1 500 = 3 717,20.
    expect(totals.linesTotal).toBe("17222.19");
    // 20 % de 13 504,99 = 2 700,998 arrondi à 2 701,00 ; 10 % de 3 717,20 = 371,72.
    expect(totals.vat).toEqual([
      { rate: "10", base: "3717.20", amount: "371.72" },
      { rate: "20", base: "13504.99", amount: "2701.00" },
    ]);
    expect(totals.totalVat).toBe("3072.72");
    expect(totals.totalTtc).toBe("20294.91");
    const { quote: row, lines } = await loadQuote(ctx.db, quote.id);
    expect(row.vatRate).toBeNull();
    const sections = lines.filter((l) => l.kind === "section" && l.parentId === null);
    expect(sections.map((s) => [s.designation, totals.sections[s.id]!.total])).toEqual([
      ["Lot 01, Gros œuvre", "13504.99"],
      ["Lot 12, Peinture", "3717.20"],
    ]);
  });
});

describe("conversion d'unités", () => {
  it("rapproche les écritures d'une même unité et convertit exactement dans une même grandeur", () => {
    expect([normalizeUnit("m²"), normalizeUnit("M2"), normalizeUnit("m"), normalizeUnit("forfait"), normalizeUnit("FF")]).toEqual(["m2", "m2", "ml", "ens", "ens"]);
    expect(sameUnit("m³", "m3")).toBe(true);
    expect(isKnownUnit("pm")).toBe(true);
    expect(isKnownUnit("barre")).toBe(false);
    expect(unitFactor("t", "kg")!.toFixed()).toBe("1000");
    expect(unitFactor("cm", "m")!.toFixed()).toBe("0.01");
    expect(unitFactor("l", "m3")!.toFixed()).toBe("0.001");
    // Grandeurs différentes, ou équivalence propre au chantier : jamais convertie.
    expect(unitFactor("m2", "m3")).toBeNull();
    expect(unitFactor("h", "j")).toBeNull();
    expect(compatibleUnits("ens", "u")).toBe(false);
    expect(convertPrice("1200", "t", "kg")).toBe("1.2000");
    expect(convertPrice("0.85", "l", "m3")).toBe("850.0000");
    expect(convertPrice("45", "m2", "m3")).toBeNull();
  });

  it("applique un prix à la tonne à un poste au kilogramme, avec la conversion dans la provenance", async () => {
    const { id, lotIds } = await project("Halle couverte", [["01", "Gros œuvre", "gros_oeuvre"]]);
    const doc = await dpgf(id, lotIds[0]!, "20", [
      { designation: "Armatures HA FeE500", unit: "kg", quantity: "2500", unitPrice: null },
      { designation: "Chape de ragréage", unit: "kg", quantity: "100", unitPrice: null },
    ]);
    const [steel, screed] = await ctx.db
      .insert(schema.priceItem)
      .values([
        { designation: "Acier HA FeE500 façonné et posé", kind: "ouvrage", priceScope: "fourniture_pose", unit: "t", unitPrice: "14000", currency: "MAD", country: "MA", origin: "devis_fournisseur", priceDate: "2026-09-15", verificationStatus: "verifie" },
        { designation: "Chape de ragréage", kind: "ouvrage", priceScope: "fourniture_pose", unit: "m2", unitPrice: "95", currency: "MAD", country: "MA", origin: "devis_fournisseur", priceDate: "2026-09-15", verificationStatus: "verifie" },
      ])
      .returning();
    const lines = await ctx.db.select().from(schema.dpgfLine).where(and(eq(schema.dpgfLine.dpgfId, doc.id), eq(schema.dpgfLine.kind, "poste")));
    const line = (d: string) => lines.find((l) => l.designation === d)!;
    const res = await admin.request(`/api/admin/dpgf/${doc.id}/apply-prices`, {
      body: { assignments: [{ lineId: line("Armatures HA FeE500").id, priceItemId: steel!.id }, { lineId: line("Chape de ragréage").id, priceItemId: screed!.id }] },
    });
    expect(res.json.applied).toBe(1);
    expect(res.json.errors).toEqual([{ lineId: line("Chape de ragréage").id, message: "Unité du prix (m2) différente de celle du poste (kg)." }]);
    const [priced] = await ctx.db.select().from(schema.dpgfLine).where(eq(schema.dpgfLine.id, line("Armatures HA FeE500").id));
    // 14 000 la tonne : 14 le kilogramme ; 2 500 kg × 14 = 35 000,00.
    expect(priced).toMatchObject({ unitPrice: "14.0000", amount: "35000.00" });
    expect(priced!.priceSource).toContain("converti de 14 000 par t en 14 par kg");
    // Prix converti exactement : aucune anomalie d'unité pour ce poste.
    const issues = await ctx.db.select().from(schema.qualityIssue).where(eq(schema.qualityIssue.documentId, doc.id));
    expect(issues.filter((i) => i.message.includes("Unité du prix de bibliothèque"))).toEqual([]);
  });
});

describe("isolation des affaires", () => {
  it("refuse une DPGF ou des plans d'une autre affaire", async () => {
    const a = await project("Affaire A");
    const b = await project("Affaire B", [["01", "Gros œuvre", "gros_oeuvre"]]);
    const foreign = await dpgf(b.id, b.lotIds[0]!, "20", [{ designation: "Béton", unit: "m3", quantity: "1", unitPrice: "1000" }]);
    const quote = await admin.request("/api/admin/quotes", { body: { mode: "dpgf", projectId: a.id, dpgfId: foreign.id } });
    expect(quote.status).toBe(400);
    expect(quote.json.fields.devis).toBe("Cette DPGF appartient à une autre affaire.");

    const bytes = new Uint8Array(await (await PDFDocument.create()).save());
    const upload = await admin.request("/api/admin/files/upload-url", { body: { projectId: b.id, kind: "plan", fileName: "B.pdf", sizeBytes: bytes.byteLength, contentType: "application/pdf" } });
    const generation = await admin.request(`/api/admin/projects/${a.id}/dossier/generate`, { body: { fileIds: [upload.json.file.id], lotId: null, documents: ["metre"], detailLevel: "synthetique", referenceIds: [], vatRate: null, instructions: null, consent: true } });
    expect(generation.status).toBe(400);
    expect(generation.json.fields.fileIds).toBe("Un des plans choisis n’appartient pas à cette affaire.");
  });
});

describe("compatibilité avec l'existant", () => {
  it("mène à son terme une génération lancée avec l'ancienne forme d'entrée", async () => {
    const { id, lotIds } = await project("Ancienne génération", [["01", "Gros œuvre", "gros_oeuvre"]]);
    const job = await createJob({ kind: "generation_dossier", projectId: id, input: { fileIds: [], lotId: lotIds[0]!, detailLevel: "synthetique", referenceIds: [], vatRate: "20", instructions: null, withSousDetails: false } });
    const [row] = await ctx.db.select().from(schema.generationJob).where(eq(schema.generationJob.id, job.id));
    expect(row!.status).toBe("termine");
    const steps = (await ctx.db.select().from(schema.generationStep).where(eq(schema.generationStep.jobId, job.id))).map((s) => s.name);
    expect(steps).toEqual(expect.arrayContaining(["cctp:plan", "dpgf:preparation", "audit:recalculs", "audit:controles"]));
    expect(steps.some((s) => s.startsWith("lecture") || s.startsWith("sousdetail"))).toBe(false);
    const dpgfs = await ctx.db.select().from(schema.dpgf).where(eq(schema.dpgf.projectId, id));
    expect(dpgfs.map((d) => d.lotId)).toEqual([lotIds[0]]);
  });

  it("classe une anomalie enregistrée avant le contrôle avant export d'après sa catégorie", async () => {
    const { id } = await project("Anomalie ancienne");
    await ctx.db.insert(schema.qualityIssue).values({ projectId: id, documentType: "devis", documentId: id, severity: "majeure", category: "doublon", message: "Ancienne anomalie de doublon" });
    const audit = await dossierExportAudit(ctx.db, id, { refresh: false });
    const doublons = audit.points.find((p) => p.point === "doublons")!;
    expect(doublons).toMatchObject({ state: "reserves", details: ["Ancienne anomalie de doublon"] });
  });
});
