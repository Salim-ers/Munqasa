/**
 * « Générer le dossier » : un seul traitement enchaîne les agents de l'affaire, chacun avec ses propres
 * étapes, pour une progression réelle et une reprise exacte en cas d'interruption :
 * 1. lecture des plans et métré (si des plans sont choisis ; sinon le métré existant est conservé) ;
 * 2. rédaction du CCTP (appuyée sur le métré s'il existe) ;
 * 3. DPGF depuis ce CCTP ;
 * 4. sous-détails de prix (si demandés et si la bibliothèque contient des prix utilisables) ;
 * 5. contrôle indépendant : recalculs, contrôles qualité, niveau de validation.
 * Chaque étape porte le nom de son agent (« cctp:plan », « dpgf:chapitre:3 »…) et lui est confiée telle quelle.
 */
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { CctpDetailLevel } from "../../ai/schemas.js";
import { schema } from "../../db/index.js";
import { dossierStatus } from "../../services/dossier.js";
import type { JobHandler, StepContext, StepOutcome } from "../types.js";
import { cctpHandler } from "./cctp.js";
import { auditStep } from "./dossier-audit.js";
import { dpgfHandler } from "./dpgf.js";
import { planAnalysisHandler } from "./plan-analysis.js";
import { sousDetailHandler } from "./sous-detail.js";

export interface DossierInput {
  fileIds: string[];
  lotId: string | null;
  detailLevel: CctpDetailLevel;
  referenceIds: string[];
  vatRate: string | null;
  instructions: string | null;
  withSousDetails: boolean;
}

type Stage = "lecture" | "cctp" | "dpgf" | "sousdetail" | "audit";
const STAGES: Record<Stage, { label: string; handler: JobHandler | null }> = {
  lecture: { label: "Plans et métré", handler: planAnalysisHandler },
  cctp: { label: "CCTP", handler: cctpHandler },
  dpgf: { label: "DPGF", handler: dpgfHandler },
  sousdetail: { label: "Sous-détails", handler: sousDetailHandler },
  audit: { label: "Contrôle indépendant", handler: null },
};
const AUDIT_LABELS: Record<string, string> = { recalculs: "Recalcul des quantités, montants et sous-détails", controles: "Contrôles qualité et niveau de validation" };

function split(name: string): [Stage, string] {
  const at = name.indexOf(":");
  return [name.slice(0, at) as Stage, name.slice(at + 1)];
}

/** Résultats des étapes déjà faites d'un agent, sous leurs propres noms. */
function stageResults(results: Map<string, unknown>, stage: Stage): Map<string, unknown> {
  const prefix = `${stage}:`;
  return new Map([...results].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));
}

/** Étape écartée par la chaîne (marqueur propre : les agents ont leurs propres champs « skipped »). */
const skipped = (value: unknown) => (value as { stageSkipped?: boolean } | undefined)?.stageSkipped === true;

