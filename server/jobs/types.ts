/** Traitements longs : contrat des gestionnaires d'étapes (analyse des plans, CCTP, DPGF, sous-détails). */
import type { JobKind } from "../../shared/enums.js";
import type { Database, schema } from "../db/index.js";

export type JobRow = typeof schema.generationJob.$inferSelect;
export type StepRow = typeof schema.generationStep.$inferSelect;

export interface StepContext {
  db: Database;
  job: JobRow;
  step: StepRow;
  input: Record<string, unknown>;
  /** Résultats des étapes déjà terminées, par nom. */
  results: Map<string, unknown>;
  log(message: string): Promise<void>;
}

export interface StepOutcome {
  result?: unknown;
  /** Étapes à insérer juste après celle-ci (ex. une étape par page ou par chapitre). */
  addSteps?: string[];
}

export interface JobHandler {
  kind: JobKind;
  /** Titre lisible du traitement (notifications, interface). */
  title(job: JobRow): string;
  /** Libellé lisible d'une étape, pour l'interface. */
  stepLabel(name: string, job: JobRow): string;
  initialSteps(input: Record<string, unknown>): string[];
  run(stepName: string, ctx: StepContext): Promise<StepOutcome | void>;
  /** Notification de fin (titre et lien), et éventuels traitements finaux. */
  finished(job: JobRow, db: Database): Promise<{ title: string; link: string | null }>;
  failed?(job: JobRow, db: Database, error: string): Promise<void>;
}

/** Incident passager hors IA (stockage, réseau) : l'étape est retentée. */
export class RetriableStepError extends Error {}
