/**
 * Chaîne des agents (phase 8), sur une vraie base PostgreSQL et un fournisseur IA simulé :
 * - déclenchement selon les documents demandés : un devis repris d'une DPGF existante n'appelle aucun agent ;
 * - dépendances vérifiées au lancement (CCTP ou DPGF à reprendre, plans du métré, accord d'envoi) ;
 * - plusieurs lots : un CCTP et une DPGF par lot, étapes nommées par lot ;
 * - recherche de prix : seuls des prix d'ouvrage actuels de la bibliothèque, choisis parmi les candidats ;
 * - identifiants partagés : le devis désigne les postes de la DPGF et en reprend les quantités ;
 * - contrôle avant export : quinze points, verdict jamais favorable avec une anomalie bloquante, statut d'un
 *   document validé malgré une anomalie bloquante signalé, rendu des fichiers contrôlé et daté ;
 * - export complet : contrôle avant export repris dans l'index.
 */
import { and, eq } from "drizzle-orm";
import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { setAiProviderForTests } from "../../server/ai/client.js";
import { fakeProvider } from "../../server/ai/fake.js";
import { schema } from "../../server/db/index.js";
import { nextFreeCode } from "../../server/jobs/handlers/plan-analysis.js";
import { runJob, setJobKickerForTests } from "../../server/jobs/runner.js";
import { adminSession, setupTestServer, type TestBrowser } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setupTestServer>>;
let admin: TestBrowser;
let projectId = "";
let lotGo = "";

interface Step {
  name: string;
  label: string;
  status: string;
  log: Array<{ message: string }>;
}
interface Audit {
  points: Array<{ point: string; label: string; state: string; details: string[]; counts: { bloquante: number; majeure: number } }>;
  verdict: string;
  verdictLabel: string;
  rendering: { checkedAt: string | null; upToDate: boolean; files: number; anomalies: number };
}

const generate = (body: Record<string, unknown>) =>
  admin.request(`/api/admin/projects/${projectId}/dossier/generate`, { body: { fileIds: [], lotId: null, detailLevel: "synthetique", referenceIds: [], vatRate: "20", instructions: null, ...body } });
const lastGeneration = async (id = projectId) => (await admin.request(`/api/admin/projects/${id}/dossier`)).json.generation as { id: string; status: string; steps: Step[] };
const exportAudit = async () => (await admin.request(`/api/admin/projects/${projectId}/dossier/export-audit`)).json.audit as Audit;
const point = (audit: Audit, name: string) => audit.points.find((p) => p.point === name)!;

beforeAll(async () => {
  ctx = await setupTestServer();
  admin = (await adminSession(ctx.app)).browser;
  setJobKickerForTests(async (id) => {
    await runJob(id);
  });
  setAiProviderForTests(fakeProvider);
  const project = await admin.request("/api/admin/projects", { body: { name: "Centre de santé", country: "MA", city: "Rabat", marketType: "appel_offres_ouvert", sector: "public", currency: "MAD" } });
  projectId = project.json.project.id;
  lotGo = (await admin.request(`/api/admin/projects/${projectId}/lots`, { body: { code: "01", name: "Gros œuvre", tradeFamily: "gros_oeuvre" } })).json.lot.id;
});

