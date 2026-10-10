/**
 * Dossier d'une affaire, sur une vraie base PostgreSQL et un fournisseur IA simulé : chaîne « Générer le
 * dossier » (plans, métré, CCTP, DPGF, sous-détails, contrôle), contrôle indépendant qui corrige les erreurs
 * calculables, niveaux de validation jusqu'à la déclaration professionnelle et retour en arrière après une
 * modification.
 */
import { eq } from "drizzle-orm";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { setAiProviderForTests } from "../../server/ai/client.js";
import { fakeProvider } from "../../server/ai/fake.js";
import { schema } from "../../server/db/index.js";
import { runJob, setJobKickerForTests } from "../../server/jobs/runner.js";
import { pdfPlainText } from "../../server/services/pdf-text.js";
import { adminSession, setupTestServer, type TestBrowser } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setupTestServer>>;
let admin: TestBrowser;
let projectId = "";
let fileId = "";

interface Status {
  level: string;
  levelLabel: string;
  criteria: Array<{ level: string; met: boolean; detail: string | null }>;
  issues: { bloquante: number; majeure: number };
  audit: { upToDate: boolean; fixes: number } | null;
  validation: { signedBy: string; current: boolean } | null;
  documents: Array<{ type: string; id: string; status: string }>;
}

const dossier = async () => (await admin.request(`/api/admin/projects/${projectId}/dossier`)).json as { status: Status; generation: { status: string; steps: Array<{ name: string; label: string; status: string; log: Array<{ message: string }> }> } | null; fixes: Array<{ kind: string; target: string; note: string }>; plans: Array<{ id: string }> };

async function planPdf(): Promise<Uint8Array<ArrayBuffer>> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([842, 595]);
  page.drawText("Plan de fondations", { x: 50, y: 500, size: 18, font });
  for (const [text, x, y] of [["42.50", 300, 280], ["60", 90, 300], ["Ht 40", 150, 260], ["ECH. 1/100", 600, 60]] as const) page.drawText(text, { x, y, size: 10, font });
  return new Uint8Array(await pdf.save());
}

beforeAll(async () => {
  ctx = await setupTestServer();
  admin = (await adminSession(ctx.app)).browser;
  setJobKickerForTests(async (id) => {
    await runJob(id);
  });
  setAiProviderForTests(fakeProvider);
  const project = await admin.request("/api/admin/projects", { body: { name: "Groupe scolaire", country: "MA", city: "Rabat", marketType: "appel_offres_ouvert", sector: "public", currency: "MAD" } });
  projectId = project.json.project.id;
  await admin.request(`/api/admin/projects/${projectId}/lots`, { body: { code: "01", name: "Gros œuvre", tradeFamily: "gros_oeuvre" } });
  const bytes = await planPdf();
  const req = await admin.request("/api/admin/files/upload-url", { body: { projectId, kind: "plan", fileName: "Fondations.pdf", sizeBytes: bytes.byteLength, contentType: "application/pdf" } });
  await admin.request(req.json.upload.url, { method: "PUT", raw: bytes, headers: { "content-type": "application/octet-stream" } });
  await admin.request(`/api/admin/files/${req.json.file.id}/complete`, { body: {} });
  fileId = req.json.file.id;
});

