/**
 * Niveaux de validation d'un dossier d'affaire, calculés à chaque lecture à partir de l'état réel des
 * documents, du dernier contrôle indépendant et de la validation professionnelle. Aucun niveau n'est
 * attribué d'office : chacun suppose le précédent.
 *
 * - brouillon : CCTP ou DPGF absent, traitement en cours, ou anomalie bloquante ouverte ;
 * - terminé avec réserves : CCTP et DPGF établis, sans anomalie bloquante, mais anomalie majeure ouverte ou
 *   aucun contrôle indépendant depuis la dernière modification ;
 * - vérification automatique réussie : contrôle indépendant postérieur à la dernière modification, aucune
 *   anomalie bloquante ni majeure ouverte ;
 * - prêt pour validation professionnelle : en plus, toutes les mesures vérifiées ou rejetées, tous les postes
 *   chiffrés, tous les articles rédigés ;
 * - validé par un professionnel habilité : en plus, CCTP et DPGF validés et déclaration de validation signée
 *   après leur dernière modification. La plateforme enregistre la déclaration ; elle ne certifie ni la
 *   qualification du signataire ni la conformité réglementaire du dossier.
 */
export const DOSSIER_LEVELS = ["brouillon", "terminee_avec_reserves", "verification_automatique_reussie", "pret_pour_validation", "valide_professionnel"] as const;
export type DossierLevel = (typeof DOSSIER_LEVELS)[number];
export const DOSSIER_LEVEL_LABELS: Record<DossierLevel, string> = {
  brouillon: "Brouillon",
  terminee_avec_reserves: "Généré avec réserves",
  verification_automatique_reussie: "Vérification automatique réussie",
  pret_pour_validation: "Prêt pour revue",
  valide_professionnel: "Validé par un professionnel",
};

/**
 * Statut imprimé sur chaque document exporté (couverture, en-tête du classeur), calculé à l'export :
 * - brouillon : document en cours de génération ou jamais généré ;
 * - généré avec réserves : il manque des quantités, des prix, des prescriptions, des décompositions ou des
 *   pièces de conception, ou une anomalie bloquante ou majeure reste ouverte ;
 * - vérification automatique réussie : aucune réserve ; ce contrôle n'est pas une validation ;
 * - prêt pour revue : en plus, document validé par l'utilisateur ;
 * - validé par un professionnel : en plus, déclaration de validation professionnelle à jour couvrant le
 *   document. Aucun contrôle automatique ne vaut validation réglementaire ou structurelle.
 */
export const DOCUMENT_LEVELS = ["brouillon", "genere_avec_reserves", "verification_automatique_reussie", "pret_pour_revue", "valide_professionnel"] as const;
export type DocumentLevel = (typeof DOCUMENT_LEVELS)[number];
export const DOCUMENT_LEVEL_LABELS: Record<DocumentLevel, string> = {
  brouillon: "Brouillon",
  genere_avec_reserves: "Généré avec réserves",
  verification_automatique_reussie: "Vérification automatique réussie",
  pret_pour_revue: "Prêt pour revue",
  valide_professionnel: "Validé par un professionnel",
};

/** Correction appliquée par le contrôle indépendant à une erreur calculable. */
export interface AuditFix {
  kind: "mesure" | "quantite_dpgf" | "montant_dpgf" | "prix_sous_detail" | "sous_detail" | "pertes";
  target: string;
  before: string | null;
  after: string | null;
  note: string;
}

export interface AuditSummary {
  fixes: AuditFix[];
  issues: { bloquante: number; majeure: number; mineure: number; information: number };
  checked: { measurements: number; dpgfLines: number; breakdowns: number; documents: number };
  /** Empreinte du contenu contrôlé : toute modification ultérieure la change et rend le contrôle caduc. */
  fingerprint: string;
}

/** Critère d'un niveau, tel qu'affiché : rempli ou non, avec son explication. */
export interface LevelCriterion {
  level: DossierLevel;
  label: string;
  met: boolean;
  detail: string | null;
}
