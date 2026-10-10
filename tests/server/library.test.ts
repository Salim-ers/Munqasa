/**
 * Bibliothèque de prix et agent des sous-détails (fournisseur IA simulé) : historique des valeurs,
 * import CSV et Excel avec lignes refusées, recherche plein texte des prix candidats, sous-détails
 * chiffrés uniquement avec des prix de la bibliothèque, calcul exact, validation, report dans la DPGF.
 */
import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import { setAiProviderForTests } from "../../server/ai/client.js";
import { fakeProvider } from "../../server/ai/fake.js";
import { getDb, schema } from "../../server/db/index.js";
import { runJob, setJobKickerForTests } from "../../server/jobs/runner.js";
import { findCandidates } from "../../server/services/pricing.js";
import { adminSession, setupTestServer, TestBrowser } from "./helpers.js";

let admin: TestBrowser;
const today = new Date().toISOString().slice(0, 10);
const defaults = { kind: "materiau", currency: "MAD", country: "MA", origin: "devis_fournisseur", priceDate: today, tradeFamily: "gros_oeuvre", supplierId: null };

interface Price {
  id: string;
  designation: string;
  kind: string;
  unitPrice: string;
  priceDate: string;
  sourceRef: string | null;
  verificationStatus: string;
  city: string | null;
}

async function addPrice(fields: Record<string, unknown>): Promise<Price> {
  const res = await admin.request("/api/admin/library/prices", { body: { kind: "materiau", currency: "MAD", country: "MA", origin: "devis_fournisseur", priceDate: today, ...fields } });
  expect(res.status).toBe(201);
  return res.json.price;
}

const list = async (query = "") => (await admin.request(`/api/admin/library/prices${query}`)).json as { items: Price[]; total: number };
const csv = (text: string) => Buffer.from(text, "utf-8").toString("base64");

beforeAll(async () => {
  const ctx = await setupTestServer();
  admin = (await adminSession(ctx.app)).browser;
  setJobKickerForTests(async (id) => {
    await runJob(id);
  });
  setAiProviderForTests(fakeProvider);
});

let betonPrice: Price;
let frPrice: Price;

