/**
 * Devis : moteur financier (arrondis, remises, TVA par taux, régimes, acompte, lignes décomposées), création
 * depuis une affaire, une DPGF, le métré et la bibliothèque, contrôles, statuts et versions, duplication,
 * archivage, expiration, instantané des prix, exports contrôlés et préparation par l'IA sans rien inventer.
 */
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { setAiProviderForTests } from "../../server/ai/client.js";
import { fakeBuilder, fakeProvider, setFakeBuilder } from "../../server/ai/fake.js";
import { type Database, schema } from "../../server/db/index.js";
import { runJob, setJobKickerForTests } from "../../server/jobs/runner.js";
import { quantityFromDescription } from "../../server/jobs/handlers/quote-ai.js";
import { pdfPlainText } from "../../server/services/pdf-text.js";
import { computeQuote, type QuoteCalcLine, type QuoteCalcSettings } from "../../server/services/quote-calc.js";
import { adminSession, setupTestServer, type TestBrowser } from "./helpers.js";

let db: Database;
let admin: TestBrowser;

beforeAll(async () => {
  const ctx = await setupTestServer();
  db = ctx.db;
  admin = (await adminSession(ctx.app)).browser;
  setJobKickerForTests(async (id) => {
    await runJob(id);
  });
  setAiProviderForTests(fakeProvider);
});

const BASE: QuoteCalcSettings = {
  vatRate: "20",
  discountRate: null,
  taxRegime: "normal",
  depositRate: null,
  depositAmount: null,
  siteCostsRate: null,
  overheadRate: null,
  overheadBase: "debourse_total",
  contingencyRate: null,
  contingencyBase: "debourse_total",
  marginRate: null,
  marginMode: "taux_de_marge",
};
const line = (id: string, values: Partial<QuoteCalcLine>): QuoteCalcLine => ({ id, kind: "ligne", parentId: null, quantity: null, unitPrice: null, pricingMode: "direct", supplyCost: null, laborCost: null, discountRate: null, vatRate: null, ...values });

describe("Moteur financier des devis", () => {
  it("arrondit au centime, applique remise de ligne, remise globale répartie, TVA par taux et acompte", () => {
    const lines = [
      line("s1", { kind: "section" }),
      // 18,333 arrondi à 18,33 ; 12,5 × 18,33 = 229,125 arrondi à 229,13 ; remise de 10 % : 206,217 arrondi à 206,22.
      line("a", { parentId: "s1", quantity: "12.5", unitPrice: "18.333", discountRate: "10" }),
      line("b", { parentId: "s1", quantity: "3", unitPrice: "1250", vatRate: "10" }),
      line("c", { quantity: "7", unitPrice: "45.5" }),
      line("o", { kind: "option", quantity: "1", unitPrice: "500" }),
    ];
    const t = computeQuote(lines, { ...BASE, discountRate: "5", depositRate: "30" });
    expect(t.lines.a).toMatchObject({ unitPrice: "18.33", gross: "229.13", discount: "22.91", net: "206.22", vatRate: "20" });
    expect(t.lines.b).toMatchObject({ net: "3750.00", vatRate: "10" });
    expect(t.sections.s1).toEqual({ total: "3956.22", complete: true, count: 2 });
    expect(t.linesTotal).toBe("4274.72");
    // Remise globale de 5 % : 213,736 arrondi à 213,74, une seule fois.
    expect(t.globalDiscount).toBe("213.74");
    expect(t.totalHt).toBe("4060.98");
    // Part de la remise sur la base à 20 % : 213,74 × 524,72 ÷ 4 274,72 = 26,24 ; le reste, 187,50, sur la base à 10 %.
    expect(t.vat).toEqual([
      { rate: "10", base: "3562.50", amount: "356.25" },
      { rate: "20", base: "498.48", amount: "99.70" },
    ]);
    expect(t.totalVat).toBe("455.95");
    expect(t.totalTtc).toBe("4516.93");
    expect(t.deposit).toBe("1355.08");
    // Option hors total.
    expect(t.options).toBe("500.00");
    expect(t.state).toBe("complet");
  });

  it("ne complète jamais un total par un zéro : prix ou taux manquant, totaux partiels", () => {
    const partial = computeQuote([line("a", { quantity: "2", unitPrice: "10" }), line("b", { quantity: "1" })], BASE);
    expect(partial).toMatchObject({ state: "partiel", totalHt: "20.00", totalVat: null, totalTtc: null, missing: { prices: 1, quantities: 0, vatRates: 0 } });
    const noRate = computeQuote([line("a", { quantity: "2", unitPrice: "10" })], { ...BASE, vatRate: null });
    expect(noRate).toMatchObject({ state: "partiel", totalTtc: null, missing: { vatRates: 1 } });
    const autoliquidation = computeQuote([line("a", { quantity: "2", unitPrice: "10", vatRate: "20" })], { ...BASE, taxRegime: "autoliquidation" });
    expect(autoliquidation).toMatchObject({ state: "complet", totalVat: "0.00", totalTtc: "20.00", vat: [] });
    const fixedDeposit = computeQuote([line("a", { quantity: "1", unitPrice: "100" })], { ...BASE, depositAmount: "500" });
    expect(fixedDeposit.deposit).toBe("120.00");
  });

  it("chiffre une ligne décomposée : fourniture et pose, frais de chantier, frais généraux, aléas et marge une seule fois", () => {
    const t = computeQuote([line("d", { quantity: "10", pricingMode: "decompose", supplyCost: "40", laborCost: "25" })], {
      ...BASE,
      siteCostsRate: "5",
      overheadRate: "10",
      contingencyRate: "2",
      marginRate: "15",
    });
    // Déboursé sec 65, frais de chantier 3,25, déboursé total 68,25 ; prix de revient 68,25 × 1,12 = 76,44 ; marge de 15 % : 87,906 arrondi à 87,91.
    expect(t.lines.d).toMatchObject({ unitPrice: "87.91", net: "879.10" });
    expect(t.lines.d!.decomposition).toMatchObject({ debourseSec: "65.0000", fraisChantier: "3.2500", overhead: "6.8250", contingency: "1.3650" });
    // Prix direct : aucun coefficient appliqué, jamais de double majoration.
    expect(computeQuote([line("x", { quantity: "1", unitPrice: "100" })], { ...BASE, overheadRate: "10", marginRate: "15" }).lines.x!.unitPrice).toBe("100.00");
  });
});

