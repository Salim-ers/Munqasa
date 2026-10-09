/**
 * Agents IA : prérequis, suivi des traitements (progression, journal, annulation, reprise),
 * lancement de la lecture des plans, et métré (ouvrages et mesures, recalculés par le serveur).
 */
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { measurementInput, planAnalysisRequest, workItemInput } from "../../../shared/schemas.js";
import { modelFor } from "../../ai/client.js";
import type { AdminEnv } from "../../auth/guard.js";
import { getDb, schema } from "../../db/index.js";
import { getEnv } from "../../env.js";
import { createJob, isStalled, kickJob, requestCancel, retryJob } from "../../jobs/runner.js";
import { handlerFor } from "../../jobs/registry.js";
import type { JobRow, StepRow } from "../../jobs/types.js";
import { auditAction } from "../../services/audit.js";
import { evaluateFormula, FormulaError } from "../../services/formula.js";
import { monthSpendUsd } from "../../services/openai.js";
import { readSetting } from "../../services/settings.js";
import { storageConfigured } from "../../services/storage.js";
import { body, notFound, patchBody, uuidParam, ValidationError } from "../validate.js";

const j = schema.generationJob;
const st = schema.generationStep;

/** Traitement lisible par l'interface : titre, progression, étapes numérotées. */
export function serializeJob(row: JobRow, steps: StepRow[]) {
  const handler = handlerFor(row.kind);
  const labels = steps.map((s) => handler.stepLabel(s.name, row));
  const totals = new Map<string, number>();
  for (const label of labels) totals.set(label, (totals.get(label) ?? 0) + 1);
  const seen = new Map<string, number>();
  return {
    id: row.id,
    kind: row.kind,
    title: handler.title(row),
    projectId: row.projectId,
    status: row.status,
    error: row.error,
    stalled: isStalled(row),
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    progress: { done: steps.filter((s) => s.status === "termine" || s.status === "ignore").length, total: steps.length },
    steps: steps.map((s, i) => {
      const label = labels[i]!;
      const n = (seen.get(label) ?? 0) + 1;
      seen.set(label, n);
      const total = totals.get(label)!;
      return {
        id: s.id,
        name: s.name,
        label: total > 1 ? `${label} (${n} sur ${total})` : label,
        status: s.status,
        attempts: s.attempts,
        error: s.error,
        log: s.log,
        startedAt: s.startedAt,
        finishedAt: s.finishedAt,
      };
    }),
  };
}

async function loadJob(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(j).where(eq(j.id, id));
  if (!row) notFound("Traitement introuvable.");
  const steps = await db.select().from(st).where(eq(st.jobId, id)).orderBy(asc(st.position));
  return serializeJob(row, steps);
}

export const agentRoutes = new Hono<AdminEnv>()
  .get("/status", async (c) => {
    // Prérequis des agents, affichés avant tout lancement.
    const env = getEnv();
    const settings = await readSetting("ia");
    const simulation = !env.isProduction && process.env.TALAB_FAKE_AI === "1";
    return c.json({
      simulation,
      openaiKey: Boolean(env.OPENAI_API_KEY),
      generationModel: settings.generationModel || null,
      extractionModel: settings.extractionModel || settings.generationModel || null,
      storage: storageConfigured() || !env.isProduction,
      monthUsd: await monthSpendUsd(),
      budgetUsd: settings.monthlyBudgetUsd || null,
    });
  })
  .get("/jobs", async (c) => {
    const db = await getDb();
    const projectId = c.req.query("affaire");
    const limit = Math.min(Number(c.req.query("limit") ?? 20) || 20, 100);
    const rows = await db
      .select()
      .from(j)
      .where(projectId && /^[0-9a-f-]{36}$/i.test(projectId) ? eq(j.projectId, projectId) : undefined)
      .orderBy(desc(j.createdAt))
      .limit(limit);
    const steps = rows.length ? await db.select().from(st).where(inArray(st.jobId, rows.map((r) => r.id))).orderBy(asc(st.position)) : [];
    const projects = rows.length
      ? await db
          .select({ id: schema.project.id, reference: schema.project.reference, name: schema.project.name })
          .from(schema.project)
          .where(inArray(schema.project.id, [...new Set(rows.map((r) => r.projectId).filter((v): v is string => Boolean(v)))]))
      : [];
    return c.json({
      items: rows.map((row) => ({
        ...serializeJob(
          row,
          steps.filter((s) => s.jobId === row.id),
        ),
        project: projects.find((p) => p.id === row.projectId) ?? null,
      })),
    });
  })
  .get("/jobs/:id", async (c) => c.json({ job: await loadJob(uuidParam(c)) }))
  .post("/jobs/:id/cancel", async (c) => {
    const id = uuidParam(c);
    await requestCancel(id);
    await auditAction(c, "agent.annulation", "job", id);
    return c.json({ job: await loadJob(id) });
  })
  .post("/jobs/:id/retry", async (c) => {
    const id = uuidParam(c);
    if (!(await retryJob(id))) return c.json({ error: "conflit", message: "Seul un traitement en échec peut être repris." }, 409);
    await auditAction(c, "agent.reprise", "job", id);
    return c.json({ job: await loadJob(id) });
  })
  .post("/jobs/:id/resume", async (c) => {
    // Traitement interrompu (fonction arrêtée) : relance de l'exécution là où elle s'était arrêtée.
    const id = uuidParam(c);
    const db = await getDb();
    const [row] = await db.select().from(j).where(eq(j.id, id));
    if (!row) notFound("Traitement introuvable.");
    if (isStalled(row)) await kickJob(id);
    return c.json({ job: await loadJob(id) });
  });

