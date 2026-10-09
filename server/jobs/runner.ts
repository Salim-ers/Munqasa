/**
 * Exécution des traitements longs, compatible avec les fonctions Vercel à durée limitée :
 * - l'état vit en base (generation_job, generation_step) : chaque étape est persistée avant la suivante ;
 * - un verrou à expiration garantit un seul exécutant à la fois ;
 * - au-delà d'un budget de temps, l'exécutant s'arrête proprement et relance une nouvelle invocation ;
 * - une étape en échec passager est retentée (3 essais), une erreur de configuration arrête le traitement ;
 * - un traitement interrompu (fonction coupée) reprend à l'expiration du verrou, depuis l'interface ou la tâche planifiée.
 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { JobKind } from "../../shared/enums.js";
import { AiConfigError, AiRefusalError, AiRetriableError } from "../ai/client.js";
import { getDb, schema } from "../db/index.js";
import { getEnv } from "../env.js";
import { AiBudgetError } from "../services/openai.js";
import { notify } from "../services/notifications.js";
import { handlerFor } from "./registry.js";
import { type JobRow, RetriableStepError, type StepContext } from "./types.js";

const job = schema.generationJob;
const step = schema.generationStep;

/** Le verrou couvre largement la durée maximale d'une invocation. */
const LEASE_MS = 6 * 60 * 1000;
const MAX_ATTEMPTS = 3;

/** Sur Vercel, l'exécutant cède la main avant la limite de durée ; en local, il va jusqu'au bout. */
function defaultBudgetMs(): number {
  return process.env.VERCEL ? 200_000 : Number.POSITIVE_INFINITY;
}

/* ---------- Jeton des relances (appel interne, sans session) ---------- */

export function jobToken(jobId: string): string {
  return createHmac("sha256", getEnv().authSecret).update(`talab-job:${jobId}`).digest("hex");
}

