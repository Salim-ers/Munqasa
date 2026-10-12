/**
 * « Générer le dossier » : un seul traitement enchaîne les agents de l'affaire, chacun avec ses propres
 * étapes, pour une progression réelle et une reprise exacte en cas d'interruption. Seuls travaillent les
 * agents nécessaires aux documents demandés :
 * 1. analyse des plans, classement des ouvrages par lot et métré (si le métré est demandé) ;
 * 2. pour chaque lot : CCTP (appuyé sur le métré), DPGF depuis ce CCTP, sous-détails de prix, recherche de
 *    prix des postes dans la bibliothèque ; un CCTP ou une DPGF déjà établis pour le lot sont repris ;
 * 3. devis depuis les DPGF des lots (si demandé) ;
 * 4. contrôle indépendant : recalculs, rendu contrôlé de chaque fichier du dossier (mise en page,
 *    pagination), contrôles qualité, niveau de validation.
 * Les agents partagent les mêmes ouvrages, références de plans et quantités : le CCTP cite les ouvrages du
 * métré, la DPGF reprend leurs quantités, les sous-détails et le devis reprennent les postes de la DPGF.
 * Chaque étape porte le nom de son agent et de son lot (« cctp#1:plan », « dpgf:chapitre:3 »…).
 */
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { type GenerationDocument } from "../../../shared/dossier.js";
import type { CctpDetailLevel } from "../../ai/schemas.js";
import { schema } from "../../db/index.js";
import { dossierStatus } from "../../services/dossier.js";
import { quoteExportAudit } from "../../services/export-audit.js";
import { createQuote, QuoteError } from "../../services/quotes.js";
import type { JobHandler, StepContext, StepOutcome } from "../types.js";
import { cctpHandler } from "./cctp.js";
import { auditStep } from "./dossier-audit.js";
import { RENDER_LABEL, renderStep, renderStepLabel } from "./dossier-render.js";
import { dpgfHandler } from "./dpgf.js";
import { planAnalysisHandler } from "./plan-analysis.js";
import { priceResearchStep } from "./price-research.js";
import { sousDetailHandler } from "./sous-detail.js";

/** Lot couvert par la génération, avec les documents déjà établis qu'elle reprend. */
export interface DossierLot {
  lotId: string | null;
  /** « Lot 02 Gros œuvre », pour les libellés d'étapes. */
  label: string | null;
  cctpId: string | null;
  dpgfId: string | null;
}

export interface DossierInput {
  fileIds: string[];
  /** Ancienne forme : un seul lot. */
  lotId: string | null;
  lots?: DossierLot[];
  documents?: GenerationDocument[];
  detailLevel: CctpDetailLevel;
  referenceIds: string[];
  vatRate: string | null;
  instructions: string | null;
  withSousDetails: boolean;
}

/** Documents demandés et lots couverts ; une génération lancée avant ces options garde son ancien déroulé. */
export function dossierPlan(input: DossierInput): { documents: Set<GenerationDocument>; lots: DossierLot[] } {
  const documents = new Set<GenerationDocument>(input.documents ?? [...(input.fileIds.length ? (["metre"] as const) : []), "cctp", "dpgf", ...(input.withSousDetails ? (["sous_details"] as const) : [])]);
  const lots = input.lots?.length ? input.lots : [{ lotId: input.lotId, label: null, cctpId: null, dpgfId: null }];
  return { documents, lots };
}

type Stage = "lecture" | "cctp" | "dpgf" | "sousdetail" | "prix" | "devis" | "rendu" | "audit";
const STAGE_LABELS: Record<Stage, string> = {
  lecture: "Plans et métré",
  cctp: "CCTP",
  dpgf: "DPGF",
  sousdetail: "Sous-détails",
  prix: "Recherche de prix",
  devis: "Devis",
  rendu: RENDER_LABEL,
  audit: "Contrôle indépendant",
};
const HANDLERS: Partial<Record<Stage, JobHandler>> = { lecture: planAnalysisHandler, cctp: cctpHandler, dpgf: dpgfHandler, sousdetail: sousDetailHandler };
const AUDIT_LABELS: Record<string, string> = { recalculs: "Recalcul des quantités, montants et sous-détails", controles: "Contrôles qualité et niveau de validation" };
const OWN_LABELS: Record<string, string> = { "prix:recherche": "Prix des postes dans la bibliothèque", "devis:creation": "Devis depuis les DPGF" };