describe("déclenchement des agents selon les documents demandés", () => {
  it("vérifie les dépendances au lancement, avec des messages utiles", async () => {
    const withoutCctp = await generate({ documents: ["dpgf"], lotIds: [lotGo], consent: true });
    expect(withoutCctp.status).toBe(400);
    expect(withoutCctp.json.fields.documents).toBe("Aucun CCTP pour le lot 01 Gros œuvre : ajoutez le CCTP aux documents à produire.");
    const withoutDpgf = await generate({ documents: ["devis"], lotIds: [lotGo] });
    expect(withoutDpgf.json.fields.documents).toBe("Aucune DPGF pour le lot 01 Gros œuvre : ajoutez la DPGF aux documents à produire.");
    const withoutPlans = await generate({ documents: ["metre", "cctp"], lotIds: [lotGo], consent: true });
    expect(withoutPlans.json.fields.fileIds).toBe("Choisissez les plans à lire pour établir le métré.");
    const withoutConsent = await generate({ documents: ["cctp"], lotIds: [lotGo] });
    expect(withoutConsent.json.fields.consent).toBe("Confirmez l’envoi des plans et des informations de l’affaire à l’API OpenAI.");
    const foreignLot = await generate({ documents: ["cctp"], lotIds: ["7d0c4b8e-3d7a-4f5e-9a51-0c8a1f2b3c4d"], consent: true });
    expect(foreignLot.json.fields.lotIds).toBe("Un des lots choisis n’appartient pas à cette affaire.");
  });

  it("n'exécute que les agents des documents demandés", async () => {
    const res = await generate({ documents: ["cctp", "dpgf"], lotIds: [lotGo], consent: true });
    expect(res.status).toBe(201);
    const job = await lastGeneration();
    expect(job.status).toBe("termine");
    const stages = [...new Set(job.steps.map((s) => s.name.split(":")[0]))];
    expect(stages).toEqual(["cctp", "dpgf", "audit", "rendu"]);
    // Le contrôle des fichiers produits rend chaque document du dossier et le bilan est enregistré.
    expect(job.steps.map((s) => s.name)).toEqual(expect.arrayContaining(["rendu:preparation", "rendu:bilan", "audit:controles"]));
    expect(job.steps.some((s) => s.name.startsWith("rendu:doc:cctp:"))).toBe(true);
    expect(job.steps.find((s) => s.name === "rendu:bilan")!.log[0]!.message).toMatch(/fichier\(s\) contrôlé\(s\)/);
    const checks = await ctx.db.select().from(schema.exportCheck).where(eq(schema.exportCheck.projectId, projectId));
    expect(checks).toHaveLength(1);
    expect(checks[0]!.files.map((f) => f.format).sort()).toEqual(expect.arrayContaining(["docx", "pdf", "xlsx"]));
  });

  it("recherche des prix d'ouvrage actuels pour les postes sans prix, jamais un prix historique ni une valeur réglementaire", async () => {
    await ctx.db.insert(schema.priceItem).values([
      { designation: "Installation de chantier, forfait d’ensemble", kind: "ouvrage", priceScope: "ouvrage_complet", unit: "ens", unitPrice: "18000", currency: "MAD", country: "MA", origin: "devis_fournisseur", priceDate: "2026-09-01", verificationStatus: "verifie", reliability: "haute" },
      { designation: "Installation de chantier, ancien bordereau", kind: "ouvrage", priceScope: "ouvrage_complet", unit: "ens", unitPrice: "9000", currency: "MAD", country: "MA", origin: "dpgf_historique", priceDate: "2019-04-01", verificationStatus: "verifie", reliability: "moyenne" },
      { designation: "Installation de chantier, salaire minimal", kind: "ouvrage", priceScope: "ouvrage_complet", unit: "ens", unitPrice: "17", currency: "MAD", country: "MA", origin: "donnees_publiques", priceDate: "2026-09-01", regulated: true },
    ]);
    const res = await generate({ documents: ["prix"], lotIds: [lotGo], consent: true });
    expect(res.status).toBe(201);
    const job = await lastGeneration();
    expect(job.status).toBe("termine");
    const prix = job.steps.find((s) => s.name === "prix:recherche")!;
    expect(prix.label).toBe("Recherche de prix : Prix des postes dans la bibliothèque");
    expect(prix.log.at(-1)!.message).toMatch(/1 prix appliqué\(s\) depuis la bibliothèque, à vérifier ; 1 poste\(s\) sans prix adapté dans la bibliothèque, à chiffrer\./);
    const [dpgf] = await ctx.db.select().from(schema.dpgf).where(eq(schema.dpgf.projectId, projectId));
    const lines = await ctx.db.select().from(schema.dpgfLine).where(and(eq(schema.dpgfLine.dpgfId, dpgf!.id), eq(schema.dpgfLine.kind, "poste")));
    const installation = lines.find((l) => l.designation === "Installation de chantier")!;
    expect(installation).toMatchObject({ unitPrice: "18000.0000", amount: "18000.00", status: "a_verifier" });
    expect(installation.priceSource).toContain("Bibliothèque : Installation de chantier, forfait d’ensemble");
    expect(installation.priceSource).toContain("proposé par l’agent de recherche de prix");
    expect(lines.find((l) => l.designation !== "Installation de chantier")!.unitPrice).toBeNull();
    const runs = await ctx.db.select().from(schema.agentRun).where(eq(schema.agentRun.jobId, job.id));
    expect(runs.map((r) => r.agent)).toEqual(["chercheur_prix"]);
  });

  it("prépare un devis depuis la DPGF existante sans appeler aucun agent, en partageant les identifiants des postes", async () => {
    const res = await generate({ documents: ["devis"], lotIds: [lotGo] });
    expect(res.status).toBe(201);
    const job = await lastGeneration();
    expect(job.status).toBe("termine");
    expect([...new Set(job.steps.map((s) => s.name.split(":")[0]))]).toEqual(["devis", "audit", "rendu"]);
    expect(await ctx.db.select().from(schema.agentRun).where(eq(schema.agentRun.jobId, job.id))).toHaveLength(0);
    const [quote] = await ctx.db.select().from(schema.quote).where(eq(schema.quote.generationJobId, job.id));
    expect(quote).toMatchObject({ projectId, status: "brouillon", source: "dpgf", lotIds: [lotGo] });
    const devis = job.steps.find((s) => s.name === "devis:creation")!;
    expect(devis.log[0]!.message).toBe(`Devis ${quote!.number} préparé en brouillon : 2 ligne(s), 1 prix repris de la DPGF, 1 à établir.`);
    // Poste à métrer : prix à établir et quantité à préciser, deux points bloquants.
    expect(devis.log[1]!.message).toBe("Contrôle avant export du devis : 2 anomalies bloquantes : aucun document ne peut être déclaré validé tant qu’elles subsistent.");
    // Mêmes postes, mêmes quantités : le devis ne réinvente rien.
    const quoteLines = await ctx.db.select().from(schema.quoteLine).where(and(eq(schema.quoteLine.quoteId, quote!.id), eq(schema.quoteLine.kind, "ligne")));
    const dpgfLines = await ctx.db.select().from(schema.dpgfLine).where(eq(schema.dpgfLine.dpgfId, quote!.dpgfId!));
    for (const ql of quoteLines) {
      const source = dpgfLines.find((l) => l.id === ql.dpgfLineId)!;
      expect(source).toBeTruthy();
      expect(ql.quantity === null ? null : Number(ql.quantity)).toBe(source.quantity === null ? null : Number(source.quantity));
    }
    // Une reprise de l'étape ne crée pas de second devis.
    expect(await ctx.db.select().from(schema.quote).where(eq(schema.quote.projectId, projectId))).toHaveLength(1);

    // Une quantité modifiée à la main ne se dit plus reprise de la DPGF.
    const line = quoteLines.find((l) => l.unitPrice !== null)!;
    await admin.request(`/api/admin/quote-lines/${line.id}`, { method: "PATCH", body: { quantity: "2" } });
    const [edited] = await ctx.db.select().from(schema.quoteLine).where(eq(schema.quoteLine.id, line.id));
    expect(edited).toMatchObject({ quantitySource: "Saisie", dpgfLineId: line.dpgfLineId });
  });

  it("contrôle un devis avant l'export : quinze points, trois formats rendus et relus", async () => {
    const [quote] = await ctx.db.select().from(schema.quote).where(eq(schema.quote.projectId, projectId));
    const res = await admin.request(`/api/admin/quotes/${quote!.id}/controle`, { body: {} });
    expect(res.status).toBe(200);
    const audit = res.json.audit as Audit;
    expect(audit.points).toHaveLength(15);
    expect(audit.rendering).toMatchObject({ upToDate: true, files: 3, anomalies: 0 });
    expect(audit.verdict).toBe("bloquant");
    expect(point(audit, "prix")).toMatchObject({ state: "bloquant" });
    expect(point(audit, "prix").details).toEqual(expect.arrayContaining(["Prix à établir : Ouvrage GO-01"]));
    expect(point(audit, "mise_en_page").state).toBe("conforme");
    expect(point(audit, "pagination").state).toBe("conforme");
    expect(point(audit, "pertes").state).toBe("sans_objet");
  });
});