/* ---------- Données de test ---------- */

let projectId: string;
let lot01: string;
let lot19: string;
let dpgfId: string;
let clientId: string;
let verifiedPrice: string;
let historicalPrice: string;
let ratioPrice: string;

async function seed() {
  const company = await admin.request("/api/admin/company/profiles", {
    body: { label: "Talab France", legalName: "Talab Solutions SAS", country: "FR", defaultCurrency: "EUR", defaultVatRate: "20", paymentTerms: "Paiement à 30 jours fin de mois.", quoteLegalMentions: "Pénalités de retard au taux légal.", city: "Paris", legalIds: { siret: "12345678900011" } },
  });
  expect(company.status).toBe(201);
  const client = await admin.request("/api/admin/clients", { body: { name: "Ville de Rennes", sector: "public", country: "FR", city: "Rennes", address: "Place de la Mairie" } });
  clientId = client.json.client.id;
  const project = await admin.request("/api/admin/projects", { body: { name: "École Jean Moulin", country: "FR", marketType: "consultation_privee", sector: "public", currency: "EUR", city: "Rennes", clientId } });
  projectId = project.json.project.id;
  const [l1, l19] = await db
    .insert(schema.projectLot)
    .values([
      { projectId, code: "01", name: "Gros œuvre", tradeFamily: "gros_oeuvre", position: 1 },
      { projectId, code: "19", name: "Peinture", tradeFamily: "second_oeuvre", position: 2 },
    ])
    .returning();
  lot01 = l1!.id;
  lot19 = l19!.id;
  const [dpgf] = await db.insert(schema.dpgf).values({ projectId, lotId: lot19, title: "DPGF lot 19 Peinture", currency: "EUR", vatRate: "10" }).returning();
  dpgfId = dpgf!.id;
  const [chapter] = await db.insert(schema.dpgfLine).values({ dpgfId, position: 1, kind: "chapitre", code: "1", designation: "Peintures intérieures" }).returning();
  await db.insert(schema.dpgfLine).values([
    { dpgfId, parentId: chapter!.id, position: 2, kind: "poste", code: "1.1", designation: "Peinture acrylique sur murs", unit: "m2", quantity: "320", unitPrice: "21.5", priceSource: "Saisie", quantitySource: "Métré : 4 mesure(s), dont 4 vérifiée(s)", status: "valide" },
    { dpgfId, parentId: chapter!.id, position: 3, kind: "poste", code: "1.2", designation: "Laque sur boiseries", unit: "m2", quantity: "45" },
  ]);
  const [item] = await db.insert(schema.workItem).values({ projectId, lotId: lot01, code: "GO-01", designation: "Voile béton armé 20 cm", unit: "m2" }).returning();
  await db.insert(schema.measurement).values([
    { projectId, lotId: lot01, workItemId: item!.id, label: "Voile A", method: "surface", quantity: "42.5", unit: "m2", source: "saisie", status: "verifie" },
    { projectId, lotId: lot01, workItemId: item!.id, label: "Voile B", method: "surface", quantity: "18", unit: "m2", source: "saisie", status: "a_verifier" },
  ]);
  const [v, h, r] = await db
    .insert(schema.priceItem)
    .values([
      { designation: "Peinture acrylique velours sur murs, fourniture et pose", kind: "ouvrage", priceScope: "fourniture_pose", unit: "m2", unitPrice: "24.6", taxBasis: "TTC", vatRate: "20", currency: "EUR", country: "FR", origin: "devis_fournisseur", priceDate: "2026-09-01", verificationStatus: "verifie", reliability: "haute" },
      { designation: "Peinture glycéro sur boiseries, fourniture et pose", kind: "ouvrage", priceScope: "fourniture_pose", unit: "m2", unitPrice: "31", currency: "EUR", country: "FR", origin: "dpgf_historique", priceDate: "2019-04-01", verificationStatus: "verifie", reliability: "moyenne" },
      { designation: "Prix de revient d’une école au m²", kind: "ratio", priceScope: "ouvrage_complet", unit: "m2", unitPrice: "2600", currency: "EUR", country: "FR", origin: "donnees_publiques", priceDate: "2025-07-01" },
    ])
    .returning();
  verifiedPrice = v!.id;
  historicalPrice = h!.id;
  ratioPrice = r!.id;
}

