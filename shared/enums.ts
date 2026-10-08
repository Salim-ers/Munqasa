/**
 * Valeurs des énumérations, source unique pour la base (pgEnum), le serveur (Zod) et l'interface.
 * Les libellés français affichés sont à côté de chaque liste.
 */

export const COUNTRIES = ["MA", "FR"] as const;
export type Country = (typeof COUNTRIES)[number];
export const COUNTRY_LABELS: Record<Country, string> = { MA: "Maroc", FR: "France" };

export const CURRENCIES = ["MAD", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const CURRENCY_LABELS: Record<Currency, string> = { MAD: "Dirham marocain (MAD)", EUR: "Euro (EUR)" };

export const PROJECT_STATUSES = ["brouillon", "analyse", "etude_technique", "chiffrage", "controle_qualite", "pret_a_remettre", "archive"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  brouillon: "Brouillon",
  analyse: "Analyse en cours",
  etude_technique: "Étude technique",
  chiffrage: "Chiffrage",
  controle_qualite: "Contrôle qualité",
  pret_a_remettre: "Prêt à remettre",
  archive: "Archivé",
};

export const MARKET_TYPES = [
  "appel_offres_ouvert",
  "appel_offres_restreint",
  "concours",
  "procedure_negociee",
  "consultation_privee",
  "gre_a_gre",
  "autre",
] as const;
export type MarketType = (typeof MARKET_TYPES)[number];
export const MARKET_TYPE_LABELS: Record<MarketType, string> = {
  appel_offres_ouvert: "Appel d’offres ouvert",
  appel_offres_restreint: "Appel d’offres restreint",
  concours: "Concours",
  procedure_negociee: "Procédure négociée",
  consultation_privee: "Consultation privée",
  gre_a_gre: "Gré à gré",
  autre: "Autre",
};

export const SECTORS = ["public", "prive"] as const;
export type Sector = (typeof SECTORS)[number];
export const SECTOR_LABELS: Record<Sector, string> = { public: "Public", prive: "Privé" };

export const DESIGN_PHASES = ["esquisse", "aps", "apd", "pro", "dce", "exe", "autre"] as const;
export type DesignPhase = (typeof DESIGN_PHASES)[number];
export const DESIGN_PHASE_LABELS: Record<DesignPhase, string> = {
  esquisse: "Esquisse",
  aps: "APS (avant-projet sommaire)",
  apd: "APD (avant-projet détaillé)",
  pro: "PRO (projet)",
  dce: "DCE (consultation des entreprises)",
  exe: "EXE (exécution)",
  autre: "Autre",
};

export const PROSPECT_STATUSES = ["nouveau", "qualifie", "converti", "perdu"] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];
export const PROSPECT_STATUS_LABELS: Record<ProspectStatus, string> = { nouveau: "Nouveau", qualifie: "Qualifié", converti: "Converti en client", perdu: "Perdu" };

export const FILE_KINDS = ["plan", "document_consultation", "document_technique", "bordereau_prix", "devis_fournisseur", "facture", "catalogue", "autre"] as const;
export type FileKind = (typeof FILE_KINDS)[number];
export const FILE_KIND_LABELS: Record<FileKind, string> = {
  plan: "Plan",
  document_consultation: "Document de consultation",
  document_technique: "Document technique",
  bordereau_prix: "Bordereau de prix",
  devis_fournisseur: "Devis fournisseur",
  facture: "Facture",
  catalogue: "Catalogue",
  autre: "Autre",
};

export const FILE_STATUSES = ["en_attente", "televerse", "verifie", "en_traitement", "traite", "echec", "rejete"] as const;
export type FileStatus = (typeof FILE_STATUSES)[number];
export const FILE_STATUS_LABELS: Record<FileStatus, string> = {
  en_attente: "En attente",
  televerse: "Téléversé",
  verifie: "Vérifié",
  en_traitement: "En traitement",
  traite: "Traité",
  echec: "Échec",
  rejete: "Refusé",
};

