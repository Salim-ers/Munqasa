/**
 * Statut imprimé sur un document exporté (voir shared/dossier.ts, DOCUMENT_LEVELS), calculé sur l'état réel :
 * réserves tirées des données (quantités, prix, décompositions, articles, mesures, pièces graphiques) et des
 * anomalies bloquantes ou majeures encore ouvertes. Jamais « validé » d'office : une validation par
 * l'utilisateur donne au mieux « Prêt pour revue », seule une déclaration professionnelle à jour donne
 * « Validé par un professionnel ».
 */
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { DOCUMENT_LEVEL_LABELS, type DocumentLevel } from "../../shared/dossier.js";
import type { DocumentStatus, DocumentType } from "../../shared/enums.js";
import { type Database, schema } from "../db/index.js";
import { isUndecomposed, resultOf } from "./breakdowns.js";
import { dossierStatus } from "./dossier.js";

export interface DocumentLevelInfo {
  level: DocumentLevel;
  label: string;
  /** Réserves qui empêchent un statut plus élevé, dites précisément. */
  reserves: string[];
}

export type DocumentTarget =
  | { type: "cctp"; id: string }
  | { type: "dpgf" | "bpu" | "dqe" | "estimation" | "sous_details"; id: string }
  | { type: "metre"; projectId: string; lotId?: string | null };

/** Niveau à partir des réserves et de l'état de validation, pour un document courant ou une version figée. */
export function levelFrom(reserves: string[], state: { draft: boolean; validated: boolean; professional: boolean }): DocumentLevelInfo {
  let level: DocumentLevel;
  if (state.draft) level = "brouillon";
  else if (reserves.length) level = "genere_avec_reserves";
  else if (state.validated && state.professional) level = "valide_professionnel";
  else if (state.validated) level = "pret_pour_revue";
  else level = "verification_automatique_reussie";
  return { level, label: DOCUMENT_LEVEL_LABELS[level], reserves };
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** Réserves d'une DPGF (et des documents qui en dérivent) d'après ses postes. */
export function dpgfReserves(postes: Array<{ quantity: string | null; unitPrice: string | null }>, options: { prices: boolean }): string[] {
  const reserves: string[] = [];
  if (postes.length === 0) reserves.push("aucun poste défini");
  const withoutQuantity = postes.filter((p) => p.quantity === null).length;
  const withoutPrice = postes.filter((p) => p.unitPrice === null).length;
  if (withoutQuantity) reserves.push(`${plural(withoutQuantity, "poste", "postes")} sans quantité justifiée`);
  if (options.prices && withoutPrice) reserves.push(`${plural(withoutPrice, "poste", "postes")} sans prix unitaire`);
  return reserves;
}

/** Anomalies bloquantes ou majeures ouvertes d'un document, hors complétude (déjà comptée par les données). */
async function openIssues(db: Database, documentType: DocumentType, documentId: string): Promise<string[]> {
  const rows = await db
    .select({ severity: schema.qualityIssue.severity, n: sql<number>`count(*)::int` })
    .from(schema.qualityIssue)
    .where(
      and(
        eq(schema.qualityIssue.documentType, documentType),
        eq(schema.qualityIssue.documentId, documentId),
        eq(schema.qualityIssue.status, "ouverte"),
        inArray(schema.qualityIssue.severity, ["bloquante", "majeure"]),
        ne(schema.qualityIssue.category, "completude"),
      ),
    )
    .groupBy(schema.qualityIssue.severity);
  const out: string[] = [];
  for (const severity of ["bloquante", "majeure"] as const) {
    const n = Number(rows.find((r) => r.severity === severity)?.n ?? 0);
    if (n) out.push(`${plural(n, `anomalie ${severity}`, `anomalies ${severity}s`)} à traiter`);
  }
  return out;
}

/** Aucune planche analysée pour l'affaire : les quantités et dispositions ne s'appuient sur aucune pièce graphique. */
async function drawingsReserve(db: Database, projectId: string): Promise<string[]> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.drawing)
    .innerJoin(schema.sourceFile, eq(schema.sourceFile.id, schema.drawing.sourceFileId))
    .where(and(eq(schema.drawing.projectId, projectId), isNull(schema.sourceFile.deletedAt), sql`${schema.drawing.extraction} is not null`));
  return Number(row?.n ?? 0) === 0 ? ["aucune pièce graphique analysée"] : [];
}

const isDraft = (status: DocumentStatus) => status === "brouillon" || status === "en_generation";

/** Le dossier de l'affaire porte-t-il une déclaration professionnelle à jour couvrant ce document ? */
async function professionallyValidated(db: Database, projectId: string, documentId: string | null): Promise<boolean> {
  const status = await dossierStatus(db, projectId);
  if (status.level !== "valide_professionnel") return false;
  if (documentId === null) return true;
  const [declaration] = await db.select().from(schema.dossierValidation).where(eq(schema.dossierValidation.projectId, projectId)).orderBy(sql`${schema.dossierValidation.createdAt} desc`).limit(1);
  return Boolean(declaration?.documents.some((d) => d.id === documentId));
}