describe("Création des devis", () => {
  it("prérempli un devis vierge avec l'entité émettrice, jamais un taux supposé", async () => {
    await seed();
    const res = await admin.request("/api/admin/quotes", { body: { mode: "vierge", title: "Petits travaux" } });
    expect(res.status).toBe(201);
    expect(res.json.quote).toMatchObject({ number: expect.stringMatching(/^DEV-\d{4}-\d{4}$/), vatRate: "20.0000", paymentTerms: "Paiement à 30 jours fin de mois.", legalMentions: "Pénalités de retard au taux légal.", currency: "EUR", status: "brouillon", source: "vierge" });
    const detail = (await admin.request(`/api/admin/quotes/${res.json.quote.id}`)).json;
    expect(detail.checks.map((c: { message: string }) => c.message)).toEqual(expect.arrayContaining(["Le devis ne contient aucune ligne chiffrable.", "Client non renseigné.", "Durée de validité à préciser."]));
  });

  it("reprend une DPGF : sections, quantités, prix et provenance ; un poste non chiffré reste à établir", async () => {
    const res = await admin.request("/api/admin/quotes", { body: { mode: "dpgf", dpgfId } });
    expect(res.status).toBe(201);
    const d = (await admin.request(`/api/admin/quotes/${res.json.quote.id}`)).json;
    expect(d.quote).toMatchObject({ projectId, clientId, vatRate: "10.0000", siteName: "École Jean Moulin" });
    const lines = d.lines as Array<{ kind: string; designation: string; quantity: string | null; unitPrice: string | null; priceOrigin: string | null; quantitySource: string | null }>;
    expect(lines.map((l) => l.kind)).toEqual(["section", "ligne", "ligne"]);
    expect(lines[1]).toMatchObject({ quantity: "320.0000", unitPrice: "21.5000", priceOrigin: "DPGF : Saisie" });
    expect(lines[2]).toMatchObject({ unitPrice: null });
    expect(d.totals).toMatchObject({ state: "partiel", totalHt: "6880.00", totalTtc: null });
    expect(d.checks.some((c: { message: string }) => c.message === "Prix à établir : Laque sur boiseries")).toBe(true);
  });

  it("reprend le métré par lot : quantités et provenance, quantité incomplètement vérifiée signalée", async () => {
    const res = await admin.request("/api/admin/quotes", { body: { mode: "metre", projectId, lotIds: [lot01] } });
    const d = (await admin.request(`/api/admin/quotes/${res.json.quote.id}`)).json;
    const lines = d.lines as Array<{ kind: string; designation: string; quantity: string | null; quantitySource: string; unitPrice: string | null }>;
    expect(lines[0]).toMatchObject({ kind: "section", designation: "Lot 01, Gros œuvre" });
    expect(lines[1]).toMatchObject({ designation: "Voile béton armé 20 cm", quantity: "60.5000", quantitySource: "Métré : 2 mesure(s), dont 1 vérifiée(s)", unitPrice: null });
    expect(d.checks.map((c: { message: string }) => c.message)).toEqual(expect.arrayContaining(["Quantité du métré à vérifier : Voile béton armé 20 cm", "Prix à établir : Voile béton armé 20 cm"]));
  });

  it("reprend des prix de la bibliothèque hors taxes, signale un prix historique et refuse un ratio", async () => {
    const res = await admin.request("/api/admin/quotes", { body: { mode: "bibliotheque", priceItemIds: [verifiedPrice, historicalPrice] } });
    expect(res.status).toBe(201);
    const d = (await admin.request(`/api/admin/quotes/${res.json.quote.id}`)).json;
    // 24,60 TTC ramené HT avec la TVA de 20 % qu'il inclut : 20,50.
    expect(d.lines[0]).toMatchObject({ unitPrice: "20.5000", quantity: null, priceItemId: verifiedPrice, quantitySource: "À préciser" });
    expect(d.lines[0].priceOrigin).toMatch(/^Bibliothèque : Devis fournisseur, du 01\/09\/2026$/);
    expect(d.lines[1].priceSnapshot).toMatchObject({ historical: true });
    expect(d.checks.some((c: { message: string; severity: string }) => c.severity === "majeure" && c.message.startsWith("Prix incertain, prix historique"))).toBe(true);
    const ratio = await admin.request("/api/admin/quotes", { body: { mode: "bibliotheque", priceItemIds: [ratioPrice] } });
    expect(ratio.status).toBe(400);
    expect(JSON.stringify(ratio.json)).toMatch(/ratio d’opération/);
  });
});

