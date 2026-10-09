/**
 * Agent de lecture des plans et exécuteur des traitements longs, sur une vraie base PostgreSQL et un
 * stockage local : PDF de deux pages découpé, relevés, métré calculé par le serveur, reprises, annulation,
 * tranches de temps. Le fournisseur IA est simulé (aucun appel externe).
 */
import { eq } from "drizzle-orm";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { AiConfigError, type AiProvider, AiRetriableError, setAiProviderForTests } from "../../server/ai/client.js";
import { fakeProvider } from "../../server/ai/fake.js";
import { schema } from "../../server/db/index.js";
import { createJob, jobToken, runJob, setJobKickerForTests } from "../../server/jobs/runner.js";
import { adminSession, setupTestServer, TestBrowser } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setupTestServer>>;
let admin: TestBrowser;
let projectId = "";
let fileId = "";

async function makePdf(pages: number): Promise<Uint8Array<ArrayBuffer>> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) pdf.addPage([842, 595]).drawText(`Plan de fondations, page ${i}`, { x: 50, y: 500, size: 18, font });
  return new Uint8Array(await pdf.save());
}

async function upload(name: string, bytes: Uint8Array<ArrayBuffer>) {
  const req = await admin.request("/api/admin/files/upload-url", { body: { projectId, kind: "plan", fileName: name, sizeBytes: bytes.byteLength, contentType: "application/pdf" } });
  await admin.request(req.json.upload.url, { method: "PUT", raw: bytes, headers: { "content-type": "application/octet-stream" } });
  const done = await admin.request(`/api/admin/files/${req.json.file.id}/complete`, { body: {} });
  expect(done.json.file.status).toBe("verifie");
  return req.json.file.id as string;
}

/** Fournisseur simulé dont on peut faire échouer les premiers appels. */
function flakyProvider(failures: Error[]): AiProvider {
  return {
    ...fakeProvider,
    name: "simulation",
    async run(call, model) {
      const failure = failures.shift();
      if (failure) throw failure;
      return fakeProvider.run(call, model);
    },
  };
}

beforeAll(async () => {
  ctx = await setupTestServer();
  admin = (await adminSession(ctx.app)).browser;
  // Exécution maîtrisée : la création d'un traitement l'exécute jusqu'au bout avant de répondre.
  setJobKickerForTests(async (id) => {
    await runJob(id);
  });
  setAiProviderForTests(fakeProvider);
  const project = await admin.request("/api/admin/projects", { body: { name: "Affaire plans", country: "MA", marketType: "appel_offres_ouvert", sector: "public", currency: "MAD" } });
  projectId = project.json.project.id;
  await admin.request(`/api/admin/projects/${projectId}/lots`, { body: { code: "01", name: "Gros œuvre", tradeFamily: "gros_oeuvre" } });
  fileId = await upload("Plans GO.pdf", await makePdf(2));
});

afterEach(() => setAiProviderForTests(fakeProvider));

