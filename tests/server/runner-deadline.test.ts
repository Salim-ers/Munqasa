/**
 * Traitements longs face à la durée maximale d'une exécution (300 s sur Vercel) : un appel au modèle reçoit un
 * délai calé sur le temps restant, sans nouvel essai caché qui le dépasserait ; après un dépassement, l'essai
 * suivant raccourcit le raisonnement ; une page encore trop longue est écartée et dite, la lecture continue ;
 * une étape lancée trop tard repart dans une nouvelle exécution sans compter d'essai ; une étape arrêtée à
 * plusieurs reprises fait échouer le traitement avec un motif clair, au lieu de le laisser « en cours ».
 */
import { eq } from "drizzle-orm";
import OpenAI from "openai";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { type AiProvider, AiTimeoutError, mapOpenAiError, setAiProviderForTests, TIMEOUT_MARK } from "../../server/ai/client.js";
import { fakeProvider } from "../../server/ai/fake.js";
import { schema } from "../../server/db/index.js";
import { createJob, runJob, setFunctionLimitForTests, setJobKickerForTests } from "../../server/jobs/runner.js";
import { adminSession, setupTestServer, type TestBrowser } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setupTestServer>>;
let admin: TestBrowser;
let projectId = "";
let fileId = "";

interface Seen {
  schemaName: string;
  summary: string;
  effort: string | undefined;
  options: { timeoutMs: number; maxRetries: number } | undefined;
}

/** Fournisseur simulé qui note chaque appel et peut faire dépasser le délai à certains. */
function recordingProvider(seen: Seen[], timeout: (call: { schemaName: string; summary: string }, index: number) => boolean = () => false): AiProvider {
  let index = 0;
  return {
    ...fakeProvider,
    name: "simulation",
    async run(call, model, options) {
      seen.push({ schemaName: call.schemaName, summary: call.summary, effort: call.effort, options });
      if (timeout(call, index++)) throw mapOpenAiError(new OpenAI.APIConnectionTimeoutError(), model);
      return fakeProvider.run(call, model);
    },
  };
}

const steps = async (jobId: string) => (await ctx.db.select().from(schema.generationStep).where(eq(schema.generationStep.jobId, jobId))).sort((a, b) => a.position - b.position);
const status = async (jobId: string) => (await ctx.db.select().from(schema.generationJob).where(eq(schema.generationJob.id, jobId)))[0]!;

beforeAll(async () => {
  ctx = await setupTestServer();
  admin = (await adminSession(ctx.app)).browser;
  const project = await admin.request("/api/admin/projects", { body: { name: "Plans denses", country: "MA", marketType: "appel_offres_ouvert", sector: "public", currency: "MAD" } });
  projectId = project.json.project.id;
  await admin.request(`/api/admin/projects/${projectId}/lots`, { body: { code: "01", name: "Gros œuvre", tradeFamily: "gros_oeuvre" } });
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let p = 1; p <= 2; p++) {
    const page = pdf.addPage([842, 595]);
    page.drawText(`Plan de fondations, page ${p}`, { x: 50, y: 500, size: 18, font });
    for (const [text, x, y] of [["42.50", 300, 280], ["60", 90, 300], ["Ht 40", 150, 260], ["ECH. 1/100", 600, 60]] as const) page.drawText(text, { x, y, size: 10, font });
  }
  const bytes = new Uint8Array(await pdf.save());
  const req = await admin.request("/api/admin/files/upload-url", { body: { projectId, kind: "plan", fileName: "Plan dense.pdf", sizeBytes: bytes.byteLength, contentType: "application/pdf" } });
  await admin.request(req.json.upload.url, { method: "PUT", raw: bytes, headers: { "content-type": "application/octet-stream" } });
  await admin.request(`/api/admin/files/${req.json.file.id}/complete`, { body: {} });
  fileId = req.json.file.id;
});

afterEach(() => {
  setFunctionLimitForTests(null);
  setAiProviderForTests(fakeProvider);
  setJobKickerForTests(async (id) => {
    await runJob(id);
  });
});