describe("Cycle de vie d'un devis", () => {
  let quoteId: string;

  it("refuse de déclarer prêt un devis incomplet, puis le vérifie, l'envoie et le verrouille", async () => {
    const created = await admin.request("/api/admin/quotes", { body: { mode: "projet", projectId, lotIds: [lot19] } });
    quoteId = created.json.quote.id;
    const section = (await admin.request(`/api/admin/quotes/${quoteId}`)).json.lines[0];
    await admin.request(`/api/admin/quotes/${quoteId}/lines/library`, { body: { priceItemIds: [verifiedPrice], parentId: section.id } });
    let d = (await admin.request(`/api/admin/quotes/${quoteId}`)).json;
    const paint = d.lines.find((l: { kind: string }) => l.kind === "ligne");
    const refused = await admin.request(`/api/admin/quotes/${quoteId}/valider`, { method: "POST" });
    expect(refused.status).toBe(409);
    expect(JSON.stringify(refused.json)).toMatch(/Quantité à préciser/);
    expect((await admin.request(`/api/admin/quote-lines/${paint.id}`, { method: "PATCH", body: { quantity: "320" } })).status).toBe(200);
    const header = await admin.request(`/api/admin/quotes/${quoteId}`, { method: "PATCH", body: { validityDays: 30, depositRate: "30", discountRate: "5" } });
    expect(header.status).toBe(200);
    d = header.json;
    // 320 × 20,50 = 6 560 ; remise de 5 % : 328 ; HT 6 232 ; TVA 20 % : 1 246,40 ; TTC 7 478,40 ; acompte 2 243,52.
    expect(d.totals).toMatchObject({ state: "complet", totalHt: "6232.00", totalVat: "1246.40", totalTtc: "7478.40", deposit: "2243.52" });
    expect((await admin.request(`/api/admin/quotes/${quoteId}/soumettre`, { method: "POST" })).json.quote.status).toBe("a_verifier");
    expect((await admin.request(`/api/admin/quotes/${quoteId}/valider`, { method: "POST" })).json.quote.status).toBe("valide");
    // Une modification d'un devis prêt à envoyer le renvoie à vérifier.
    await admin.request(`/api/admin/quotes/${quoteId}`, { method: "PATCH", body: { notes: "Travaux en site occupé." } });
    expect((await admin.request(`/api/admin/quotes/${quoteId}`)).json.quote.status).toBe("a_verifier");
    await admin.request(`/api/admin/quotes/${quoteId}/valider`, { method: "POST" });
    const sent = await admin.request(`/api/admin/quotes/${quoteId}/envoyer`, { method: "POST" });
    expect(sent.json.quote).toMatchObject({ status: "envoye", currentVersion: 1 });
    expect(sent.json.quote.lockedAt).not.toBeNull();
    expect(sent.json.quote.issuerSnapshot).toMatchObject({ legalName: "Talab Solutions SAS" });
    expect(sent.json.versions).toHaveLength(1);
    expect((await admin.request(`/api/admin/quotes/${quoteId}`, { method: "PATCH", body: { notes: "Autre" } })).status).toBe(409);
    expect((await admin.request(`/api/admin/quote-lines/${paint.id}`, { method: "PATCH", body: { quantity: "1" } })).status).toBe(409);
  });

  it("conserve la version envoyée quand la bibliothèque ou le devis changent ensuite", async () => {
    await db.update(schema.priceItem).set({ unitPrice: "99" }).where(eq(schema.priceItem.id, verifiedPrice));
    const d = (await admin.request(`/api/admin/quotes/${quoteId}`)).json;
    expect(d.lines.find((l: { kind: string }) => l.kind === "ligne").unitPrice).toBe("20.5000");
    expect(d.totals.totalTtc).toBe("7478.40");
    expect((await admin.request(`/api/admin/quotes/${quoteId}/accepter`, { method: "POST", body: { note: "Bon pour accord reçu" } })).json.quote.status).toBe("accepte");
    const next = await admin.request(`/api/admin/quotes/${quoteId}/nouvelle-version`, { method: "POST" });
    expect(next.json.quote).toMatchObject({ status: "brouillon", lockedAt: null });
    const paint = next.json.lines.find((l: { kind: string }) => l.kind === "ligne");
    await admin.request(`/api/admin/quote-lines/${paint.id}`, { method: "PATCH", body: { quantity: "300" } });
    const version = next.json.versions[0];
    const pdf = await admin.request(`/api/admin/quotes/${quoteId}/versions/${version.id}/export/pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("x-talab-mise-en-page")).toBe("0");
    const events = (await admin.request(`/api/admin/quotes/${quoteId}`)).json.events.map((e: { kind: string }) => e.kind);
    expect(events).toEqual(expect.arrayContaining(["creation", "validation", "envoi", "acceptation", "nouvelle_version"]));
  });

  it("duplique, archive, restaure et fait expirer un devis envoyé dont la validité est dépassée", async () => {
    const copy = await admin.request(`/api/admin/quotes/${quoteId}/dupliquer`, { method: "POST" });
    expect(copy.status).toBe(201);
    expect(copy.json.quote).toMatchObject({ status: "brouillon", currentVersion: 0 });
    expect(copy.json.quote.number).not.toBe((await admin.request(`/api/admin/quotes/${quoteId}`)).json.quote.number);
    expect((await admin.request(`/api/admin/quotes/${copy.json.quote.id}`)).json.lines).toHaveLength(2);
    await admin.request(`/api/admin/quotes/${copy.json.quote.id}/archiver`, { method: "POST" });
    expect(((await admin.request("/api/admin/quotes")).json.items as Array<{ id: string }>).some((i) => i.id === copy.json.quote.id)).toBe(false);
    expect(((await admin.request("/api/admin/quotes?archives=1")).json.items as Array<{ id: string }>).some((i) => i.id === copy.json.quote.id)).toBe(true);
    await admin.request(`/api/admin/quotes/${copy.json.quote.id}/restaurer`, { method: "POST" });

    await db.update(schema.quote).set({ status: "envoye", lockedAt: new Date(), issueDate: "2026-01-02", validityDays: 30 }).where(eq(schema.quote.id, copy.json.quote.id));
    const list = (await admin.request("/api/admin/quotes")).json.items as Array<{ id: string; status: string }>;
    expect(list.find((i) => i.id === copy.json.quote.id)!.status).toBe("expire");
  });
});

describe("Exports des devis", () => {
  it("rend le PDF, le Word et l'Excel sans anomalie de mise en page ni de structure", async () => {
    const created = await admin.request("/api/admin/quotes", { body: { mode: "dpgf", dpgfId, title: "Peintures de l’école" } });
    const id = created.json.quote.id;
    for (const format of ["pdf", "docx", "xlsx"]) {
      const res = await admin.request(`/api/admin/quotes/${id}/export/${format}`);
      expect(res.status, format).toBe(200);
      expect(res.headers.get("x-talab-mise-en-page"), format).toBe("0");
      expect(res.bytes.byteLength).toBeGreaterThan(5000);
    }
  });
});

describe("Montants inconnus", () => {
  it("n'imprime jamais 0,00 pour un total inconnu : le total reste à établir", async () => {
    const q = await admin.request("/api/admin/quotes", { body: { mode: "vierge", title: "Sans prix" } });
    await admin.request(`/api/admin/quotes/${q.json.quote.id}/lines`, { body: { kind: "ligne", designation: "Poste sans prix", unit: "u", quantity: "2" } });
    const pdf = await admin.request(`/api/admin/quotes/${q.json.quote.id}/export/pdf`);
    expect(pdf.headers.get("x-talab-mise-en-page")).toBe("0");
    const text = (await pdfPlainText(pdf.bytes)).join(" ").replace(/[\u00a0\u202f]/g, " ");
    expect(text).toMatch(/Total partiel HT, 1 ligne\(s\) à compléter à établir/);
    expect(text).not.toMatch(/0,00 EUR/);
  });
});

describe("Préparation par l'IA", () => {
  afterEach(() => {
    setFakeBuilder("devis_postes", original.postes!);
    setFakeBuilder("devis_prix", original.prix!);
  });
  const original = { postes: fakeBuilder("devis_postes"), prix: fakeBuilder("devis_prix") };

  it("garde la quantité écrite dans la description et un prix candidat de la bibliothèque", async () => {
    const res = await admin.request("/api/admin/quotes/ia", { body: { description: "Peinture acrylique de 120 m² de murs dans les classes.", projectId, lotIds: [lot19], useDpgf: false, useMetre: false, useCctp: false } });
    expect(res.status).toBe(202);
    const d = (await admin.request(`/api/admin/quotes/${res.json.quote.id}`)).json;
    expect(d.job).toMatchObject({ status: "termine" });
    const paint = d.lines.find((l: { kind: string }) => l.kind === "ligne");
    expect(paint).toMatchObject({ quantity: "120.0000", quantitySource: "Description : « 120 m² de murs dans les classes »" });
    // Prix de la bibliothèque proposé au poste, vérifié et récent ; jamais le prix historique.
    expect(paint.priceItemId).toBe(verifiedPrice);
    expect(d.events.some((e: { kind: string }) => e.kind === "generation")).toBe(true);
  });

  it("écarte une quantité sans source vérifiable et un prix hors des candidats proposés", async () => {
    setFakeBuilder("devis_postes", () => ({
      title: "Travaux",
      postes: [{ key: "p1", section: null, designation: "Peinture des couloirs", description: null, unit: "m2", source: "description", sourceId: null, quantity: "999", quantityQuote: "999 m² de couloirs" }],
      questions: [],
    }));
    setFakeBuilder("devis_prix", () => ({ choices: [{ key: "p1", priceItemId: historicalPrice, justification: "Prix inventé" }] }));
    const res = await admin.request("/api/admin/quotes/ia", { body: { description: "Peinture des couloirs du rez-de-chaussée.", projectId, useDpgf: false, useMetre: false, useCctp: false } });
    const d = (await admin.request(`/api/admin/quotes/${res.json.quote.id}`)).json;
    const lineRow = d.lines.find((l: { kind: string }) => l.kind === "ligne");
    expect(lineRow).toMatchObject({ quantity: null, unitPrice: null, priceItemId: null, quantitySource: "À préciser" });
    expect(quantityFromDescription("Peinture de 120 m² de murs", "120", "120 m²")).toBe("120");
    expect(quantityFromDescription("Peinture de 120 m² de murs", "150", "120 m²")).toBeNull();
    expect(quantityFromDescription("Peinture de 120 m² de murs", "120", "120 m² de plafonds")).toBeNull();
  });
});