/* ---------- Lecture des plans et métré ---------- */

const wi = schema.workItem;
const m = schema.measurement;

function computeQuantity(formula: string, inputs: Record<string, string>): string {
  try {
    return evaluateFormula(formula, inputs);
  } catch (error) {
    throw new ValidationError({ formula: error instanceof FormulaError ? error.message : "Formule invalide." });
  }
}

async function projectOr404(id: string) {
  const db = await getDb();
  const [row] = await db.select({ id: schema.project.id }).from(schema.project).where(eq(schema.project.id, id));
  if (!row) notFound("Affaire introuvable.");
}

export const metreRoutes = new Hono<AdminEnv>()
  .post("/projects/:id/analyses", async (c) => {
    const projectId = uuidParam(c);
    await projectOr404(projectId);
    const data = await body(c, planAnalysisRequest);
    // Modèles et clé vérifiés avant de lancer quoi que ce soit.
    await modelFor("extraction");
    await modelFor("generation");
    const fileIds = [...new Set(data.fileIds)].sort();
    const db = await getDb();
    const files = await db
      .select({ id: schema.sourceFile.id })
      .from(schema.sourceFile)
      .where(and(inArray(schema.sourceFile.id, fileIds), eq(schema.sourceFile.projectId, projectId), isNull(schema.sourceFile.deletedAt)));
    if (files.length !== fileIds.length) throw new ValidationError({ fileIds: "Un des fichiers n’appartient pas à cette affaire." });
    // Une demande identique encore en cours n'est pas dupliquée (voir createJob).
    const job = await createJob({ kind: "analyse_plans", projectId, input: { fileIds, lotId: data.lotId } });
    await auditAction(c, "agent.lecture_plans", "project", projectId, { fichiers: fileIds.length });
    return c.json({ job: await loadJob(job.id) }, 201);
  })
  .get("/projects/:id/drawings", async (c) => {
    const projectId = uuidParam(c);
    const db = await getDb();
    const rows = await db
      .select({ drawing: schema.drawing, fileName: schema.sourceFile.originalName })
      .from(schema.drawing)
      .innerJoin(schema.sourceFile, eq(schema.sourceFile.id, schema.drawing.sourceFileId))
      .where(and(eq(schema.drawing.projectId, projectId), isNull(schema.sourceFile.deletedAt)))
      .orderBy(asc(schema.sourceFile.originalName), asc(schema.drawing.pageNumber));
    return c.json({
      items: rows.map(({ drawing, fileName }) => {
        const extraction = drawing.extraction as { elements?: unknown[]; uncertainties?: string[]; notes?: string[]; sheet?: { readable?: boolean } } | null;
        return {
          id: drawing.id,
          sourceFileId: drawing.sourceFileId,
          fileName,
          pageNumber: drawing.pageNumber,
          title: drawing.title,
          sheetNumber: drawing.sheetNumber,
          kind: drawing.kind,
          level: drawing.level,
          scaleText: drawing.scaleText,
          status: drawing.status,
          analysed: Boolean(extraction),
          readable: extraction?.sheet?.readable ?? null,
          elementCount: extraction?.elements?.length ?? 0,
          uncertainties: extraction?.uncertainties ?? [],
          notes: extraction?.notes ?? [],
          elements: extraction?.elements ?? [],
        };
      }),
    });
  })
  .get("/projects/:id/metre", async (c) => {
    const projectId = uuidParam(c);
    const db = await getDb();
    const [items, measures] = await Promise.all([
      db.select().from(wi).where(eq(wi.projectId, projectId)).orderBy(asc(wi.code), asc(wi.createdAt)),
      db.select().from(m).where(eq(m.projectId, projectId)).orderBy(asc(m.createdAt)),
    ]);
    return c.json({
      workItems: items.map((item) => ({ ...item, measurements: measures.filter((x) => x.workItemId === item.id) })),
      orphanMeasurements: measures.filter((x) => !x.workItemId),
    });
  })
  .post("/projects/:id/work-items", async (c) => {
    const projectId = uuidParam(c);
    await projectOr404(projectId);
    const db = await getDb();
    const data = await body(c, workItemInput);
    const [row] = await db
      .insert(wi)
      .values({ ...data, projectId, origin: "saisie" })
      .returning();
    await auditAction(c, "metre.ouvrage_ajoute", "project", projectId, { ouvrage: row!.designation });
    return c.json({ workItem: row }, 201);
  })
  .patch("/work-items/:id", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const data = await patchBody(c, workItemInput);
    const [row] = await db.update(wi).set(data).where(eq(wi.id, id)).returning();
    if (!row) notFound("Ouvrage introuvable.");
    await auditAction(c, "metre.ouvrage_modifie", "project", row.projectId, { ouvrage: row.designation });
    return c.json({ workItem: row });
  })
  .delete("/work-items/:id", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const [row] = await db.select().from(wi).where(eq(wi.id, id));
    if (!row) notFound("Ouvrage introuvable.");
    await db.transaction(async (tx) => {
      await tx.delete(m).where(eq(m.workItemId, id));
      await tx.delete(wi).where(eq(wi.id, id));
    });
    await auditAction(c, "metre.ouvrage_supprime", "project", row.projectId, { ouvrage: row.designation });
    return c.json({ ok: true });
  })
  .post("/work-items/:id/measurements", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const [item] = await db.select().from(wi).where(eq(wi.id, id));
    if (!item) notFound("Ouvrage introuvable.");
    const data = await body(c, measurementInput);
    const inputs = Object.fromEntries(data.inputs.map((i) => [i.name, i.value]));
    const quantity = computeQuantity(data.formula, inputs);
    const [row] = await db
      .insert(m)
      .values({
        projectId: item.projectId,
        lotId: item.lotId,
        workItemId: id,
        drawingId: data.drawingId,
        zoneRef: data.zoneRef,
        label: data.label,
        method: data.method,
        formula: data.formula,
        inputs,
        quantity,
        unit: data.unit,
        source: "saisie",
        status: "a_verifier",
        notes: data.notes,
      })
      .returning();
    await auditAction(c, "metre.mesure_ajoutee", "project", item.projectId, { mesure: row!.label });
    return c.json({ measurement: row }, 201);
  })
  .patch("/measurements/:id", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const [current] = await db.select().from(m).where(eq(m.id, id));
    if (!current) notFound("Mesure introuvable.");
    const data = await patchBody(c, measurementInput);
    const inputs = data.inputs ? Object.fromEntries(data.inputs.map((i) => [i.name, i.value])) : current.inputs;
    const formula = data.formula ?? current.formula ?? "";
    // Toute correction recalcule la quantité et repasse la mesure « à vérifier ».
    const quantity = computeQuantity(formula, inputs);
    const { inputs: _ignored, ...rest } = data;
    const [row] = await db
      .update(m)
      .set({ ...rest, inputs, formula, quantity, status: "a_verifier", validatedAt: null })
      .where(eq(m.id, id))
      .returning();
    await auditAction(c, "metre.mesure_modifiee", "project", current.projectId, { mesure: row!.label });
    return c.json({ measurement: row });
  })
  .post("/measurements/:id/validate", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const status = ((await c.req.json().catch(() => ({}))) as { status?: string }).status;
    if (status !== "verifie" && status !== "a_verifier" && status !== "rejete") throw new ValidationError({ status: "Statut invalide." });
    const [current] = await db.select().from(m).where(eq(m.id, id));
    if (!current) notFound("Mesure introuvable.");
    if (status === "verifie" && current.quantity === null) throw new ValidationError({ quantity: "Une mesure sans quantité calculée ne peut pas être validée." });
    const [row] = await db
      .update(m)
      .set({ status, validatedAt: status === "verifie" ? new Date() : null })
      .where(eq(m.id, id))
      .returning();
    await auditAction(c, status === "verifie" ? "metre.mesure_validee" : status === "rejete" ? "metre.mesure_rejetee" : "metre.mesure_a_verifier", "project", current.projectId, {
      mesure: current.label,
    });
    return c.json({ measurement: row });
  })
  .delete("/measurements/:id", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const [row] = await db.delete(m).where(eq(m.id, id)).returning();
    if (!row) notFound("Mesure introuvable.");
    await auditAction(c, "metre.mesure_supprimee", "project", row.projectId, { mesure: row.label });
    return c.json({ ok: true });
  });