describe("métré relancé : identifiants d'ouvrages partagés", () => {
  it("numérote un nouvel ouvrage à la suite des codes déjà pris", () => {
    expect(nextFreeCode("GO-01", new Set(["GO-01", "GO-02"]))).toBe("GO-03");
    expect(nextFreeCode("GO-04", new Set(["GO-01"]))).toBe("GO-04");
    expect(nextFreeCode("GO-01", new Set(["GO-01", "GO-07", "SO-12"]))).toBe("GO-08");
    expect(nextFreeCode("Fondations", new Set(["Fondations"]))).toBe("Fondations-2");
  });

  it("conserve un ouvrage vérifié au lieu de le proposer une seconde fois, et ne reprend jamais un code pris", async () => {
    const created = await admin.request("/api/admin/projects", { body: { name: "Hangar", country: "MA", city: "Kénitra", marketType: "appel_offres_ouvert", sector: "prive", currency: "MAD" } });
    const id = created.json.project.id as string;
    const lot = (await admin.request(`/api/admin/projects/${id}/lots`, { body: { code: "01", name: "Gros œuvre", tradeFamily: "gros_oeuvre" } })).json.lot.id as string;
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage([842, 595]);
    page.drawText("Plan de fondations", { x: 50, y: 500, size: 18, font });
    for (const [text, x, y] of [["42.50", 300, 280], ["60", 90, 300], ["Ht 40", 150, 260], ["ECH. 1/100", 600, 60]] as const) page.drawText(text, { x, y, size: 10, font });
    const bytes = new Uint8Array(await pdf.save());
    const upload = await admin.request("/api/admin/files/upload-url", { body: { projectId: id, kind: "plan", fileName: "Fondations.pdf", sizeBytes: bytes.byteLength, contentType: "application/pdf" } });
    await admin.request(upload.json.upload.url, { method: "PUT", raw: bytes, headers: { "content-type": "application/octet-stream" } });
    await admin.request(`/api/admin/files/${upload.json.file.id}/complete`, { body: {} });
    const metre = () => admin.request(`/api/admin/projects/${id}/dossier/generate`, { body: { fileIds: [upload.json.file.id], lotId: null, lotIds: [lot], documents: ["metre"], detailLevel: "synthetique", referenceIds: [], vatRate: null, instructions: null, consent: true } });

    expect((await metre()).status).toBe(201);
    const items = () => ctx.db.select().from(schema.workItem).where(eq(schema.workItem.projectId, id));
    const [first] = await items();
    expect(first).toMatchObject({ code: "GO-01", designation: "Béton armé pour semelles filantes" });
    const [measure] = await ctx.db.select().from(schema.measurement).where(eq(schema.measurement.workItemId, first!.id));
    expect((await admin.request(`/api/admin/measurements/${measure!.id}/validate`, { body: { status: "verifie" } })).status).toBe(200);

    // Relance : l'ouvrage vérifié reste le seul GO-01, avec sa mesure vérifiée.
    expect((await metre()).status).toBe(201);
    let all = await items();
    expect(all.map((i) => i.code)).toEqual(["GO-01"]);
    expect(all[0]!.id).toBe(first!.id);
    const job = await lastGeneration(id);
    const log = job.steps.find((s) => s.name === "lecture:metre")!.log.map((l) => l.message);
    expect(log).toContain("GO-01 Béton armé pour semelles filantes : ouvrage déjà établi, conservé avec ses mesures, non proposé une seconde fois.");

    // Un autre ouvrage porte déjà le code proposé : le nouvel ouvrage prend le code libre suivant.
    await ctx.db.update(schema.workItem).set({ designation: "Longrines", unit: "ml" }).where(eq(schema.workItem.id, first!.id));
    expect((await metre()).status).toBe(201);
    all = await items();
    expect(all.map((i) => i.code).sort()).toEqual(["GO-01", "GO-02"]);
    expect(all.find((i) => i.code === "GO-02")!.designation).toBe("Béton armé pour semelles filantes");
    const relaunch = (await lastGeneration(id)).steps.find((s) => s.name === "lecture:metre")!.log.map((l) => l.message);
    expect(relaunch).toContain("GO-01 déjà pris dans l’affaire : nouvel ouvrage numéroté GO-02.");
  });
});