describe("dossier d'une affaire", () => {
  it("part du niveau brouillon et refuse une déclaration de validation prématurée", async () => {
    const d = await dossier();
    expect(d.status).toMatchObject({ level: "brouillon", levelLabel: "Brouillon" });
    expect(d.status.criteria[0]).toMatchObject({ met: false, detail: "aucun CCTP, aucune DPGF" });
    expect(d.plans.map((p) => p.id)).toEqual([fileId]);
    const early = await admin.request(`/api/admin/projects/${projectId}/dossier/validate`, { body: { signedBy: "S. Talab", qualification: "Économiste de la construction", statement: true } });
    expect(early.status).toBe(409);
  });

  it("exige l'accord d'envoi des données à l'API", async () => {
    const res = await admin.request(`/api/admin/projects/${projectId}/dossier/generate`, { body: { fileIds: [fileId], lotId: null, detailLevel: "synthetique", referenceIds: [], vatRate: "20", instructions: null, withSousDetails: true } });
    expect(res.status).toBe(400);
    expect(res.json.fields.consent).toBeTruthy();
  });

  it("génère le dossier complet en un traitement, chaque agent à son tour, puis le contrôle indépendant", async () => {
    const res = await admin.request(`/api/admin/projects/${projectId}/dossier/generate`, {
      body: { fileIds: [fileId], lotId: null, detailLevel: "synthetique", referenceIds: [], vatRate: "20", instructions: null, withSousDetails: true, consent: true },
    });
    expect(res.status).toBe(201);
    const d = await dossier();
    expect(d.generation!.status).toBe("termine");
    const labels = d.generation!.steps.map((s) => s.label);
    expect(labels[0]).toBe("Plans et métré : Préparation des pages");
    expect(labels).toEqual(expect.arrayContaining(["Plans et métré : Lecture d’une page", "Plans et métré : Métré des ouvrages", "CCTP : Plan du CCTP", "DPGF : Préparation de la DPGF", "Contrôle indépendant : Contrôles qualité et niveau de validation"]));
    // Bibliothèque vide : les sous-détails sont écartés, avec leur motif.
    const sous = d.generation!.steps.find((s) => s.name === "sousdetail:preparation")!;
    expect(sous.log.map((l) => l.message)).toEqual(["Aucun prix utilisable dans la bibliothèque pour MA en MAD : sous-détails non établis."]);
    expect(d.status.documents.map((x) => x.type).sort()).toEqual(["cctp", "dpgf"]);
    expect(d.status.audit).toMatchObject({ upToDate: true });
    // Métré à vérifier et postes sans prix : le dossier n'est pas prêt pour la validation professionnelle.
    expect(["terminee_avec_reserves", "verification_automatique_reussie"]).toContain(d.status.level);
    expect(d.status.criteria[2]!.met).toBe(false);
    const [metreItem] = await ctx.db.select().from(schema.workItem).where(eq(schema.workItem.projectId, projectId));
    expect(metreItem).toMatchObject({ code: "GO-01" });
  });

  it("corrige les erreurs calculables et les journalise, sans toucher à ce qui ne se calcule pas", async () => {
    const [measure] = await ctx.db.select().from(schema.measurement).where(eq(schema.measurement.projectId, projectId));
    await ctx.db.update(schema.measurement).set({ quantity: "99.0000" }).where(eq(schema.measurement.id, measure!.id));
    const dpgfId = (await dossier()).status.documents.find((x) => x.type === "dpgf")!.id;
    const lines = await ctx.db.select().from(schema.dpgfLine).where(eq(schema.dpgfLine.dpgfId, dpgfId));
    const fromMetre = lines.find((l) => l.quantitySource?.startsWith("Métré"))!;
    await ctx.db.update(schema.dpgfLine).set({ quantity: "5.0000", unitPrice: "1000", amount: "1.00" }).where(eq(schema.dpgfLine.id, fromMetre.id));

    const res = await admin.request(`/api/admin/projects/${projectId}/dossier/audit`, { body: {} });
    expect(res.json.job.status).toBe("termine");
    const d = await dossier();
    expect(d.fixes.map((f) => f.kind).sort()).toEqual(["mesure", "quantite_dpgf"]);
    expect(d.fixes.find((f) => f.kind === "mesure")!.note).toBe("Quantité recalculée à partir de la formule et des valeurs enregistrées : 99 devient 10.2 m3.");
    const [fixedMeasure] = await ctx.db.select().from(schema.measurement).where(eq(schema.measurement.id, measure!.id));
    expect(fixedMeasure!.quantity).toBe("10.2000");
    const [fixedLine] = await ctx.db.select().from(schema.dpgfLine).where(eq(schema.dpgfLine.id, fromMetre.id));
    // 10,2 m3 × 1 000 = 10 200,00 : quantité reprise du métré et montant recalculés ensemble.
    expect(fixedLine).toMatchObject({ quantity: "10.2000", amount: "10200.00" });
    const recalcul = res.json.job.steps.find((s: { name: string }) => s.name === "recalculs").log.map((l: { message: string }) => l.message);
    expect(recalcul.some((m: string) => m.includes("Quantité reprise du métré mise à jour"))).toBe(true);
    // Le rapport de contrôle téléchargeable reprend le niveau et les corrections.
    const report = await admin.request(`/api/admin/exports/controle/${projectId}/pdf`);
    expect(report.status).toBe(200);
    const text = (await pdfPlainText(new Uint8Array(report.bytes))).join(" ");
    expect(text).toContain("Contrôle indépendant et niveau du dossier");
    expect(text).toContain("2 au dernier contrôle");
    expect(text).toContain("Quantité recalculée à partir de la formule");
  });

  it("monte jusqu'à la validation professionnelle, puis redescend après une modification", async () => {
    // Le professionnel vérifie les mesures, chiffre les postes et valide les documents.
    for (const m of await ctx.db.select().from(schema.measurement).where(eq(schema.measurement.projectId, projectId))) {
      expect((await admin.request(`/api/admin/measurements/${m.id}/validate`, { body: { status: "verifie" } })).status).toBe(200);
    }
    const docs = (await dossier()).status.documents;
    const dpgfId = docs.find((x) => x.type === "dpgf")!.id;
    for (const line of await ctx.db.select().from(schema.dpgfLine).where(eq(schema.dpgfLine.dpgfId, dpgfId))) {
      if (line.kind === "poste" && line.unitPrice === null) expect((await admin.request(`/api/admin/dpgf/lines/${line.id}`, { method: "PATCH", body: { unitPrice: "1500" } })).status).toBe(200);
    }
    await admin.request(`/api/admin/projects/${projectId}/dossier/audit`, { body: {} });
    let d = await dossier();
    expect(d.status.criteria.slice(0, 3).every((c) => c.met)).toBe(true);
    expect(d.status.level).toBe("pret_pour_validation");
    expect(d.status.criteria[3]).toMatchObject({ met: false, detail: "CCTP et DPGF à valider, déclaration de validation à signer" });
    expect((await admin.request(`/api/admin/projects/${projectId}/dossier/validate`, { body: { signedBy: "S. Talab", qualification: "Économiste de la construction", statement: true } })).status).toBe(409);

    for (const doc of docs) expect((await admin.request(`/api/admin/${doc.type}/${doc.id}/validate`, { body: {} })).status).toBe(200);
    const signed = await admin.request(`/api/admin/projects/${projectId}/dossier/validate`, { body: { signedBy: "S. Talab", qualification: "Économiste de la construction", statement: true } });
    expect(signed.status).toBe(200);
    expect(signed.json.status).toMatchObject({ level: "valide_professionnel", validation: { signedBy: "S. Talab", current: true } });
    const [declaration] = await ctx.db.select().from(schema.dossierValidation).where(eq(schema.dossierValidation.projectId, projectId));
    expect(declaration!.statement).toContain("la plateforme ne certifie ni sa qualification ni la conformité réglementaire du dossier");
    expect(declaration!.documents.map((x) => x.type).sort()).toEqual(["cctp", "dpgf"]);

    // Une modification de la DPGF : document à revalider, contrôle caduc, déclaration à renouveler.
    const poste = (await ctx.db.select().from(schema.dpgfLine).where(eq(schema.dpgfLine.dpgfId, dpgfId))).find((l) => l.kind === "poste")!;
    await admin.request(`/api/admin/dpgf/lines/${poste.id}`, { method: "PATCH", body: { unitPrice: "1600" } });
    d = await dossier();
    expect(d.status.level).toBe("terminee_avec_reserves");
    expect(d.status.criteria[1]!.detail).toContain("dossier modifié depuis le dernier contrôle indépendant");
    expect(d.status.validation).toMatchObject({ current: false });
  });
});