describe("lecture des plans et métré", () => {
  it("exige la confirmation de l'envoi des plans à l'API", async () => {
    const res = await admin.request(`/api/admin/projects/${projectId}/analyses`, { body: { fileIds: [fileId] } });
    expect(res.status).toBe(400);
    expect(res.json.fields.consent).toBeTruthy();
  });

  it("lit chaque page puis établit le métré calculé par le serveur", async () => {
    const res = await admin.request(`/api/admin/projects/${projectId}/analyses`, { body: { fileIds: [fileId], consent: true } });
    expect(res.status).toBe(201);
    const job = (await admin.request(`/api/admin/agents/jobs/${res.json.job.id}`)).json.job;
    expect(job.status).toBe("termine");
    expect(job.steps.map((s: { label: string }) => s.label)).toEqual(["Préparation des pages", "Lecture d’une page (1 sur 2)", "Lecture d’une page (2 sur 2)", "Métré des ouvrages"]);
    expect(job.progress).toEqual({ done: 4, total: 4 });

    const drawings = (await admin.request(`/api/admin/projects/${projectId}/drawings`)).json.items;
    expect(drawings.map((d: { pageNumber: number; analysed: boolean }) => [d.pageNumber, d.analysed])).toEqual([
      [1, true],
      [2, true],
    ]);
    const metre = (await admin.request(`/api/admin/projects/${projectId}/metre`)).json;
    expect(metre.workItems).toHaveLength(1);
    const [item] = metre.workItems;
    expect(item).toMatchObject({ code: "GO-01", unit: "m3", origin: "proposition_ia" });
    // 42,50 × 0,60 × 0,40 = 10,2 : calculé par le serveur, pas recopié du modèle.
    expect(item.measurements[0]).toMatchObject({ quantity: "10.2000", status: "a_verifier", source: "proposition_ia", formula: "L * l * h" });
    expect(item.measurements[0].notes).toContain("Sources :");

    const notifications = (await admin.request("/api/admin/notifications")).json.items;
    expect(notifications[0].title).toBe("Lecture des plans terminée : 1 ouvrage(s), 1 métré(s) à vérifier");
    const runs = await ctx.db.select().from(schema.agentRun);
    expect(runs.map((r) => r.agent).sort()).toEqual(["lecteur_plans", "lecteur_plans", "metreur"]);
  });

  it("recalcule une mesure corrigée et refuse une formule invalide", async () => {
    const metre = (await admin.request(`/api/admin/projects/${projectId}/metre`)).json;
    const measure = metre.workItems[0].measurements[0];
    const patched = await admin.request(`/api/admin/measurements/${measure.id}`, {
      method: "PATCH",
      body: { inputs: [{ name: "L", value: "40" }, { name: "l", value: "0,6" }, { name: "h", value: "0.4" }] },
    });
    expect(patched.json.measurement).toMatchObject({ quantity: "9.6000", status: "a_verifier" });
    const invalid = await admin.request(`/api/admin/measurements/${measure.id}`, { method: "PATCH", body: { formula: "L * l * epaisseur" } });
    expect(invalid.status).toBe(400);
    expect(invalid.json.fields.formula).toBe("Valeur manquante pour epaisseur.");
    const validated = await admin.request(`/api/admin/measurements/${measure.id}/validate`, { body: { status: "verifie" } });
    expect(validated.json.measurement.status).toBe("verifie");
  });

  it("garde ce qui a été validé quand l'analyse est relancée", async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    const res = await admin.request(`/api/admin/projects/${projectId}/analyses`, { body: { fileIds: [fileId], consent: true } });
    expect(res.json.job.status).toBe("termine");
    const metre = (await admin.request(`/api/admin/projects/${projectId}/metre`)).json;
    const statuses = metre.workItems.map((w: { measurements: Array<{ status: string }> }) => w.measurements.map((x) => x.status).join(","));
    expect(statuses.sort()).toEqual(["a_verifier", "verifie"]);
  });

  it("écarte un PDF endommagé et poursuit avec les autres fichiers", async () => {
    const broken = await upload("abime.pdf", new TextEncoder().encode("%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n") as Uint8Array<ArrayBuffer>);
    const res = await admin.request(`/api/admin/projects/${projectId}/analyses`, { body: { fileIds: [broken, fileId], consent: true } });
    const job = (await admin.request(`/api/admin/agents/jobs/${res.json.job.id}`)).json.job;
    expect(job.status).toBe("termine");
    expect(job.steps[0].log.map((l: { message: string }) => l.message)).toEqual(["abime.pdf : PDF illisible (protégé ou endommagé) : exportez-le de nouveau."]);
    expect(job.steps.filter((st: { name: string }) => st.name.startsWith("page:"))).toHaveLength(2);
  });

  it("ajoute un ouvrage et une mesure saisis", async () => {
    const item = await admin.request(`/api/admin/projects/${projectId}/work-items`, { body: { code: "GO-10", designation: "Béton de propreté", unit: "m2" } });
    expect(item.status).toBe(201);
    const measure = await admin.request(`/api/admin/work-items/${item.json.workItem.id}/measurements`, {
      body: { label: "Sous semelles", method: "surface", formula: "L * l", inputs: [{ name: "L", value: "42.5" }, { name: "l", value: "0.8" }], unit: "m2" },
    });
    expect(measure.json.measurement).toMatchObject({ quantity: "34.0000", source: "saisie" });
  });
});