describe("plusieurs lots", () => {
  it("établit un CCTP et une DPGF par lot, chaque étape nommée par son lot", async () => {
    const other = await admin.request("/api/admin/projects", { body: { name: "Résidence", country: "MA", city: "Salé", marketType: "appel_offres_ouvert", sector: "prive", currency: "MAD" } });
    const id = other.json.project.id as string;
    const go = (await admin.request(`/api/admin/projects/${id}/lots`, { body: { code: "01", name: "Gros œuvre", tradeFamily: "gros_oeuvre" } })).json.lot.id as string;
    const peinture = (await admin.request(`/api/admin/projects/${id}/lots`, { body: { code: "12", name: "Peinture", tradeFamily: "second_oeuvre" } })).json.lot.id as string;
    const res = await admin.request(`/api/admin/projects/${id}/dossier/generate`, { body: { fileIds: [], lotId: null, lotIds: [peinture, go], documents: ["cctp", "dpgf", "devis"], detailLevel: "synthetique", referenceIds: [], vatRate: "20", instructions: null, consent: true } });
    expect(res.status).toBe(201);
    const job = await lastGeneration(id);
    expect(job.status).toBe("termine");
    const labels = job.steps.map((s) => s.label);
    expect(labels).toEqual(expect.arrayContaining(["CCTP, lot 01 Gros œuvre : Plan du CCTP", "CCTP, lot 12 Peinture : Plan du CCTP", "DPGF, lot 12 Peinture : Préparation de la DPGF", "Devis : Devis depuis les DPGF"]));
    // Lots dans l'ordre de l'affaire : gros œuvre d'abord.
    expect(job.steps.findIndex((s) => s.name === "cctp:plan")).toBeLessThan(job.steps.findIndex((s) => s.name === "cctp#1:plan"));
    const cctps = await ctx.db.select().from(schema.cctpDocument).where(eq(schema.cctpDocument.projectId, id));
    const dpgfs = await ctx.db.select().from(schema.dpgf).where(eq(schema.dpgf.projectId, id));
    expect(cctps.map((c) => c.lotId).sort()).toEqual([go, peinture].sort());
    expect(dpgfs.map((d) => d.lotId).sort()).toEqual([go, peinture].sort());
    for (const d of dpgfs) expect(cctps.find((c) => c.id === d.cctpDocumentId)!.lotId).toBe(d.lotId);
    // Un seul devis, une section par lot.
    const [quote] = await ctx.db.select().from(schema.quote).where(eq(schema.quote.projectId, id));
    const sections = await ctx.db.select().from(schema.quoteLine).where(and(eq(schema.quoteLine.quoteId, quote!.id), eq(schema.quoteLine.kind, "section")));
    expect(sections.filter((s) => s.parentId === null).map((s) => s.designation)).toEqual(["Lot 01, Gros œuvre", "Lot 12, Peinture"]);
  });
});

