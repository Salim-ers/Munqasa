/**
 * Contrôle avant export : les quinze points vérifiés avant l'export d'un dossier ou d'un devis.
 *
 * Chaque anomalie du contrôle qualité est rattachée à l'un de ces points ; la mise en page et la pagination
 * viennent du contrôle des fichiers réellement produits (PDF relu, structure du Word et de l'Excel). Un point
 * sans rien à contrôler est « sans objet », un point que rien n'a encore vérifié est « non contrôlé » : aucun
 * n'est déclaré conforme d'office. Une anomalie bloquante ouverte interdit toute déclaration de validité.
 */
import type { IssueCategory } from "./enums.js";

export const AUDIT_POINTS = [
  "ouvrages",
  "lots",
  "unites",
  "quantites",
  "formules",
  "prix",
  "pertes",
  "taxes",
  "totaux",
  "doublons",
  "references_documents",
  "references_reglementaires",
  "mise_en_page",
  "pagination",
  "statuts",
] as const;
export type AuditPoint = (typeof AUDIT_POINTS)[number];

export const AUDIT_POINT_LABELS: Record<AuditPoint, string> = {
  ouvrages: "Cohérence des ouvrages",
  lots: "Cohérence des lots",
  unites: "Unités",
  quantites: "Quantités",
  formules: "Formules",
  prix: "Prix",
  pertes: "Pertes",
  taxes: "Taxes",
  totaux: "Totaux",
  doublons: "Doublons",
  references_documents: "Références des documents",
  references_reglementaires: "Références réglementaires",
  mise_en_page: "Mise en page",
  pagination: "Pagination",
  statuts: "Statuts",
};

/** Ce que vérifie chaque point, tel qu'affiché. */
export const AUDIT_POINT_HINTS: Record<AuditPoint, string> = {
  ouvrages: "Postes reliés à un ouvrage existant du métré, ouvrages mesurés repris dans la DPGF",
  lots: "Documents et ouvrages rattachés aux lots de l’affaire, numéros de lot uniques",
  unites: "Unité de chaque poste, mesure et prix, identique à celle de l’ouvrage",
  quantites: "Quantités renseignées, positives, à jour avec le métré",
  formules: "Formules du métré calculables, quantités et montants recalculés",
  prix: "Prix renseignés, actuels, dans la devise du document, cohérents avec les sous-détails",
  pertes: "Pertes appliquées une seule fois, taux plausibles",
  taxes: "Taux de TVA renseignés et courants pour le pays, régime de TVA cohérent",
  totaux: "Sous-totaux et totaux recalculés, totaux partiels signalés",
  doublons: "Codes, numéros d’article et postes sans doublon",
  references_documents: "Renvois entre documents, postes et articles du CCTP, mesures et plans, mentions du devis",
  references_reglementaires: "Normes et textes cités présents au référentiel, ni rejetés ni à vérifier",
  mise_en_page: "Marges, superpositions, textes complets, titres et pages, couverture",
  pagination: "En-têtes, pieds de page et numérotation des pages",
  statuts: "Statuts des documents cohérents avec les anomalies ouvertes",
};

/** Point d'une anomalie enregistrée sans point (contrôles antérieurs), d'après sa catégorie. */
export const CATEGORY_POINT: Record<IssueCategory, AuditPoint> = {
  completude: "statuts",
  reference: "references_reglementaires",
  source_manquante: "prix",
  incoherence: "prix",
  doublon: "doublons",
  unite: "unites",
  calcul: "formules",
  tracabilite: "references_documents",
  version: "prix",
  reserve: "statuts",
};

export type AuditPointState = "conforme" | "reserves" | "bloquant" | "non_controle" | "sans_objet";

export const AUDIT_STATE_LABELS: Record<AuditPointState, string> = {
  conforme: "Aucune anomalie",
  reserves: "Réserves",
  bloquant: "Bloquant",
  non_controle: "Non contrôlé",
  sans_objet: "Sans objet",
};

export interface AuditPointResult {
  point: AuditPoint;
  label: string;
  state: AuditPointState;
  counts: { bloquante: number; majeure: number; mineure: number; information: number };
  /** Anomalies du point, les plus graves d'abord (extrait). */
  details: string[];
}

export type AuditVerdict = "bloquant" | "reserves" | "conforme";

export interface ExportAudit {
  points: AuditPointResult[];
  counts: { bloquante: number; majeure: number; mineure: number; information: number };
  verdict: AuditVerdict;
  verdictLabel: string;
  /** Dernier contrôle des fichiers produits (mise en page et pagination). */
  rendering: { checkedAt: string | null; upToDate: boolean; files: number; anomalies: number };
  checkedAt: string;
}

/** Fichier produit et contrôlé : anomalies de mise en page ou de structure restantes. */
export interface RenderedFileCheck {
  document: string;
  kind: string;
  format: "pdf" | "docx" | "xlsx";
  pages: number | null;
  issues: Array<{ kind: string; page: number | null; detail: string }>;
}

/** Anomalies de rendu rattachées à la pagination ; les autres relèvent de la mise en page. */
export const PAGINATION_KINDS = ["en_tete", "pied_de_page", "numerotation"];

export function verdictLabel(verdict: AuditVerdict, counts: { bloquante: number; majeure: number; mineure: number }): string {
  if (verdict === "bloquant") return `${counts.bloquante} anomalie${counts.bloquante > 1 ? "s" : ""} bloquante${counts.bloquante > 1 ? "s" : ""} : aucun document ne peut être déclaré validé tant qu’elle${counts.bloquante > 1 ? "s" : ""} subsiste${counts.bloquante > 1 ? "nt" : ""}`;
  if (verdict === "reserves") {
    const n = counts.majeure + counts.mineure;
    return n ? `Aucune anomalie bloquante, ${n} réserve${n > 1 ? "s" : ""} à lever ou à justifier` : "Aucune anomalie bloquante, contrôle des fichiers produits à faire";
  }
  return "Aucune anomalie relevée par le contrôle automatique, qui ne remplace pas la vérification d’un professionnel";
}