describe("Bibliothèque de prix", () => {
  it("historise chaque nouvelle valeur et remet le prix à vérifier", async () => {
    betonPrice = await addPrice({ designation: "Béton C25/30 prêt à l’emploi pour semelles", unit: "m3", unitPrice: "950", subFamily: "Bétons" });
    expect(betonPrice.verificationStatus).toBe("a_verifier");
    expect((await admin.request(`/api/admin/library/prices/${betonPrice.id}/verify`, { body: { status: "verifie" } })).json.price.verificationStatus).toBe("verifie");
    // Une précision sans changement de valeur garde la vérification.
    expect((await admin.request(`/api/admin/library/prices/${betonPrice.id}`, { method: "PATCH", body: { city: "Casablanca" } })).json.price).toMatchObject({ city: "Casablanca", verificationStatus: "verifie" });
    const changed = await admin.request(`/api/admin/library/prices/${betonPrice.id}`, { method: "PATCH", body: { unitPrice: "980" } });
    expect(changed.json.price).toMatchObject({ unitPrice: "980.0000", verificationStatus: "a_verifier" });
    const history = (await admin.request(`/api/admin/library/prices/${betonPrice.id}/history`)).json.items as Array<{ unitPrice: string; note: string }>;
    expect(history.map((h) => [h.unitPrice, h.note])).toEqual([
      ["980.0000", "Nouvelle valeur"],
      ["950.0000", "Création"],
    ]);
    expect((await admin.request("/api/admin/library/prices", { body: { ...defaults, designation: "Prix nul", unit: "u", unitPrice: "0" } })).status).toBe(400);
  });

  it("filtre par pays et statut, archive et restaure", async () => {
    frPrice = await addPrice({ designation: "Béton C25/30 livré sur chantier", unit: "m3", unitPrice: "145", currency: "EUR", country: "FR" });
    const archived = await addPrice({ designation: "Béton C20/25 ancien tarif", unit: "m3", unitPrice: "800" });
    const rejected = await addPrice({ designation: "Béton C30/37 hors zone", unit: "m3", unitPrice: "1200" });
    await admin.request(`/api/admin/library/prices/${archived.id}/archive`, { body: { archived: true } });
    await admin.request(`/api/admin/library/prices/${rejected.id}/verify`, { body: { status: "rejete" } });

    expect((await list("?pays=FR")).items.map((p) => p.designation)).toEqual(["Béton C25/30 livré sur chantier"]);
    expect((await list("?statut=rejete")).items.map((p) => p.designation)).toEqual(["Béton C30/37 hors zone"]);
    expect((await list()).items.map((p) => p.designation)).not.toContain("Béton C20/25 ancien tarif");
    expect((await list("?archives=1")).items.map((p) => p.designation)).toEqual(["Béton C20/25 ancien tarif"]);
    await admin.request(`/api/admin/library/prices/${archived.id}/archive`, { body: { archived: false } });
    expect((await list()).items.map((p) => p.designation)).toContain("Béton C20/25 ancien tarif");
    await admin.request(`/api/admin/library/prices/${archived.id}/archive`, { body: { archived: true } });
  });

  it("importe un CSV à la française et refuse les lignes illisibles avec leur motif", async () => {
    const file = csv(
      [
        "Code;Désignation;Unité;Prix unitaire;Nature;Date",
        "MO-01;Manœuvre de terrassement;h;45,00;Main-d’œuvre;15/03/2026",
        "CO-01;Coffrage bois pour voiles;m2;125,50;Matériaux;2026-03-01",
        'PE-01;Location pelle hydraulique;jour;"2 400,00";Matériel;',
        ";;m3;12;;",
        "SA-01;Sable de rivière;m3;0;Matériau;",
        "SA-02;Sable de carrière;m3;180;Matériau;31/02/2026",
      ].join("\r\n"),
    );
    const preview = await admin.request("/api/admin/library/prices/import/preview", { body: { fileName: "prix.csv", contentBase64: file } });
    expect(preview.json).toMatchObject({ total: 7, truncated: false });
    expect(preview.json.rows[3]).toEqual(["PE-01", "Location pelle hydraulique", "jour", "2 400,00", "Matériel", ""]);

    const res = await admin.request("/api/admin/library/prices/import", {
      body: { fileName: "prix.csv", contentBase64: file, headerRow: 0, columns: { designation: 1, unit: 2, unitPrice: 3, code: 0, kind: 4, priceDate: 5 }, defaults },
    });
    expect(res.json).toMatchObject({
      imported: 3,
      rejectedCount: 3,
      rejected: [
        { row: 5, reason: "désignation vide" },
        { row: 6, reason: "prix illisible ou nul" },
        { row: 7, reason: "date illisible (31/02/2026)" },
      ],
    });
    const imported = (await list("?q=PE-01")).items[0]!;
    expect(imported).toMatchObject({ kind: "materiel", unitPrice: "2400.0000", priceDate: today, sourceRef: "prix.csv, ligne 4", verificationStatus: "a_verifier" });
    expect((await list("?q=Manœuvre")).items[0]).toMatchObject({ kind: "main_oeuvre", unitPrice: "45.0000", priceDate: "2026-03-15" });
    expect((await list("?q=Coffrage")).items[0]).toMatchObject({ kind: "materiau", unitPrice: "125.5000", priceDate: "2026-03-01" });
  });

  it("lit un CSV exporté sous Windows (encodage Windows-1252)", async () => {
    const file = Buffer.from("Code;Désignation;Unité;Prix\nGR-01;Gravette lavée;m3;210\n", "latin1").toString("base64");
    const preview = await admin.request("/api/admin/library/prices/import/preview", { body: { fileName: "export.csv", contentBase64: file } });
    expect(preview.json.rows).toEqual([
      ["Code", "Désignation", "Unité", "Prix"],
      ["GR-01", "Gravette lavée", "m3", "210"],
    ]);
  });

  it("importe un classeur Excel, feuille choisie et dates Excel comprises", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Notes").addRow(["Tarifs 2026"]);
    const sheet = workbook.addWorksheet("Prix");
    sheet.addRow(["Désignation", "Unité", "Prix", "Date"]);
    sheet.addRow(["Gravier concassé 15/25", "m3", 260, new Date(Date.UTC(2026, 1, 10))]);
    sheet.addRow(["Ciment CPJ 45 en sacs", "t", 1450.5, new Date(Date.UTC(2026, 1, 12))]);
    const file = Buffer.from(await workbook.xlsx.writeBuffer()).toString("base64");

    const preview = await admin.request("/api/admin/library/prices/import/preview", { body: { fileName: "tarifs.xlsx", contentBase64: file, sheet: "Prix" } });
    expect(preview.json).toMatchObject({ sheets: ["Notes", "Prix"], sheet: "Prix", total: 3 });
    expect(preview.json.rows[1]).toEqual(["Gravier concassé 15/25", "m3", "260", "2026-02-10"]);

    const res = await admin.request("/api/admin/library/prices/import", {
      body: { fileName: "tarifs.xlsx", contentBase64: file, sheet: "Prix", headerRow: 0, columns: { designation: 0, unit: 1, unitPrice: 2, code: null, kind: null, priceDate: 3 }, defaults },
    });
    expect(res.json).toMatchObject({ imported: 2, rejectedCount: 0 });
    expect((await list("?q=Ciment")).items[0]).toMatchObject({ unitPrice: "1450.5000", priceDate: "2026-02-12", kind: "materiau" });
    expect((await admin.request("/api/admin/library/prices/import/preview", { body: { fileName: "faux.xlsx", contentBase64: csv("pas un classeur") } })).status).toBe(400);
  });

  it("cherche les prix candidats en plein texte, dans la même devise et le même pays", async () => {
    const db = await getDb();
    const names = async (text: string) => (await findCandidates(db, { text, currency: "MAD", country: "MA" })).map((c) => c.designation);
    const found = await names("Béton armé pour semelles filantes");
    expect(found).toContain("Béton C25/30 prêt à l’emploi pour semelles");
    // Autre devise, prix archivé, prix rejeté : jamais proposés.
    expect(found).not.toContain("Béton C25/30 livré sur chantier");
    expect(found).not.toContain("Béton C20/25 ancien tarif");
    expect(found).not.toContain("Béton C30/37 hors zone");
    // Sans accents comme avec.
    expect(await names("beton pour semelle")).toContain("Béton C25/30 prêt à l’emploi pour semelles");
    expect(await names("Installation de chantier")).toEqual([]);
  });
});