describe("contrôle avant export du dossier", () => {
  it("vérifie les quinze points et dit si le contrôle des fichiers est à jour", async () => {
    let audit = await exportAudit();
    expect(audit.points.map((p) => p.label)).toEqual([
      "Cohérence des ouvrages",
      "Cohérence des lots",
      "Unités",
      "Quantités",
      "Formules",
      "Prix",
      "Pertes",
      "Taxes",
      "Totaux",
      "Doublons",
      "Références des documents",
      "Références réglementaires",
      "Mise en page",
      "Pagination",
      "Statuts",
    ]);
    expect(audit.rendering).toMatchObject({ upToDate: true, anomalies: 0 });
    expect(point(audit, "quantites")).toMatchObject({ state: "reserves" });
    expect(point(audit, "quantites").details).toEqual(expect.arrayContaining(["Quantité à métrer : 2.1 Ouvrage GO-01"]));
    expect(point(audit, "mise_en_page").state).toBe("conforme");
    expect(audit.verdict).toBe("reserves");

    // Montant faux : bloquant, verdict jamais favorable ; contrôle des fichiers caduc après la modification.
    const [dpgf] = await ctx.db.select().from(schema.dpgf).where(eq(schema.dpgf.projectId, projectId));
    const [installation] = await ctx.db.select().from(schema.dpgfLine).where(and(eq(schema.dpgfLine.dpgfId, dpgf!.id), eq(schema.dpgfLine.designation, "Installation de chantier")));
    await ctx.db.update(schema.dpgfLine).set({ amount: "1.00" }).where(eq(schema.dpgfLine.id, installation!.id));
    audit = await exportAudit();
    expect(point(audit, "totaux")).toMatchObject({ state: "bloquant" });
    expect(point(audit, "totaux").details[0]).toBe("Montant enregistré différent de la quantité multipliée par le prix (1 au lieu de 18 000) : 1.1 Installation de chantier");
    expect(audit.verdict).toBe("bloquant");
    expect(audit.verdictLabel).toBe("1 anomalie bloquante : aucun document ne peut être déclaré validé tant qu’elle subsiste");
    expect(audit.rendering.upToDate).toBe(false);
    expect(point(audit, "mise_en_page").state).toBe("non_controle");

    // Document marqué validé malgré l'anomalie : le statut est signalé.
    await ctx.db.update(schema.dpgf).set({ status: "valide" }).where(eq(schema.dpgf.id, dpgf!.id));
    audit = await exportAudit();
    expect(point(audit, "statuts").details).toEqual(expect.arrayContaining([`Document validé alors qu’une anomalie bloquante reste ouverte : ${dpgf!.title}`]));
    // Le contrôle indépendant corrige le montant, rend les fichiers et remet le document à valider.
    const run = await admin.request(`/api/admin/projects/${projectId}/dossier/audit`, { body: {} });
    expect(run.json.job.status).toBe("termine");
    expect(run.json.job.steps.map((s: Step) => s.name)).toEqual(expect.arrayContaining(["recalculs", "rendu:preparation", "rendu:bilan", "controles"]));
    audit = await exportAudit();
    expect(point(audit, "totaux").state).not.toBe("bloquant");
    expect(audit.rendering.upToDate).toBe(true);
    const [after] = await ctx.db.select().from(schema.dpgf).where(eq(schema.dpgf.id, dpgf!.id));
    expect(after!.status).toBe("a_valider");
  });

  it("signale les doublons, les unités et les quantités du métré incohérentes", async () => {
    const [a] = await ctx.db.insert(schema.workItem).values({ projectId, lotId: lotGo, code: "GO-09", designation: "Voile béton", unit: "m3", origin: "saisie" }).returning();
    await ctx.db.insert(schema.workItem).values({ projectId, lotId: lotGo, code: "GO-09", designation: "Dalle béton", unit: "m3", origin: "saisie" });
    await ctx.db.insert(schema.measurement).values({ projectId, lotId: lotGo, workItemId: a!.id, label: "Voile V1", method: "formule", formula: "L*e*h", inputs: { L: "10", e: "0.2", h: "3" }, quantity: "9.0000", grossQuantity: "9.0000", unit: "m2", source: "saisie", status: "a_verifier" });
    const audit = await exportAudit();
    expect(point(audit, "doublons").details).toEqual(expect.arrayContaining(["Code d’ouvrage en double : GO-09 (Voile béton, Dalle béton)"]));
    expect(point(audit, "unites").details).toEqual(expect.arrayContaining(["Mesure dans une autre unité que son ouvrage, non comptée (m2 au lieu de m3) : GO-09 Voile V1"]));
    expect(point(audit, "formules").details).toEqual(expect.arrayContaining(["Quantité enregistrée différente du calcul de sa formule (9 au lieu de 6 m2) : GO-09 Voile V1"]));
  });

  it("reprend le contrôle avant export dans l'index du dossier complet", async () => {
    const res = await admin.request(`/api/admin/exports/dossier/${projectId}`);
    expect(res.status).toBe(200);
    const zip = await JSZip.loadAsync(res.bytes);
    const index = Object.keys(zip.files).find((f) => f.endsWith("Contenu du dossier.txt"))!;
    const text = await zip.file(index)!.async("string");
    expect(text).toContain("Contrôle avant export :");
    expect(text).toContain("Cohérence des ouvrages : ");
    expect(text).toContain("Doublons : réserves, Code d’ouvrage en double : GO-09");
    const audit = await exportAudit();
    expect(audit.rendering.upToDate).toBe(true);
  });
});