export function verifyJobToken(jobId: string, token: string | undefined): boolean {
  if (!token) return false;
  const expected = Buffer.from(jobToken(jobId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/* ---------- Lancement ---------- */

type Kicker = (jobId: string) => void | Promise<void>;
let kicker: Kicker | null = null;

/** Tests : exécution maîtrisée (ou désactivée) des traitements. */
export function setJobKickerForTests(fn: Kicker | null): void {
  kicker = fn;
}

/** Démarre (ou relance) l'exécution d'un traitement, sans attendre sa fin. */
export async function kickJob(jobId: string): Promise<void> {
  if (kicker) return kicker(jobId);
  if (process.env.VERCEL) {
    // Nouvelle invocation de la fonction : elle dispose de sa propre durée maximale.
    const { waitUntil } = await import("@vercel/functions");
    waitUntil(
      fetch(`${getEnv().appUrl}/api/jobs/run`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${jobToken(jobId)}` },
        body: JSON.stringify({ jobId }),
      })
        .then((res) => res.body?.cancel())
        .catch((error: unknown) => console.error("[jobs] relance impossible", jobId, error)),
    );
    return;
  }
  // Serveur local : exécution en arrière-plan dans le même processus.
  setImmediate(() => {
    runJob(jobId).catch((error: unknown) => console.error("[jobs]", jobId, error));
  });
}

/**
 * Création d'un traitement et de ses premières étapes, puis lancement. Une demande identique déjà en
 * cours (double clic, second onglet) renvoie le traitement existant au lieu d'en créer un autre.
 */
export async function createJob(params: { kind: JobKind; projectId: string | null; input: Record<string, unknown>; idempotencyKey?: string }): Promise<JobRow> {
  const db = await getDb();
  const [active] = await db
    .select()
    .from(job)
    .where(
      and(
        eq(job.kind, params.kind),
        params.projectId ? eq(job.projectId, params.projectId) : isNull(job.projectId),
        inArray(job.status, ["en_attente", "en_cours"]),
        sql`${job.input} = ${JSON.stringify(params.input)}::jsonb`,
      ),
    )
    .limit(1);
  if (active) return active;
  const handler = handlerFor(params.kind);
  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(job)
      .values({ kind: params.kind, projectId: params.projectId, input: params.input, idempotencyKey: params.idempotencyKey ?? randomUUID() })
      .onConflictDoNothing({ target: job.idempotencyKey })
      .returning();
    if (!row) return null;
    const steps = handler.initialSteps(params.input);
    if (steps.length) await tx.insert(step).values(steps.map((name, position) => ({ jobId: row.id, name, position })));
    return row;
  });
  if (!created) {
    const [existing] = await db.select().from(job).where(eq(job.idempotencyKey, params.idempotencyKey!));
    return existing!;
  }
  await kickJob(created.id);
  return created;
}

/* ---------- Exécution ---------- */

function isRetriable(error: unknown): boolean {
  if (error instanceof AiRetriableError || error instanceof RetriableStepError) return true;
  if (error instanceof AiConfigError || error instanceof AiRefusalError || error instanceof AiBudgetError) return false;
  const code = (error as { code?: string } | null)?.code;
  return code === "ECONNRESET" || code === "ETIMEDOUT" || code === "EAI_AGAIN" || (error instanceof TypeError && /fetch failed/i.test(error.message));
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1000);
}

async function appendLog(stepId: string, message: string) {
  const db = await getDb();
  const entry = JSON.stringify([{ at: new Date().toISOString(), message: message.slice(0, 500) }]);
  await db
    .update(step)
    .set({ log: sql`${step.log} || ${entry}::jsonb` })
    .where(eq(step.id, stepId));
}

async function finish(row: JobRow, status: "termine" | "echoue" | "annule", error: string | null = null) {
  const db = await getDb();
  await db.update(job).set({ status, error, finishedAt: new Date(), lockedUntil: null, lockedBy: null }).where(eq(job.id, row.id));
  const handler = handlerFor(row.kind);
  try {
    if (status === "termine") {
      const { title, link } = await handler.finished(row, db);
      await notify(db, { kind: "traitement", title, projectId: row.projectId, link });
    } else if (status === "echoue") {
      await handler.failed?.(row, db, error ?? "Échec.");
      await notify(db, {
        kind: "traitement",
        title: `Échec : ${handler.title(row)}`,
        body: error,
        projectId: row.projectId,
        link: "/administration/agents",
      });
    }
  } catch (cause) {
    console.error("[jobs] finalisation", row.id, cause);
  }
}

export type RunOutcome = "termine" | "echoue" | "annule" | "suspendu" | "occupe";

/** Exécute les étapes d'un traitement jusqu'à la fin, l'échec, l'annulation ou l'épuisement du budget. */
export async function runJob(jobId: string, options: { budgetMs?: number } = {}): Promise<RunOutcome> {
  const db = await getDb();
  const budget = options.budgetMs ?? defaultBudgetMs();
  const started = Date.now();
  const runner = randomUUID();
  const now = new Date();
  const [row] = await db
    .update(job)
    .set({
      status: "en_cours",
      lockedUntil: new Date(now.getTime() + LEASE_MS),
      lockedBy: runner,
      startedAt: sql`coalesce(${job.startedAt}, now())`,
      attempts: sql`${job.attempts} + 1`,
    })
    .where(and(eq(job.id, jobId), inArray(job.status, ["en_attente", "en_cours"]), or(isNull(job.lockedUntil), lt(job.lockedUntil, now))))
    .returning();
  if (!row) return "occupe";
  const handler = handlerFor(row.kind);
  const input = (row.input ?? {}) as Record<string, unknown>;
  // Chaque tranche exécute au moins une étape : la progression est garantie.
  let executed = 0;

  for (;;) {
    const [current] = await db.select({ cancel: job.cancelRequestedAt }).from(job).where(eq(job.id, jobId));
    if (current?.cancel) {
      await db.update(step).set({ status: "ignore" }).where(and(eq(step.jobId, jobId), inArray(step.status, ["en_attente", "en_cours"])));
      await finish(row, "annule");
      return "annule";
    }
    const steps = await db.select().from(step).where(eq(step.jobId, jobId)).orderBy(asc(step.position));
    const next = steps.find((s) => s.status === "en_attente" || s.status === "en_cours");
    if (!next) {
      await finish(row, "termine");
      return "termine";
    }
    if (executed > 0 && Date.now() - started > budget) {
      await db.update(job).set({ lockedUntil: null, lockedBy: null }).where(and(eq(job.id, jobId), eq(job.lockedBy, runner)));
      return "suspendu";
    }
    if (next.attempts >= MAX_ATTEMPTS) {
      const message = next.error ?? "Étape interrompue à plusieurs reprises.";
      await db.update(step).set({ status: "echoue", finishedAt: new Date() }).where(eq(step.id, next.id));
      await finish(row, "echoue", message);
      return "echoue";
    }

    await db.update(step).set({ status: "en_cours", startedAt: new Date(), attempts: next.attempts + 1, error: null }).where(eq(step.id, next.id));
    executed++;
    const ctx: StepContext = {
      db,
      job: row,
      step: next,
      input,
      results: new Map(steps.filter((s) => s.status === "termine").map((s) => [s.name, s.result])),
      log: (message) => appendLog(next.id, message),
    };
    try {
      const outcome = (await handler.run(next.name, ctx)) ?? {};
      await db.transaction(async (tx) => {
        await tx
          .update(step)
          .set({ status: "termine", result: (outcome.result ?? null) as object | null, finishedAt: new Date() })
          .where(eq(step.id, next.id));
        if (outcome.addSteps?.length) {
          const shift = outcome.addSteps.length;
          await tx
            .update(step)
            .set({ position: sql`${step.position} + ${shift}` })
            .where(and(eq(step.jobId, jobId), sql`${step.position} > ${next.position}`));
          await tx.insert(step).values(outcome.addSteps.map((name, i) => ({ jobId, name, position: next.position + 1 + i })));
        }
        await tx
          .update(job)
          .set({ lockedUntil: new Date(Date.now() + LEASE_MS) })
          .where(eq(job.id, jobId));
      });
    } catch (error) {
      const message = errorText(error);
      const retry = isRetriable(error) && next.attempts + 1 < MAX_ATTEMPTS;
      await db
        .update(step)
        .set({ status: retry ? "en_attente" : "echoue", error: message, finishedAt: retry ? null : new Date() })
        .where(eq(step.id, next.id));
      await appendLog(next.id, retry ? `Nouvel essai : ${message}` : message);
      if (!retry) {
        await finish(row, "echoue", message);
        return "echoue";
      }
      // Petite pause avant le nouvel essai (limite de débit, réseau).
      await new Promise((resolve) => setTimeout(resolve, Math.min(15_000, 2_000 * (next.attempts + 1))));
    }
  }
}

/** Point d'entrée des relances internes : exécute une tranche, puis se relance si besoin. */
export async function runSlice(jobId: string): Promise<RunOutcome> {
  const outcome = await runJob(jobId);
  if (outcome === "suspendu") await kickJob(jobId);
  return outcome;
}

/* ---------- Contrôle depuis l'interface ---------- */

/** Traitement en cours dont l'exécutant a disparu (verrou expiré) : à relancer. */
export function isStalled(row: Pick<JobRow, "status" | "lockedUntil">, now = new Date()): boolean {
  return (row.status === "en_cours" || row.status === "en_attente") && (!row.lockedUntil || row.lockedUntil < now);
}

export async function requestCancel(jobId: string): Promise<void> {
  const db = await getDb();
  await db
    .update(job)
    .set({ cancelRequestedAt: new Date() })
    .where(and(eq(job.id, jobId), inArray(job.status, ["en_attente", "en_cours"])));
  const [row] = await db.select().from(job).where(eq(job.id, jobId));
  // Sans exécutant actif, l'annulation est appliquée aussitôt.
  if (row && isStalled(row)) await kickJob(jobId);
}

/** Reprise après échec : l'étape en échec est remise en attente avec de nouveaux essais. */
export async function retryJob(jobId: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db.select().from(job).where(eq(job.id, jobId));
  if (!row || row.status !== "echoue") return false;
  await db.update(step).set({ status: "en_attente", attempts: 0, error: null, finishedAt: null }).where(and(eq(step.jobId, jobId), eq(step.status, "echoue")));
  await db.update(job).set({ status: "en_attente", error: null, finishedAt: null, lockedUntil: null, lockedBy: null, cancelRequestedAt: null }).where(eq(job.id, jobId));
  await kickJob(jobId);
  return true;
}

/** Relance des traitements interrompus (tâche planifiée, ouverture de l'interface). */
export async function resumeStalledJobs(limit = 5): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(job)
    .where(and(inArray(job.status, ["en_attente", "en_cours"]), or(isNull(job.lockedUntil), lt(job.lockedUntil, new Date()))))
    .limit(limit);
  for (const row of rows) await kickJob(row.id);
  return rows.length;
}
