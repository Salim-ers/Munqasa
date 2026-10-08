/** Énumérations PostgreSQL : les valeurs autorisées sont garanties par la base elle-même. */
import { pgEnum } from "drizzle-orm/pg-core";

export const countryEnum = pgEnum("country_code", ["MA", "FR"]);
export const currencyEnum = pgEnum("currency_code", ["MAD", "EUR"]);

export const projectStatusEnum = pgEnum("project_status", [
  "brouillon",
  "analyse",
  "etude_technique",
  "chiffrage",
  "controle_qualite",
  "pret_a_remettre",
  "archive",
]);
export const marketTypeEnum = pgEnum("market_type", [
  "appel_offres_ouvert",
  "appel_offres_restreint",
  "concours",
  "procedure_negociee",
  "consultation_privee",
  "gre_a_gre",
  "autre",
]);
export const sectorEnum = pgEnum("sector", ["public", "prive"]);
export const designPhaseEnum = pgEnum("design_phase", ["esquisse", "aps", "apd", "pro", "dce", "exe", "autre"]);
export const prospectStatusEnum = pgEnum("prospect_status", ["nouveau", "qualifie", "converti", "perdu"]);

export const fileKindEnum = pgEnum("file_kind", [
  "plan",
  "document_consultation",
  "document_technique",
  "bordereau_prix",
  "devis_fournisseur",
  "facture",
  "catalogue",
  "autre",
]);
export const fileStatusEnum = pgEnum("file_status", ["en_attente", "televerse", "verifie", "en_traitement", "traite", "echec", "rejete"]);
export const drawingKindEnum = pgEnum("drawing_kind", ["plan_masse", "plan_niveau", "coupe", "facade", "detail", "reseaux", "autre"]);

export const validationStatusEnum = pgEnum("validation_status", ["a_verifier", "verifie", "rejete"]);
export const measureMethodEnum = pgEnum("measure_method", [
  "longueur",
  "surface",
  "volume",
  "unite",
  "poids",
  "surface_developpee",
  "formule",
]);
export const measureSourceEnum = pgEnum("measure_source", ["cote_plan", "dxf", "ifc", "saisie", "proposition_ia"]);

export const referenceKindEnum = pgEnum("reference_kind", [
  "loi",
  "decret",
  "arrete",
  "ccag",
  "cctg",
  "norme",
  "dtu",
  "eurocode",
  "reglement",
  "regle_professionnelle",
  "autre",
]);
export const referenceScopeEnum = pgEnum("reference_scope", ["MA", "FR", "INT"]);

export const priceOriginEnum = pgEnum("price_origin", [
  "dpgf_historique",
  "devis_fournisseur",
  "facture_fournisseur",
  "catalogue",
  "bordereau_historique",
  "tableau_personnel",
  "base_sous_licence",
  "saisie_manuelle",
]);
export const priceKindEnum = pgEnum("price_kind", ["ouvrage", "materiau", "main_oeuvre", "materiel", "sous_traitance", "transport"]);

export const documentStatusEnum = pgEnum("document_status", ["brouillon", "en_generation", "a_valider", "valide", "archive"]);
export const sectionStatusEnum = pgEnum("section_status", ["a_rediger", "genere", "a_valider", "valide"]);
export const dpgfLineKindEnum = pgEnum("dpgf_line_kind", ["chapitre", "sous_chapitre", "poste"]);
export const lineStatusEnum = pgEnum("line_status", ["non_chiffre", "a_verifier", "valide"]);
export const componentCategoryEnum = pgEnum("component_category", [
  "materiau",
  "main_oeuvre",
  "materiel",
  "sous_traitance",
  "transport",
  "frais_chantier",
]);
/** Définition explicite de la marge, pour ne jamais compter deux fois les mêmes frais. */
export const marginModeEnum = pgEnum("margin_mode", ["taux_de_marge", "taux_de_marque", "coefficient"]);
export const rateBaseEnum = pgEnum("rate_base", ["debourse_sec", "debourse_total", "prix_de_revient"]);

export const quoteStatusEnum = pgEnum("quote_status", ["brouillon", "a_verifier", "valide", "envoye", "accepte", "refuse", "expire"]);
export const quoteLineKindEnum = pgEnum("quote_line_kind", ["section", "ligne", "option"]);
export const quoteEventKindEnum = pgEnum("quote_event_kind", [
  "creation",
  "modification",
  "validation",
  "envoi",
  "relance",
  "acceptation",
  "refus",
  "expiration",
  "duplication",
]);

export const rateKindEnum = pgEnum("rate_kind", ["reference", "achat", "vente", "contractuel"]);
export const documentTypeEnum = pgEnum("document_type", ["cctp", "dpgf", "sous_detail", "devis"]);

export const jobKindEnum = pgEnum("job_kind", [
  "analyse_plans",
  "generation_cctp",
  "generation_dpgf",
  "sous_detail",
  "generation_devis",
  "controle_qualite",
  "export",
  "import_prix",
]);
export const jobStatusEnum = pgEnum("job_status", ["en_attente", "en_cours", "termine", "echoue", "annule"]);
export const stepStatusEnum = pgEnum("step_status", ["en_attente", "en_cours", "termine", "echoue", "ignore"]);

export const issueSeverityEnum = pgEnum("issue_severity", ["bloquante", "majeure", "mineure", "information"]);
export const issueCategoryEnum = pgEnum("issue_category", [
  "completude",
  "reference",
  "source_manquante",
  "incoherence",
  "doublon",
  "unite",
  "calcul",
  "tracabilite",
  "version",
  "reserve",
]);
export const issueStatusEnum = pgEnum("issue_status", ["ouverte", "resolue", "ignoree"]);
export const notificationKindEnum = pgEnum("notification_kind", ["echeance", "traitement", "qualite", "prix", "securite", "systeme"]);