const suffix = (lot: number) => (lot ? `#${lot}` : "");

/** « cctp#2:plan » : agent, rang du lot (0 sans suffixe), préfixe des étapes de l'agent pour ce lot, étape propre à l'agent. */
function split(name: string): { stage: Stage; lot: number; key: string; rest: string } {
  const at = name.indexOf(":");
  const key = name.slice(0, at);
  const [stage, lot] = key.split("#");
  return { stage: stage as Stage, lot: lot ? Number(lot) : 0, key, rest: name.slice(at + 1) };
}

/** Résultats des étapes déjà faites d'un agent, sous leurs propres noms. */
function stageResults(results: Map<string, unknown>, key: string): Map<string, unknown> {
  const prefix = `${key}:`;
  return new Map([...results].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));
}

/** Étape écartée par la chaîne (marqueur propre : les agents ont leurs propres champs « skipped »). */
const skipped = (value: unknown) => (value as { stageSkipped?: boolean } | undefined)?.stageSkipped === true;

/** DPGF du lot : établie par cette génération, ou reprise. */
function dpgfOf(results: Map<string, unknown>, lots: DossierLot[], lot: number): string | null {
  return (results.get(`dpgf${suffix(lot)}:preparation`) as { dpgfId?: string } | undefined)?.dpgfId ?? lots[lot]?.dpgfId ?? null;
}

