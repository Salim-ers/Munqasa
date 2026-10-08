import type { PhotoName } from "./photos";

export type ServiceSlug =
  | "veille"
  | "analyse"
  | "dossier-administratif"
  | "offre-technique"
  | "coordination"
  | "controle"
  | "soumission"
  | "suivi";

export interface Service {
  slug: ServiceSlug;
  title: string;
  /** Une ligne : accueil. */
  short: string;
  /** Page Services : le détail. */
  intro: string;
  tasks: readonly string[];
  deliverable: string;
  /** Aperçu au survol, sur l’accueil uniquement. */
  photo: PhotoName;
}

export const SERVICES: readonly Service[] = [
  {
    slug: "veille",
    title: "Veille et opportunités",
    short: "Les avis qui comptent pour vous, repérés et triés.",
    intro:
      "Les consultations se publient sur de nombreux supports, souvent avec des délais courts. Nous suivons celles qui correspondent à votre activité et vous transmettons une sélection prête à décider.",
    tasks: [
      "Critères définis avec vous : secteurs, régions, types de marchés",
      "Suivi des avis, des additifs et des reports",
      "Une fiche claire par consultation retenue",
    ],
    deliverable: "Une sélection d’opportunités qualifiées",
    photo: "arch-niche",
  },
  {
    slug: "analyse",
    title: "Analyse du dossier",
    short: "Règlement et cahier des prescriptions lus ligne à ligne.",
    intro:
      "Le règlement de consultation et le cahier des prescriptions spéciales fixent les règles du jeu. Nous en extrayons tout ce qui conditionne la recevabilité et l’évaluation de votre offre.",
    tasks: ["Pièces exigées et formats imposés", "Critères d’évaluation et points d’attention", "Visite des lieux, questions, dépôt, ouverture des plis"],
    deliverable: "Une grille d’analyse du dossier",
    photo: "lattice-facade",
  },
  {
    slug: "dossier-administratif",
    title: "Dossier administratif",
    short: "Attestations, déclarations, cautions : complètes, valides, en ordre.",
    intro:
      "Une pièce manquante ou expirée suffit à écarter une offre. Nous rassemblons les documents de votre entreprise, vérifions leur validité et les classons dans l’ordre demandé.",
    tasks: ["Liste des pièces exigées", "Contrôle des dates de validité et des signatures", "Une base documentaire prête pour les prochaines consultations"],
    deliverable: "Un dossier administratif complet",
    photo: "archive-shelf",
  },
  {
    slug: "offre-technique",
    title: "Offre technique",
    short: "Vos savoir-faire présentés face à chaque critère.",
    intro:
      "Notes méthodologiques, références, moyens humains et matériels : nous organisons le contenu de vos équipes en une offre lisible, alignée sur chaque critère du cahier des charges.",
    tasks: ["Plan de l’offre calé sur les critères d’évaluation", "Mise en forme des notes, CV, références et moyens", "Cohérence entre toutes les pièces techniques"],
    deliverable: "Une offre technique prête à valider",
    photo: "drawing-table",
  },
  {
    slug: "coordination",
    title: "Coordination",
    short: "Chaque contributeur sait quoi remettre, et quand.",
    intro:
      "Direction, bureau d’études, comptabilité, partenaires : un dossier mobilise plusieurs personnes. Nous répartissons les demandes, relançons et consolidons, pour que rien ne reste en attente.",
    tasks: ["Répartition des pièces par intervenant", "Calendrier interne de remise", "Relances et suivi des validations"],
    deliverable: "Un tableau de bord du dossier",
    photo: "arcade-shadow",
  },
  {
    slug: "controle",
    title: "Contrôle avant dépôt",
    short: "Une revue complète avant l’échéance, jamais après.",
    intro:
      "Chaque pièce est confrontée aux exigences du dossier : présence, version, signature, format. Les écarts sont signalés à temps pour être corrigés.",
    tasks: ["Contrôle pièce par pièce", "Signatures, cachets et paraphes", "Cohérence des versions et des références"],
    deliverable: "Un rapport de revue",
    photo: "rampart",
  },
  {
    slug: "soumission",
    title: "Préparation à la soumission",
    short: "Fichiers nommés, formats conformes, plis organisés.",
    intro:
      "Dépôt électronique ou plis physiques, chaque consultation impose ses règles. Nous préparons l’arborescence, le nommage, les formats et l’ordre des pièces pour un dépôt sans hésitation.",
    tasks: ["Arborescence et nommage des fichiers", "Conversion et contrôle des formats", "Organisation des plis et des enveloppes"],
    deliverable: "Un dossier prêt à déposer",
    photo: "white-arch",
  },
  {
    slug: "suivi",
    title: "Suivi",
    short: "Additifs, compléments, résultats : rien ne se perd après le dépôt.",
    intro:
      "Une consultation continue de vivre après le dépôt. Nous centralisons les échanges, les demandes de compléments et les résultats, puis archivons le dossier pour la prochaine fois.",
    tasks: ["Suivi des additifs et des reports", "Réponses aux demandes de compléments", "Suivi des résultats et archivage"],
    deliverable: "Un historique clair de chaque consultation",
    photo: "sand-tower",
  },
];
