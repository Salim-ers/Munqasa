/**
 * Documents d'un dossier d'affaire, tels que les produit l'export complet : CCTP, DPGF et documents qui en
 * dérivent, sous-détails, note de métrés, rapport d'analyse des plans. Une seule liste sert au dossier ZIP
 * et au contrôle des fichiers produits avant export, pour que l'un contrôle exactement ce que l'autre livre.
 */
import { asc, eq, inArray } from "drizzle-orm";
import { type Database, schema } from "../db/index.js";
import type { DocumentKind } from "./model.js";
import type { ExportFormat } from "./registry.js";

export type DossierDocumentKind = Exclude<DocumentKind, "bibliotheque" | "devis" | "controle">;

export interface DossierDocument {
  folder: string;
  /** Libellé du document (titre du CCTP ou de la DPGF, nom de la note). */
  label: string;
  kind: DossierDocumentKind;
  /** Identifiant passé au rendu : CCTP, DPGF ou affaire. */
  id: string;
  formats: ExportFormat[];
}

export const DOSSIER_KIND_LABELS: Record<DossierDocumentKind, string> = {
  cctp: "CCTP",
  dpgf: "DPGF",
  bpu: "Bordereau des prix",
  dqe: "Détail quantitatif estimatif",
  estimation: "Estimation des travaux",
  sous_details: "Sous-détails",
  metre: "Note de métrés",
  analyse: "Rapport d’analyse des plans",
};

/** Formats livrés pour chaque document du dossier (format natif, puis PDF). */
export const DOSSIER_FORMATS: Record<DossierDocumentKind, ExportFormat[]> = {
  cctp: ["docx", "pdf"],
  dpgf: ["xlsx", "pdf"],
  bpu: ["xlsx", "pdf"],
  dqe: ["xlsx", "pdf"],
  estimation: ["xlsx", "pdf"],
  sous_details: ["xlsx", "pdf"],
  metre: ["xlsx", "pdf"],
  analyse: ["pdf"],
};

export async function dossierDocuments(db: Database, projectId: string): Promise<DossierDocument[]> {
  const [cctps, dpgfs, items, drawings] = await Promise.all([
    db.select({ id: schema.cctpDocument.id, title: schema.cctpDocument.title }).from(schema.cctpDocument).where(eq(schema.cctpDocument.projectId, projectId)).orderBy(asc(schema.cctpDocument.createdAt)),
    db.select({ id: schema.dpgf.id, title: schema.dpgf.title }).from(schema.dpgf).where(eq(schema.dpgf.projectId, projectId)).orderBy(asc(schema.dpgf.createdAt)),
    db.select({ id: schema.workItem.id }).from(schema.workItem).where(eq(schema.workItem.projectId, projectId)).limit(1),
    db.select({ id: schema.drawing.id }).from(schema.drawing).where(eq(schema.drawing.projectId, projectId)).limit(1),
  ]);
  const breakdowns = dpgfs.length
    ? await db
        .selectDistinct({ dpgfId: schema.dpgfLine.dpgfId })
        .from(schema.priceBreakdown)
        .innerJoin(schema.dpgfLine, eq(schema.dpgfLine.id, schema.priceBreakdown.dpgfLineId))
        .where(inArray(schema.dpgfLine.dpgfId, dpgfs.map((d) => d.id)))
    : [];
  const docs: DossierDocument[] = [];
  const push = (folder: string, label: string, kind: DossierDocumentKind, id: string) => docs.push({ folder, label, kind, id, formats: DOSSIER_FORMATS[kind] });
  for (const c of cctps) push("01 CCTP", c.title, "cctp", c.id);
  for (const d of dpgfs) {
    push("02 DPGF", d.title, "dpgf", d.id);
    push("03 BPU", d.title, "bpu", d.id);
    push("04 DQE", d.title, "dqe", d.id);
    push("05 Estimation", d.title, "estimation", d.id);
    if (breakdowns.some((b) => b.dpgfId === d.id)) push("06 Sous-détails", d.title, "sous_details", d.id);
  }
  if (items.length) push("07 Métrés", "Note de métrés", "metre", projectId);
  if (drawings.length) push("08 Rapports", "Rapport d’analyse des plans", "analyse", projectId);
  return docs;
}