export async function documentLevel(db: Database, target: DocumentTarget): Promise<DocumentLevelInfo> {
  if (target.type === "cctp") {
    const [doc] = await db.select().from(schema.cctpDocument).where(eq(schema.cctpDocument.id, target.id));
    if (!doc) return levelFrom(["document introuvable"], { draft: true, validated: false, professional: false });
    const articles = await db
      .select({ status: schema.cctpSection.status, content: schema.cctpSection.content })
      .from(schema.cctpSection)
      .where(and(eq(schema.cctpSection.documentId, doc.id), eq(schema.cctpSection.kind, "article")));
    const unwritten = articles.filter((a) => a.status === "a_rediger" || (a.content as unknown[]).length === 0).length;
    const reserves = [
      ...(articles.length === 0 ? ["aucun article rédigé"] : []),
      ...(unwritten ? [`${plural(unwritten, "article", "articles")} à rédiger`] : []),
      ...(await drawingsReserve(db, doc.projectId)),
      ...(await openIssues(db, "cctp", doc.id)),
    ];
    const validated = doc.status === "valide";
    return levelFrom(reserves, { draft: isDraft(doc.status), validated, professional: validated && !reserves.length && (await professionallyValidated(db, doc.projectId, doc.id)) });
  }

  if (target.type === "metre") {
    const items = await db
      .select()
      .from(schema.workItem)
      .where(and(eq(schema.workItem.projectId, target.projectId), target.lotId ? eq(schema.workItem.lotId, target.lotId) : undefined));
    const measures = items.length
      ? await db
          .select()
          .from(schema.measurement)
          .where(and(inArray(schema.measurement.workItemId, items.map((i) => i.id)), ne(schema.measurement.status, "rejete")))
      : [];
    const unmeasured = items.filter((i) => !measures.some((m) => m.workItemId === i.id && m.quantity !== null)).length;
    const toVerify = measures.filter((m) => m.status === "a_verifier").length;
    const incalculable = measures.filter((m) => m.quantity === null).length;
    const weak = measures.filter((m) => m.confidence === "faible" && m.status === "a_verifier").length;
    const reserves = [
      ...(items.length === 0 ? ["aucun ouvrage métré"] : []),
      ...(unmeasured ? [`${plural(unmeasured, "ouvrage", "ouvrages")} sans mesure`] : []),
      ...(incalculable ? [`${plural(incalculable, "mesure incalculable", "mesures incalculables")}`] : []),
      ...(weak ? [`${plural(weak, "mesure", "mesures")} de confiance faible`] : []),
      ...(await drawingsReserve(db, target.projectId)),
    ];
    const validated = measures.length > 0 && toVerify === 0;
    return levelFrom(reserves, { draft: items.length === 0, validated, professional: validated && !reserves.length && (await professionallyValidated(db, target.projectId, null)) });
  }

  const [doc] = await db.select().from(schema.dpgf).where(eq(schema.dpgf.id, target.id));
  if (!doc) return levelFrom(["document introuvable"], { draft: true, validated: false, professional: false });
  const postes = await db
    .select()
    .from(schema.dpgfLine)
    .where(and(eq(schema.dpgfLine.dpgfId, doc.id), eq(schema.dpgfLine.kind, "poste")));

  if (target.type === "sous_details") {
    const breakdowns = postes.length ? await db.select().from(schema.priceBreakdown).where(inArray(schema.priceBreakdown.dpgfLineId, postes.map((p) => p.id))) : [];
    const components = breakdowns.length ? await db.select().from(schema.priceBreakdownComponent).where(inArray(schema.priceBreakdownComponent.breakdownId, breakdowns.map((b) => b.id))) : [];
    const own = (id: string) => components.filter((c) => c.breakdownId === id);
    const impossible = breakdowns.filter((b) => isUndecomposed(b, own(b.id))).length;
    const incomplete = breakdowns.filter((b) => !isUndecomposed(b, own(b.id))).filter((b) => {
      const r = resultOf(b, own(b.id));
      return "error" in r || r.prixDeVente === null;
    }).length;
    const without = postes.length - breakdowns.length;
    const reserves = [
      ...(postes.length === 0 ? ["aucun poste défini"] : []),
      ...(without ? [`${plural(without, "poste", "postes")} sans sous-détail`] : []),
      ...(impossible ? [`${plural(impossible, "décomposition impossible", "décompositions impossibles")}, caractéristiques à confirmer`] : []),
      ...(incomplete ? [`${plural(incomplete, "sous-détail", "sous-détails")} au chiffrage incomplet`] : []),
      ...(await openIssues(db, "sous_detail", doc.id)),
    ];
    const validated = breakdowns.length > 0 && breakdowns.every((b) => b.locked);
    return levelFrom(reserves, { draft: isDraft(doc.status) && breakdowns.length === 0, validated, professional: validated && !reserves.length && (await professionallyValidated(db, doc.projectId, doc.id)) });
  }

  const reserves = [...dpgfReserves(postes, { prices: true }), ...(await drawingsReserve(db, doc.projectId)), ...(await openIssues(db, "dpgf", doc.id))];
  const validated = doc.status === "valide";
  return levelFrom(reserves, { draft: isDraft(doc.status), validated, professional: validated && !reserves.length && (await professionallyValidated(db, doc.projectId, doc.id)) });
}