describe("Agent des sous-détails de prix", () => {
  let projectId = "";
  let dpgfId = "";
  let acier: Price;
  let macon: Price;

  interface Component {
    id: string;
    designation: string;
    unit: string;
    unitCost: string | null;
    priceItemId: string | null;
    isHypothesis: boolean;
    sourceNote: string | null;
  }
  interface Breakdown {
    id: string;
    locked: boolean;
    status: string;
    computedUnitPrice: string | null;
    overheadRate: string | null;
    overheadBase: string;
    marginRate: string | null;
    components: Component[];
    result: { prixDeRevient?: string; prixDeVente?: string | null; complete?: boolean };
  }
  interface Data {
    postes: Array<{ line: { id: string; code: string; designation: string }; breakdown: Breakdown | null }>;
    issues: Array<{ message: string; severity: string }>;
  }
  const data = async () => (await admin.request(`/api/admin/dpgf/${dpgfId}/breakdowns`)).json as Data;
  const poste = async (code: string) => (await data()).postes.find((p) => p.line.code === code)!;
  const dpgfLine = async (code: string) =>
    ((await admin.request(`/api/admin/dpgf/${dpgfId}`)).json.lines as Array<{ code: string; unitPrice: string | null; amount: string | null; priceSource: string | null; status: string }>).find((l) => l.code === code)!;

  beforeAll(async () => {
    const project = await admin.request("/api/admin/projects", { body: { name: "Centre de santé", country: "MA", marketType: "appel_offres_ouvert", sector: "public", currency: "MAD" } });
    projectId = project.json.project.id;
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

    acier = await addPrice({ designation: "Acier HA FeE500 façonné pour béton armé", unit: "kg", unitPrice: "14.50" });
    macon = await addPrice({ designation: "Main-d’œuvre maçon qualifié, béton armé", kind: "main_oeuvre", unit: "h", unitPrice: "65" });
    const rates = await admin.request("/api/admin/settings/chiffrage", {
      method: "PUT",
      body: { overheadRate: "10", overheadBase: "debourse_total", contingencyRate: "2", contingencyBase: "debourse_total", marginRate: "8", marginMode: "taux_de_marge" },
    });
    expect(rates.status).toBe(200);
  });

  it("refuse de partir sans l'accord d'envoi des postes", async () => {
    expect((await admin.request(`/api/admin/dpgf/${dpgfId}/breakdowns/generate`, { body: { lineIds: [] } })).status).toBe(400);
  });

  it("décompose chaque poste avec les seuls prix de la bibliothèque et calcule le prix exact", async () => {
    const res = await admin.request(`/api/admin/dpgf/${dpgfId}/breakdowns/generate`, { body: { lineIds: [], consent: true } });
    expect(res.status).toBe(201);
    const job = (await admin.request(`/api/admin/agents/jobs/${res.json.job.id}`)).json.job;
    expect(job.status).toBe("termine");
    expect(job.steps.map((s: { label: string }) => s.label)).toEqual(["Préparation des postes", "Sous-détails des postes, série 1", "Contrôle qualité"]);

    const beton = (await poste("2.1")).breakdown!;
    expect(beton.components.map((c) => c.priceItemId).sort()).toEqual([betonPrice.id, acier.id, macon.id].sort());
    expect(beton.components.every((c) => c.isHypothesis && c.sourceNote?.startsWith("Ratio usuel à confirmer. Prix : "))).toBe(true);
    expect(beton.components.find((c) => c.priceItemId === betonPrice.id)!.sourceNote).toBe(`Ratio usuel à confirmer. Prix : Béton C25/30 prêt à l’emploi pour semelles, Casablanca, relevé le ${today.split("-").reverse().join("/")}`);
    // Béton 1,05 × 980 × 1,05 + acier 1,05 × 14,50 × 1,05 + maçon 2,5 × 65 = 1 258,93625 ;
    // frais généraux 10 % et aléas 2 % du déboursé : 1 410,0086 ; marge 8 % : 1 522,81.
    expect(beton).toMatchObject({ status: "a_valider", overheadRate: "10.0000", marginRate: "8.0000", computedUnitPrice: "1522.8100" });
    expect(beton.result).toMatchObject({ complete: true, prixDeRevient: "1410.0086", prixDeVente: "1522.81" });

    // Aucun prix candidat pour l'installation de chantier : le composant reste à chiffrer.
    const installation = (await poste("1.1")).breakdown!;
    expect(installation).toMatchObject({ status: "brouillon", computedUnitPrice: null });
    expect(installation.components).toMatchObject([{ designation: "Main-d’œuvre de mise en œuvre", unitCost: null, priceItemId: null }]);

    const messages = (await data()).issues.map((i) => i.message);
    expect(messages).toContain("Prix manquant pour Main-d’œuvre de mise en œuvre, poste 1.1 Installation de chantier");
    expect(messages).toContain("Prix à vérifier utilisé : Béton C25/30 prêt à l’emploi pour semelles, poste 2.1 Béton armé pour semelles filantes");
    expect(messages).toContain("4 consommation(s) proposée(s) par l’agent : hypothèses à confirmer.");
  });

  it("refuse de valider un sous-détail incomplet ; un coût saisi le complète", async () => {
    const installation = (await poste("1.1")).breakdown!;
    expect((await admin.request(`/api/admin/breakdowns/${installation.id}/validate`, { body: {} })).status).toBe(409);
    const updated = await admin.request(`/api/admin/breakdown-components/${installation.components[0]!.id}`, { method: "PATCH", body: { unitCost: "60" } });
    expect(updated.json.component).toMatchObject({ unitCost: "60.0000", sourceNote: "Saisie", priceItemId: null });
    // 2 h × 60 = 120 ; frais 12 % : 134,40 ; marge 8 % : 145,152.
    expect((await poste("1.1")).breakdown).toMatchObject({ computedUnitPrice: "145.1500", status: "a_valider" });

    // Le coût d'un prix de la bibliothèque s'entend dans son unité.
    const linked = (await poste("2.1")).breakdown!.components.find((c) => c.priceItemId === betonPrice.id)!;
    expect((await admin.request(`/api/admin/breakdown-components/${linked.id}`, { method: "PATCH", body: { unit: "t" } })).status).toBe(400);
  });

  it("valide et fige le sous-détail, puis reporte son prix dans la DPGF", async () => {
    const beton = (await poste("2.1")).breakdown!;
    expect((await admin.request(`/api/admin/breakdowns/${beton.id}/validate`, { body: {} })).status).toBe(200);
    expect((await poste("2.1")).breakdown).toMatchObject({ locked: true, status: "valide" });
    expect((await data()).issues.map((i) => i.message)).toContain("1 sous-détail(s) validé(s) dont le prix n’est pas encore reporté dans la DPGF.");

    const component = beton.components[0]!;
    expect((await admin.request(`/api/admin/breakdown-components/${component.id}`, { method: "PATCH", body: { quantity: "2" } })).status).toBe(409);
    expect((await admin.request(`/api/admin/breakdown-components/${component.id}`, { method: "DELETE" })).status).toBe(409);
    expect((await admin.request(`/api/admin/breakdowns/${beton.id}`, { method: "PATCH", body: { marginRate: "20" } })).status).toBe(409);
    expect((await admin.request(`/api/admin/breakdowns/${beton.id}/components`, { body: { category: "materiel", designation: "Vibreur", unit: "h", quantity: "0.2", unitCost: "30" } })).status).toBe(409);

    expect((await admin.request(`/api/admin/dpgf/${dpgfId}/apply-breakdowns`, { body: {} })).json).toEqual({ applied: 1 });
    // 10,2 m3 × 1 522,81 = 15 532,662.
    expect(await dpgfLine("2.1")).toMatchObject({ priceSource: "Sous-détail validé", amount: "15532.66", status: "a_verifier" });
    expect(Number((await dpgfLine("2.1")).unitPrice)).toBe(1522.81);
    expect((await admin.request(`/api/admin/dpgf/${dpgfId}/apply-breakdowns`, { body: {} })).json).toEqual({ applied: 0 });
    expect((await data()).issues.map((i) => i.message).filter((m) => m.includes("reporté"))).toEqual([]);
  });

  it("rouvre un sous-détail sans perdre ses assiettes et signale le prix à reporter de nouveau", async () => {
    const beton = (await poste("2.1")).breakdown!;
    await admin.request(`/api/admin/breakdowns/${beton.id}/validate`, { body: { validated: false } });
    expect((await poste("2.1")).breakdown).toMatchObject({ locked: false, status: "a_valider" });
    await admin.request(`/api/admin/breakdowns/${beton.id}`, { method: "PATCH", body: { overheadBase: "debourse_sec" } });
    await admin.request(`/api/admin/breakdowns/${beton.id}`, { method: "PATCH", body: { marginRate: "10" } });
    // Pas de frais de chantier : déboursé sec et total confondus, prix de revient inchangé ; marge 10 % : 1 551,00946.
    expect((await poste("2.1")).breakdown).toMatchObject({ overheadBase: "debourse_sec", marginRate: "10.0000", computedUnitPrice: "1551.0100" });

    await admin.request(`/api/admin/breakdowns/${beton.id}/validate`, { body: {} });
    expect((await data()).issues.map((i) => i.message)).toContain("Prix de la DPGF différent du sous-détail validé, à reporter de nouveau : poste 2.1 Béton armé pour semelles filantes");
    expect((await admin.request(`/api/admin/dpgf/${dpgfId}/apply-breakdowns`, { body: {} })).json).toEqual({ applied: 1 });
    expect(Number((await dpgfLine("2.1")).unitPrice)).toBe(1551.01);
  });

  it("recopie les taux des paramètres dans les seuls sous-détails non validés", async () => {
    await admin.request("/api/admin/settings/chiffrage", {
      method: "PUT",
      body: { overheadRate: "12", overheadBase: "debourse_total", contingencyRate: "2", contingencyBase: "debourse_total", marginRate: "8", marginMode: "taux_de_marge" },
    });
    expect((await admin.request(`/api/admin/dpgf/${dpgfId}/breakdowns/apply-rates`, { body: {} })).json).toEqual({ updated: 1 });
    // Installation : 120 × 1,14 × 1,08 = 147,744 ; le béton validé garde ses taux.
    expect((await poste("1.1")).breakdown).toMatchObject({ overheadRate: "12.0000", computedUnitPrice: "147.7400" });
    expect((await poste("2.1")).breakdown).toMatchObject({ overheadRate: "10.0000", computedUnitPrice: "1551.0100" });
  });

  it("relancé, l'agent laisse intacts les sous-détails validés", async () => {
    const before = (await poste("2.1")).breakdown!;
    const res = await admin.request(`/api/admin/dpgf/${dpgfId}/breakdowns/generate`, { body: { lineIds: [], consent: true } });
    expect((await admin.request(`/api/admin/agents/jobs/${res.json.job.id}`)).json.job.status).toBe("termine");
    const after = (await poste("2.1")).breakdown!;
    expect(after).toMatchObject({ id: before.id, locked: true, computedUnitPrice: "1551.0100" });
    expect((await poste("1.1")).breakdown).toMatchObject({ computedUnitPrice: null, status: "brouillon" });
  });

  it("établit un sous-détail à la main et l'exporte en Excel", async () => {
    const chapter = ((await admin.request(`/api/admin/dpgf/${dpgfId}`)).json.lines as Array<{ id: string; code: string }>).find((l) => l.code === "2")!;
    const line = (await admin.request(`/api/admin/dpgf/${dpgfId}/lines`, { body: { kind: "poste", parentId: chapter.id, designation: "Béton de propreté", unit: "m2", quantity: "34" } })).json.line;
    const created = await admin.request(`/api/admin/dpgf/lines/${line.id}/breakdown`, { body: {} });
    expect(created.status).toBe(201);
    expect(created.json.breakdown).toMatchObject({ overheadRate: "12.0000", marginRate: "8.0000", currency: "MAD" });
    expect((await admin.request(`/api/admin/dpgf/lines/${line.id}/breakdown`, { body: {} })).json.breakdown.id).toBe(created.json.breakdown.id);

    const component = await admin.request(`/api/admin/breakdowns/${created.json.breakdown.id}/components`, {
      body: { category: "materiau", designation: "Béton maigre", unit: "u", quantity: "0.05", priceItemId: betonPrice.id },
    });
    expect(component.json.component).toMatchObject({ unit: "m3", unitCost: "980.0000", sourceNote: "Prix de la bibliothèque", isHypothesis: false });
    // Un prix dans une autre devise ne peut pas chiffrer ce sous-détail.
    expect((await admin.request(`/api/admin/breakdowns/${created.json.breakdown.id}/components`, { body: { category: "materiau", designation: "Béton", unit: "m3", quantity: "1", priceItemId: frPrice.id } })).status).toBe(400);

    const res = await admin.request(`/api/admin/dpgf/${dpgfId}/breakdowns/export.xlsx`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml");
    expect(Buffer.from(res.bytes.subarray(0, 2)).toString()).toBe("PK");
  });

  it("supprime les sous-détails avec leur DPGF", async () => {
    const db = await getDb();
    expect((await db.select().from(schema.priceBreakdown).where(eq(schema.priceBreakdown.projectId, projectId))).length).toBe(3);
    await admin.request(`/api/admin/dpgf/${dpgfId}`, { method: "DELETE" });
    expect((await db.select().from(schema.priceBreakdown).where(eq(schema.priceBreakdown.projectId, projectId))).length).toBe(0);
    expect((await admin.request(`/api/admin/dpgf/${dpgfId}/breakdowns`)).status).toBe(404);
  });
});