export const DRAWING_KINDS = ["plan_masse", "plan_niveau", "coupe", "facade", "detail", "reseaux", "autre"] as const;
export const VALIDATION_STATUSES = ["a_verifier", "verifie", "rejete"] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];
export const VALIDATION_STATUS_LABELS: Record<ValidationStatus, string> = { a_verifier: "À vérifier", verifie: "Vérifié", rejete: "Rejeté" };

export const MEASURE_METHODS = ["longueur", "surface", "volume", "unite", "poids", "surface_developpee", "formule"] as const;
export const MEASURE_SOURCES = ["cote_plan", "dxf", "ifc", "saisie", "proposition_ia"] as const;
export const REFERENCE_KINDS = ["loi", "decret", "arrete", "ccag", "cctg", "norme", "dtu", "eurocode", "reglement", "regle_professionnelle", "autre"] as const;
export const REFERENCE_SCOPES = ["MA", "FR", "INT"] as const;
export const PRICE_ORIGINS = [
  "dpgf_historique",
  "devis_fournisseur",
  "facture_fournisseur",
  "catalogue",
  "bordereau_historique",
  "tableau_personnel",
  "base_sous_licence",
  "saisie_manuelle",
] as const;
export const PRICE_KINDS = ["ouvrage", "materiau", "main_oeuvre", "materiel", "sous_traitance", "transport"] as const;
export const DOCUMENT_STATUSES = ["brouillon", "en_generation", "a_valider", "valide", "archive"] as const;
export const SECTION_STATUSES = ["a_rediger", "genere", "a_valider", "valide"] as const;
export const DPGF_LINE_KINDS = ["chapitre", "sous_chapitre", "poste"] as const;
export const LINE_STATUSES = ["non_chiffre", "a_verifier", "valide"] as const;
export const COMPONENT_CATEGORIES = ["materiau", "main_oeuvre", "materiel", "sous_traitance", "transport", "frais_chantier"] as const;
export const MARGIN_MODES = ["taux_de_marge", "taux_de_marque", "coefficient"] as const;
export const RATE_BASES = ["debourse_sec", "debourse_total", "prix_de_revient"] as const;
export const QUOTE_STATUSES = ["brouillon", "a_verifier", "valide", "envoye", "accepte", "refuse", "expire"] as const;
export const QUOTE_LINE_KINDS = ["section", "ligne", "option"] as const;
export const QUOTE_EVENT_KINDS = ["creation", "modification", "validation", "envoi", "relance", "acceptation", "refus", "expiration", "duplication"] as const;
export const RATE_KINDS = ["reference", "achat", "vente", "contractuel"] as const;
export const DOCUMENT_TYPES = ["cctp", "dpgf", "sous_detail", "devis"] as const;
export const JOB_KINDS = ["analyse_plans", "generation_cctp", "generation_dpgf", "sous_detail", "generation_devis", "controle_qualite", "export", "import_prix"] as const;
export const JOB_STATUSES = ["en_attente", "en_cours", "termine", "echoue", "annule"] as const;
export const STEP_STATUSES = ["en_attente", "en_cours", "termine", "echoue", "ignore"] as const;
export const ISSUE_SEVERITIES = ["bloquante", "majeure", "mineure", "information"] as const;
export const ISSUE_CATEGORIES = ["completude", "reference", "source_manquante", "incoherence", "doublon", "unite", "calcul", "tracabilite", "version", "reserve"] as const;
export const ISSUE_STATUSES = ["ouverte", "resolue", "ignoree"] as const;
export const NOTIFICATION_KINDS = ["echeance", "traitement", "qualite", "prix", "securite", "systeme"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const DEADLINE_KINDS = ["remise", "visite", "questions", "jalon", "autre"] as const;
export type DeadlineKind = (typeof DEADLINE_KINDS)[number];
export const DEADLINE_KIND_LABELS: Record<DeadlineKind, string> = {
  remise: "Remise des offres",
  visite: "Visite des lieux",
  questions: "Date limite des questions",
  jalon: "Jalon interne",
  autre: "Autre",
};