describe("durée maximale d'une exécution", () => {
  it("traduit le dépassement du délai d'un appel en erreur retentée, reconnaissable à l'essai suivant", () => {
    const error = mapOpenAiError(new OpenAI.APIConnectionTimeoutError(), "gpt-test");
    expect(error).toBeInstanceOf(AiTimeoutError);
    expect(error.message.startsWith(TIMEOUT_MARK)).toBe(true);
  });

  it("donne à chaque appel un délai calé sur le temps restant, sans nouvel essai caché", async () => {
    setFunctionLimitForTests(300_000);
    const seen: Seen[] = [];
    setAiProviderForTests(recordingProvider(seen));
    setJobKickerForTests(async (id) => {
      await runJob(id);
    });
    const job = await createJob({ kind: "analyse_plans", projectId, input: { fileIds: [fileId], lotId: null } });
    expect((await status(job.id)).status).toBe("termine");
    expect(seen.length).toBeGreaterThanOrEqual(3);
    for (const call of seen) {
      expect(call.options!.maxRetries).toBe(0);
      expect(call.options!.timeoutMs).toBeLessThanOrEqual(270_000);
      expect(call.options!.timeoutMs).toBeGreaterThanOrEqual(30_000);
    }
  });

  it("raccourcit le raisonnement à l'essai qui suit un dépassement", async () => {
    setFunctionLimitForTests(300_000);
    const seen: Seen[] = [];
    // Premier relevé de page trop long, une seule fois.
    setAiProviderForTests(recordingProvider(seen, (call, i) => call.schemaName === "releve_plan" && i === 0));
    const job = await createJob({ kind: "analyse_plans", projectId, input: { fileIds: [fileId], lotId: null } });
    expect((await status(job.id)).status).toBe("termine");
    const readings = seen.filter((c) => c.schemaName === "releve_plan");
    expect(readings[0]!.effort).toBe("medium");
    expect(readings[1]!.effort).toBe("low");
    const page = (await steps(job.id)).find((s) => s.name.startsWith("page:") && s.attempts === 2)!;
    expect(page.log.some((l) => l.message.startsWith(`Nouvel essai : ${TIMEOUT_MARK}`))).toBe(true);
  }, 30_000);

  it("écarte et signale une page encore trop longue au second essai, la lecture continue", async () => {
    setFunctionLimitForTests(300_000);
    const seen: Seen[] = [];
    setAiProviderForTests(recordingProvider(seen, (call) => call.schemaName === "releve_plan" && call.summary.includes("page 1 ")));
    const job = await createJob({ kind: "analyse_plans", projectId, input: { fileIds: [fileId], lotId: null } });
    expect((await status(job.id)).status).toBe("termine");
    const all = await steps(job.id);
    const pages = all.filter((s) => s.name.startsWith("page:"));
    const skipped = pages.find((s) => (s.result as { timeout?: boolean } | null)?.timeout);
    expect(skipped).toBeTruthy();
    expect(skipped!.log.map((l) => l.message)).toContain("Plan dense.pdf p.1 : page non lue, le modèle n’a pas répondu dans le temps disponible malgré un second essai. Relancez la lecture de cette page seule, ou exportez-la à part.");
    expect(pages.filter((s) => s.status === "termine")).toHaveLength(2);
    expect(all.find((s) => s.name === "metre")!.status).toBe("termine");
  }, 30_000);

  it("reporte à une nouvelle exécution une étape lancée trop tard, sans compter d'essai", async () => {
    // Exécution simulée de 160 s : après la préparation, il reste moins que le temps réservé à un relevé.
    setFunctionLimitForTests(160_000);
    const job = await createJob({ kind: "analyse_plans", projectId, input: { fileIds: [fileId], lotId: null } });
    const row = await status(job.id);
    expect(row.status).toBe("en_cours");
    expect(row.lockedUntil).toBeNull();
    const first = (await steps(job.id)).find((s) => s.name.startsWith("page:"))!;
    expect(first).toMatchObject({ status: "en_attente", attempts: 0 });
    // Nouvelle exécution : l'étape dispose de toute la durée et se termine.
    setFunctionLimitForTests(null);
    expect(await runJob(job.id)).toBe("termine");
  });

  it("fait échouer avec un motif clair une étape arrêtée à plusieurs reprises", async () => {
    setJobKickerForTests(async () => undefined);
    const job = await createJob({ kind: "analyse_plans", projectId, input: { fileIds: [fileId], lotId: "00000000-0000-4000-8000-000000000000" } });
    const [first] = await steps(job.id);
    // Trois exécutions coupées net par la plateforme : l'étape est restée « en cours », sans erreur.
    await ctx.db.update(schema.generationStep).set({ status: "en_cours", attempts: 3, error: null }).where(eq(schema.generationStep.id, first!.id));
    expect(await runJob(job.id)).toBe("echoue");
    expect((await status(job.id)).error).toBe("Étape interrompue à plusieurs reprises : elle a dépassé la durée maximale d’une exécution.");
  });
});