export const dossierHandler: JobHandler = {
  kind: "generation_dossier",
  title: () => "Génération du dossier",
  stepLabel(name, job) {
    const { stage, lot, rest } = split(name);
    const label = STAGE_LABELS[stage];
    if (!label) return name;
    const { lots } = dossierPlan(job.input as unknown as DossierInput);
    const lotLabel = lots.length > 1 && lots[lot]?.label && ["lecture", "cctp", "dpgf", "sousdetail", "prix"].includes(stage) && !(stage === "lecture" && rest !== "metre") ? `, ${lots[lot]!.label}` : "";
    const handler = HANDLERS[stage];
    const detail = handler ? handler.stepLabel(rest, job) : stage === "audit" ? (AUDIT_LABELS[rest] ?? rest) : stage === "rendu" ? renderStepLabel(rest) : (OWN_LABELS[`${stage}:${rest}`] ?? rest);
    return `${label}${lotLabel} : ${detail}`;
  },
  initialSteps(input) {
    const { documents, lots } = dossierPlan(input as unknown as DossierInput);
    const steps: string[] = [];
    if (documents.has("metre")) {
      steps.push("lecture:preparation");
      lots.forEach((_, i) => steps.push(`lecture${suffix(i)}:metre`));
    }
    lots.forEach((_, i) => {
      const s = suffix(i);
      if (documents.has("cctp")) steps.push(`cctp${s}:plan`, `cctp${s}:controle`);
      if (documents.has("dpgf")) steps.push(`dpgf${s}:preparation`, `dpgf${s}:controle`);
      if (documents.has("sous_details")) steps.push(`sousdetail${s}:preparation`, `sousdetail${s}:controle`);
      if (documents.has("prix")) steps.push(`prix${s}:recherche`);
    });
    if (documents.has("devis")) steps.push("devis:creation");
    steps.push("audit:recalculs", "rendu:preparation", "rendu:bilan", "audit:controles");
    return steps;
  },

  async run(name, ctx) {
    const { stage, lot, key, rest } = split(name);
    const options = ctx.input as unknown as DossierInput;
    const { lots } = dossierPlan(options);
    const current = lots[lot] ?? { lotId: options.lotId, label: null, cctpId: null, dpgfId: null };
    const { db } = ctx;
    const projectId = ctx.job.projectId!;
    // Plans lus une fois pour tous les lots : le métré de chaque lot part des mêmes relevés.
    const own = stageResults(ctx.results, stage === "lecture" ? "lecture" : key);
    const skip = async (message: string | null): Promise<StepOutcome> => {
      if (message) await ctx.log(message);
      return { result: { stageSkipped: true } };
    };

    let input: Record<string, unknown>;
    let extra: Record<string, unknown> = {};
    if (stage === "lecture") {
      if (rest === "preparation" && options.fileIds.length === 0) return skip("Aucun plan choisi : lecture des plans non lancée, le métré existant est conservé.");
      if (rest !== "preparation" && skipped(own.get("preparation"))) return skip(null);
      input = { fileIds: options.fileIds, lotId: current.lotId, lotIds: lots.map((l) => l.lotId).filter(Boolean) };
    } else if (stage === "cctp") {
      let useMetre = (own.get("plan") as { useMetre?: boolean } | undefined)?.useMetre;
      if (rest === "plan") {
        const [count] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.workItem)
          .where(and(eq(schema.workItem.projectId, projectId), current.lotId ? eq(schema.workItem.lotId, current.lotId) : undefined));
        useMetre = Number(count?.n ?? 0) > 0;
        if (!useMetre) await ctx.log("Aucun ouvrage au métré : le CCTP est rédigé sans quantités.");
        extra = { useMetre };
      }
      input = { mode: "generation", lotId: current.lotId, detailLevel: options.detailLevel, useMetre: Boolean(useMetre), referenceIds: options.referenceIds, instructions: options.instructions };
    } else if (stage === "dpgf") {
      const plan = ctx.results.get(`cctp${suffix(lot)}:plan`) as { documentId?: string } | undefined;
      const cctpDocumentId = plan?.documentId ?? current.cctpId;
      if (!cctpDocumentId) throw new Error("CCTP introuvable : la DPGF ne peut pas être établie.");
      if (rest === "preparation" && !plan?.documentId) {
        const [cctp] = await db.select({ title: schema.cctpDocument.title, status: schema.cctpDocument.status }).from(schema.cctpDocument).where(eq(schema.cctpDocument.id, cctpDocumentId));
        if (!cctp || cctp.status === "archive") throw new Error("Le CCTP repris pour ce lot a été archivé ou supprimé : la DPGF ne peut pas être établie.");
        await ctx.log(`CCTP repris : ${cctp.title}.`);
      }
      input = { cctpDocumentId, vatRate: options.vatRate, instructions: options.instructions };
    } else if (stage === "sousdetail") {
      const dpgfId = dpgfOf(ctx.results, lots, lot);
      if (rest === "preparation") {
        if (!options.withSousDetails && !options.documents?.includes("sous_details")) return skip("Sous-détails non demandés.");
        if (!dpgfId) return skip("DPGF introuvable : sous-détails non établis.");
        const [dpgf] = await db.select().from(schema.dpgf).where(eq(schema.dpgf.id, dpgfId));
        const [project] = await db.select().from(schema.project).where(eq(schema.project.id, projectId));
        if (!dpgf) return skip("DPGF introuvable : sous-détails non établis.");
        const [prices] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.priceItem)
          .where(
            and(
              isNull(schema.priceItem.archivedAt),
              ne(schema.priceItem.verificationStatus, "rejete"),
              ne(schema.priceItem.kind, "ratio"),
              eq(schema.priceItem.currency, dpgf.currency),
              eq(schema.priceItem.country, project!.country),
            ),
          );
        if (Number(prices?.n ?? 0) === 0) return skip(`Aucun prix utilisable dans la bibliothèque pour ${project!.country} en ${dpgf.currency} : sous-détails non établis.`);
      } else if (skipped(own.get("preparation"))) return skip(null);
      input = { dpgfId, lineIds: [], instructions: options.instructions };
    } else if (stage === "prix") {
      const dpgfId = dpgfOf(ctx.results, lots, lot);
      if (!dpgfId) return skip("DPGF introuvable : recherche de prix non lancée.");
      return priceResearchStep(ctx, dpgfId);
    } else if (stage === "devis") {
      return quoteStep(ctx, lots);
    } else if (stage === "rendu") {
      const outcome = await renderStep(rest, { ...ctx, results: own });
      return { result: outcome.result, addSteps: outcome.addSteps?.map((s) => `rendu:${s}`) };
    } else if (stage === "audit") {
      return auditStep(rest, { ...ctx, results: own });
    } else {
      throw new Error(`Étape inconnue : ${name}.`);
    }

    const child: StepContext = { ...ctx, input, results: own };
    const outcome = await HANDLERS[stage]!.run(rest, child);
    if (!outcome) return { result: extra };
    return {
      result: Object.keys(extra).length ? { ...(outcome.result as Record<string, unknown>), ...extra } : outcome.result,
      addSteps: outcome.addSteps?.map((s) => `${stage === "lecture" ? "lecture" : key}:${s}`),
    };
  },

  async finished(job, db) {
    const status = job.projectId ? await dossierStatus(db, job.projectId) : null;
    const open = status ? status.issues.bloquante + status.issues.majeure : 0;
    const [devis] = await db.select({ result: schema.generationStep.result }).from(schema.generationStep).where(and(eq(schema.generationStep.jobId, job.id), eq(schema.generationStep.name, "devis:creation")));
    const quote = (devis?.result ?? null) as { number?: string } | null;
    return {
      title: status ? `Dossier généré : niveau « ${status.levelLabel} », ${open} anomalie(s) à traiter${quote?.number ? `, devis ${quote.number} préparé` : ""}` : "Dossier généré",
      link: job.projectId ? `/administration/affaires/${job.projectId}?onglet=dossier` : null,
    };
  },

  async failed(job, db) {
    // Documents restés « en génération » : ils redeviennent des brouillons consultables.
    const steps = await db.select({ name: schema.generationStep.name, result: schema.generationStep.result }).from(schema.generationStep).where(eq(schema.generationStep.jobId, job.id));
    const cctpIds = steps.filter((s) => /^cctp(#\d+)?:plan$/.test(s.name)).map((s) => (s.result as { documentId?: string } | null)?.documentId).filter((v): v is string => Boolean(v));
    const dpgfIds = steps.filter((s) => /^dpgf(#\d+)?:preparation$/.test(s.name)).map((s) => (s.result as { dpgfId?: string } | null)?.dpgfId).filter((v): v is string => Boolean(v));
    if (cctpIds.length) await db.update(schema.cctpDocument).set({ status: "brouillon" }).where(and(inArray(schema.cctpDocument.id, cctpIds), eq(schema.cctpDocument.status, "en_generation")));
    if (dpgfIds.length) await db.update(schema.dpgf).set({ status: "brouillon" }).where(and(inArray(schema.dpgf.id, dpgfIds), eq(schema.dpgf.status, "en_generation")));
  },
};

/**
 * Agent de devis : un devis brouillon depuis les DPGF des lots, postes, quantités et prix repris avec leur
 * provenance (une section par lot s'il y en a plusieurs), puis contrôle avant export du devis rendu.
 * Une reprise après interruption ne crée pas de second devis.
 */
async function quoteStep(ctx: StepContext, lots: DossierLot[]): Promise<StepOutcome> {
  const { db } = ctx;
  const projectId = ctx.job.projectId!;
  const [existing] = await db.select({ id: schema.quote.id, number: schema.quote.number }).from(schema.quote).where(eq(schema.quote.generationJobId, ctx.job.id));
  if (existing) {
    await ctx.log(`Devis ${existing.number} déjà préparé par cette génération.`);
    return { result: { quoteId: existing.id, number: existing.number } };
  }
  const dpgfIds = [...new Set(lots.map((_, i) => dpgfOf(ctx.results, lots, i)).filter((v): v is string => Boolean(v)))];
  if (dpgfIds.length === 0) return { result: { stageSkipped: true } };
  let quote;
  try {
    const lotIds = [...new Set(lots.filter((_, i) => dpgfOf(ctx.results, lots, i)).map((l) => l.lotId).filter((v): v is string => Boolean(v)))];
    quote = await createQuote(db, { mode: "dpgf", projectId, dpgfIds, dpgfId: dpgfIds[0], lotIds });
  } catch (error) {
    if (error instanceof QuoteError) throw new Error(`Devis impossible : ${error.message}`);
    throw error;
  }
  await db.update(schema.quote).set({ generationJobId: ctx.job.id }).where(eq(schema.quote.id, quote.id));
  await db.insert(schema.quoteEvent).values({ quoteId: quote.id, kind: "generation", note: "Préparé par la génération du dossier depuis les DPGF de l’affaire." });
  const lines = await db.select({ unitPrice: schema.quoteLine.unitPrice, kind: schema.quoteLine.kind }).from(schema.quoteLine).where(eq(schema.quoteLine.quoteId, quote.id));
  const items = lines.filter((l) => l.kind === "ligne");
  const audit = await quoteExportAudit(db, quote.id, { render: true });
  await ctx.log(`Devis ${quote.number} préparé en brouillon : ${items.length} ligne(s), ${items.filter((l) => l.unitPrice !== null).length} prix repris de la DPGF, ${items.filter((l) => l.unitPrice === null).length} à établir.`);
  await ctx.log(`Contrôle avant export du devis : ${audit.verdictLabel}.`);
  return { result: { quoteId: quote.id, number: quote.number, lines: items.length, verdict: audit.verdict } };
}