export const dossierHandler: JobHandler = {
  kind: "generation_dossier",
  title: () => "Génération du dossier",
  stepLabel(name, job) {
    const [stage, rest] = split(name);
    const def = STAGES[stage];
    if (!def) return name;
    return `${def.label} : ${def.handler ? def.handler.stepLabel(rest, job) : (AUDIT_LABELS[rest] ?? rest)}`;
  },
  initialSteps: () => ["lecture:preparation", "lecture:metre", "cctp:plan", "cctp:controle", "dpgf:preparation", "dpgf:controle", "sousdetail:preparation", "sousdetail:controle", "audit:recalculs", "audit:controles"],

  async run(name, ctx) {
    const [stage, rest] = split(name);
    const options = ctx.input as unknown as DossierInput;
    const { db } = ctx;
    const projectId = ctx.job.projectId!;
    const own = stageResults(ctx.results, stage);
    const skip = async (message: string | null): Promise<StepOutcome> => {
      if (message) await ctx.log(message);
      return { result: { stageSkipped: true } };
    };

    let input: Record<string, unknown>;
    let extra: Record<string, unknown> = {};
    if (stage === "lecture") {
      if (rest === "preparation" && options.fileIds.length === 0) return skip("Aucun plan choisi : lecture des plans non lancée, le métré existant est conservé.");
      if (rest !== "preparation" && skipped(own.get("preparation"))) return skip(null);
      input = { fileIds: options.fileIds, lotId: options.lotId };
    } else if (stage === "cctp") {
      let useMetre = (own.get("plan") as { useMetre?: boolean } | undefined)?.useMetre;
      if (rest === "plan") {
        const [count] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.workItem)
          .where(and(eq(schema.workItem.projectId, projectId), options.lotId ? eq(schema.workItem.lotId, options.lotId) : undefined));
        useMetre = Number(count?.n ?? 0) > 0;
        if (!useMetre) await ctx.log("Aucun ouvrage au métré : le CCTP est rédigé sans quantités.");
        extra = { useMetre };
      }
      input = { mode: "generation", lotId: options.lotId, detailLevel: options.detailLevel, useMetre: Boolean(useMetre), referenceIds: options.referenceIds, instructions: options.instructions };
    } else if (stage === "dpgf") {
      const plan = ctx.results.get("cctp:plan") as { documentId?: string } | undefined;
      if (!plan?.documentId) throw new Error("CCTP introuvable : la DPGF ne peut pas être établie.");
      input = { cctpDocumentId: plan.documentId, vatRate: options.vatRate, instructions: options.instructions };
    } else if (stage === "sousdetail") {
      const prepared = ctx.results.get("dpgf:preparation") as { dpgfId?: string } | undefined;
      if (rest === "preparation") {
        if (!options.withSousDetails) return skip("Sous-détails non demandés.");
        if (!prepared?.dpgfId) return skip("DPGF introuvable : sous-détails non établis.");
        const [dpgf] = await db.select().from(schema.dpgf).where(eq(schema.dpgf.id, prepared.dpgfId));
        const [project] = await db.select().from(schema.project).where(eq(schema.project.id, projectId));
        const [prices] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.priceItem)
          .where(
            and(
              isNull(schema.priceItem.archivedAt),
              ne(schema.priceItem.verificationStatus, "rejete"),
              ne(schema.priceItem.kind, "ratio"),
              eq(schema.priceItem.currency, dpgf!.currency),
              eq(schema.priceItem.country, project!.country),
            ),
          );
        if (Number(prices?.n ?? 0) === 0) return skip(`Aucun prix utilisable dans la bibliothèque pour ${project!.country} en ${dpgf!.currency} : sous-détails non établis.`);
      } else if (skipped(own.get("preparation"))) return skip(null);
      input = { dpgfId: prepared?.dpgfId, lineIds: [], instructions: options.instructions };
    } else if (stage === "audit") {
      return auditStep(rest, { ...ctx, results: own });
    } else {
      throw new Error(`Étape inconnue : ${name}.`);
    }

    const child: StepContext = { ...ctx, input, results: own };
    const outcome = await STAGES[stage].handler!.run(rest, child);
    if (!outcome) return { result: extra };
    return {
      result: Object.keys(extra).length ? { ...(outcome.result as Record<string, unknown>), ...extra } : outcome.result,
      addSteps: outcome.addSteps?.map((s) => `${stage}:${s}`),
    };
  },

  async finished(job, db) {
    const status = job.projectId ? await dossierStatus(db, job.projectId) : null;
    const open = status ? status.issues.bloquante + status.issues.majeure : 0;
    return {
      title: status ? `Dossier généré : niveau « ${status.levelLabel} », ${open} anomalie(s) à traiter` : "Dossier généré",
      link: job.projectId ? `/administration/affaires/${job.projectId}?onglet=dossier` : null,
    };
  },

  async failed(job, db) {
    // Documents restés « en génération » : ils redeviennent des brouillons consultables.
    const steps = await db
      .select({ name: schema.generationStep.name, result: schema.generationStep.result })
      .from(schema.generationStep)
      .where(and(eq(schema.generationStep.jobId, job.id), inArray(schema.generationStep.name, ["cctp:plan", "dpgf:preparation"])));
    const cctpId = (steps.find((s) => s.name === "cctp:plan")?.result as { documentId?: string } | null)?.documentId;
    const dpgfId = (steps.find((s) => s.name === "dpgf:preparation")?.result as { dpgfId?: string } | null)?.dpgfId;
    if (cctpId) await db.update(schema.cctpDocument).set({ status: "brouillon" }).where(and(eq(schema.cctpDocument.id, cctpId), eq(schema.cctpDocument.status, "en_generation")));
    if (dpgfId) await db.update(schema.dpgf).set({ status: "brouillon" }).where(and(eq(schema.dpgf.id, dpgfId), eq(schema.dpgf.status, "en_generation")));
  },
};