describe("exécuteur des traitements longs", () => {
  it("retente une étape après un incident passager", async () => {
    setAiProviderForTests(flakyProvider([new AiRetriableError("Limite de débit OpenAI atteinte : nouvel essai.")]));
    const job = await createJob({ kind: "analyse_plans", projectId, input: { fileIds: [fileId], lotId: null } });
    const [row] = await ctx.db.select().from(schema.generationJob).where(eq(schema.generationJob.id, job.id));
    expect(row!.status).toBe("termine");
    const steps = await ctx.db.select().from(schema.generationStep).where(eq(schema.generationStep.jobId, job.id));
    const retried = steps.find((s) => s.attempts === 2);
    expect(retried?.log.some((l) => l.message.startsWith("Nouvel essai"))).toBe(true);
  }, 30_000);

  it("arrête le traitement sur une erreur de configuration, puis le reprend", async () => {
    setAiProviderForTests(flakyProvider([new AiConfigError("Modèle « x » indisponible pour ce compte OpenAI.")]));
    const job = await createJob({ kind: "analyse_plans", projectId, input: { fileIds: [fileId], lotId: null } });
    const failed = (await admin.request(`/api/admin/agents/jobs/${job.id}`)).json.job;
    expect(failed.status).toBe("echoue");
    expect(failed.error).toContain("indisponible");
    const notification = (await admin.request("/api/admin/notifications")).json.items[0];
    expect(notification.title).toBe("Échec : Lecture des plans et métré");

    const retried = await admin.request(`/api/admin/agents/jobs/${job.id}/retry`, { body: {} });
    expect(retried.json.job.status).toBe("termine");
  });

  it("s'arrête au budget de temps puis reprend là où il s'était arrêté", async () => {
    setJobKickerForTests(() => undefined);
    const job = await createJob({ kind: "analyse_plans", projectId, input: { fileIds: [fileId], lotId: null } });
    expect(await runJob(job.id, { budgetMs: 0 })).toBe("suspendu");
    const steps = await ctx.db.select().from(schema.generationStep).where(eq(schema.generationStep.jobId, job.id));
    expect(steps.filter((s) => s.status === "termine")).toHaveLength(1);
    expect(await runJob(job.id)).toBe("termine");
    setJobKickerForTests(async (id) => {
      await runJob(id);
    });
  });

  it("applique une annulation demandée", async () => {
    setJobKickerForTests(() => undefined);
    const job = await createJob({ kind: "analyse_plans", projectId, input: { fileIds: [fileId], lotId: null } });
    await admin.request(`/api/admin/agents/jobs/${job.id}/cancel`, { body: {} });
    expect(await runJob(job.id)).toBe("annule");
    const steps = await ctx.db.select().from(schema.generationStep).where(eq(schema.generationStep.jobId, job.id));
    expect(steps.every((s) => s.status === "ignore")).toBe(true);
    setJobKickerForTests(async (id) => {
      await runJob(id);
    });
  });

  it("n'accepte les relances internes qu'avec le jeton signé", async () => {
    setJobKickerForTests(() => undefined);
    const job = await createJob({ kind: "analyse_plans", projectId, input: { fileIds: [fileId], lotId: null } });
    const outsider = new TestBrowser(ctx.app, "192.0.2.90");
    expect((await outsider.request("/api/jobs/run", { body: { jobId: job.id }, headers: { authorization: "Bearer faux" } })).status).toBe(403);
    expect((await outsider.request("/api/jobs/run", { body: { jobId: job.id }, headers: { authorization: `Bearer ${jobToken(job.id)}` } })).status).toBe(202);
    setJobKickerForTests(async (id) => {
      await runJob(id);
    });
  });

  it("liste les traitements d'une affaire avec leur progression", async () => {
    const list = (await admin.request(`/api/admin/agents/jobs?affaire=${projectId}`)).json.items;
    expect(list.length).toBeGreaterThanOrEqual(5);
    expect(list[0]).toMatchObject({ title: "Lecture des plans et métré", project: { id: projectId } });
    const status = (await admin.request("/api/admin/agents/status")).json;
    expect(status).toMatchObject({ storage: true });
  });
});
