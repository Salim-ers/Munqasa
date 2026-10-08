/** Traitements longs (file en base, étapes reprenables), artefacts produits, exécutions d'agents, consommation IA. */
import { bigint, index, integer, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./columns.js";
import { documentVersion } from "./documents.js";
import { jobKindEnum, jobStatusEnum, stepStatusEnum } from "./enums.js";
import { project } from "./projects.js";

export const generationJob = pgTable(
  "generation_job",
  {
    id: id(),
    projectId: uuid("project_id").references(() => project.id, { onDelete: "cascade" }),
    kind: jobKindEnum("kind").notNull(),
    status: jobStatusEnum("status").notNull().default("en_attente"),
    /** Empêche qu'une même demande soit traitée deux fois. */
    idempotencyKey: text("idempotency_key").notNull().unique(),
    input: jsonb("input").notNull().default({}),
    /** Verrou : un seul exécutant à la fois, libéré automatiquement à expiration. */
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lockedBy: text("locked_by"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("generation_job_status_idx").on(t.status, t.createdAt), index("generation_job_project_idx").on(t.projectId)],
);

/** Étape d'un traitement : son résultat est persisté avant de passer à la suivante. */
export const generationStep = pgTable(
  "generation_step",
  {
    id: id(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => generationJob.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    status: stepStatusEnum("status").notNull().default("en_attente"),
    attempts: integer("attempts").notNull().default(0),
    result: jsonb("result"),
    log: jsonb("log").$type<Array<{ at: string; message: string }>>().notNull().default([]),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("generation_step_job_idx").on(t.jobId, t.position)],
);

/** Fichier produit (PDF, DOCX, XLSX, ZIP…), stocké dans le compartiment privé. */
export const generationArtifact = pgTable(
  "generation_artifact",
  {
    id: id(),
    jobId: uuid("job_id").references(() => generationJob.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => project.id, { onDelete: "cascade" }),
    documentVersionId: uuid("document_version_id").references(() => documentVersion.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    fileName: text("file_name").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    variant: text("variant").notNull().default("propre"),
    createdAt: createdAt(),
  },
  (t) => [index("generation_artifact_project_idx").on(t.projectId)],
);

/** Exécution d'un agent : entrée résumée, sortie structurée, statut, consommation. */
export const agentRun = pgTable(
  "agent_run",
  {
    id: id(),
    jobId: uuid("job_id").references(() => generationJob.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => project.id, { onDelete: "cascade" }),
    agent: text("agent").notNull(),
    model: text("model").notNull(),
    inputSummary: text("input_summary"),
    output: jsonb("output"),
    toolCalls: jsonb("tool_calls").$type<Array<{ name: string; ok: boolean }>>().notNull().default([]),
    status: text("status").notNull().default("en_cours"),
    error: text("error"),
    responseId: text("response_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("agent_run_project_idx").on(t.projectId), index("agent_run_started_idx").on(t.startedAt)],
);

export const aiUsageRecord = pgTable(
  "ai_usage_record",
  {
    id: id(),
    agentRunId: uuid("agent_run_id").references(() => agentRun.id, { onDelete: "set null" }),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    cachedInputTokens: integer("cached_input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    /** Coût estimé en dollars US, d'après le barème saisi dans les paramètres IA (null si barème inconnu). */
    costUsd: numeric("cost_usd", { precision: 14, scale: 6 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ai_usage_record_created_idx").on(t.createdAt)],
);
