import type { PhotoName } from "./photos";

export interface Service {
  slug: string;
  number: string;
  title: string;
  /** Ligne courte (accueil). */
  short: string;
  /** Référence technique affichée en label. */
  ref: string;
  intro: string;
  tasks: readonly string[];
  deliverable: string;
  note?: string;
  photo?: PhotoName;
}

export const SERVICES: readonly Service[] = [
  {
    slug: "veille",
    number: "01",
    title: "Veille & opportunités",
    short: "Repérer et organiser les consultations pertinentes.",
    ref: "AO / Veille",
    intro:
      "Les avis sont dispersés, les délais courts. Nous suivons les publications correspondant à votre activité, filtrons les consultations selon vos critères et vous transmettons une sélection exploitable.",
    tasks: [
      "Définition des critères : secteurs, zones, types de marchés",
      "Suivi des avis publiés, des additifs et des reports",
      "Fiche synthétique par opportunité : objet, maître d’ouvrage, échéance",
      "Tableau des consultations en cours",
    ],
    deliverable: "Sélection d’opportunités qualifiées",
    photo: "arch-niche",
  },
  {
    slug: "analyse",
    number: "02",
    title: "Analyse du dossier",
    short: "Extraire les exigences, pièces et échéances.",
    ref: "RC · CPS",
    intro:
      "Règlement de consultation, cahier des prescriptions spéciales, annexes : nous lisons l’ensemble du dossier pour en extraire ce qui conditionne la recevabilité de votre offre.",
    tasks: [
      "Lecture du RC, du CPS et des annexes",
      "Relevé des pièces exigées et des formats imposés",
      "Identification des critères d’évaluation et des points d’attention",
      "Calendrier : visite des lieux, questions, dépôt, ouverture des plis",
    ],
    deliverable: "Grille d’analyse et liste des exigences",
    photo: "lattice-facade",
  },
  {
    slug: "dossier-administratif",
    number: "03",
    title: "Dossier administratif",
    short: "Centraliser et structurer les documents demandés.",
    ref: "Pièces A.",
    intro:
      "Attestations, déclarations, pouvoirs, références : nous centralisons les pièces fournies par votre entreprise, vérifions leur validité et les classons dans l’ordre demandé.",
    tasks: [
      "Liste des pièces administratives exigées",
      "Collecte et classement des documents fournis",
      "Contrôle des dates de validité et des signatures",
      "Base documentaire réutilisable pour les consultations suivantes",
    ],
    deliverable: "Dossier administratif complet et ordonné",
    photo: "paper-stack",
  },
  {
    slug: "offre-technique",
    number: "04",
    title: "Offre technique",
    short: "Organiser les éléments techniques fournis et validés par l’entreprise.",
    ref: "Mémoire · Moyens",
    intro:
      "Le contenu technique vient de vos équipes. Nous le structurons pour qu’il réponde point par point au cahier des charges : plan de l’offre, mise en forme, cohérence des pièces.",
    tasks: [
      "Plan de l’offre technique aligné sur les critères d’évaluation",
      "Intégration des notes, CV, références et moyens fournis",
      "Mise en forme et homogénéité du document",
      "Vérification de la correspondance avec les exigences",
    ],
    deliverable: "Offre technique structurée, prête à valider",
    photo: "drawing-table",
  },
  {
    slug: "coordination",
    number: "05",
    title: "Coordination",
    short: "Piloter les différentes contributions nécessaires au dossier.",
    ref: "Intervenants",
    intro:
      "Direction, service technique, comptabilité, partenaires : chaque dossier mobilise plusieurs contributeurs. Nous répartissons les demandes, relançons et consolidons.",
    tasks: [
      "Répartition des pièces à produire par intervenant",
      "Calendrier interne de remise",
      "Relances et suivi des validations",
      "Consolidation des contributions",
    ],
    deliverable: "Tableau des responsabilités et de l’avancement",
    photo: "arcade-shadow",
  },
  {
    slug: "controle",
    number: "06",
    title: "Contrôle avant dépôt",
    short: "Effectuer une revue structurée avant l’échéance.",
    ref: "Revue · Rev. A",
    intro:
      "Avant le dépôt, chaque pièce est confrontée à la liste des exigences : présence, version, signature, format. Les écarts sont signalés pour correction.",
    tasks: [
      "Contrôle pièce par pièce contre la checklist",
      "Vérification des signatures, cachets et paraphes demandés",
      "Cohérence des versions et des références",
      "Liste des écarts à corriger",
    ],
    deliverable: "Revue documentaire et liste d’écarts",
    photo: "rampart",
  },
  {
    slug: "soumission",
    number: "07",
    title: "Préparation à la soumission",
    short: "Préparer l’arborescence, les formats et les fichiers.",
    ref: "Dépôt",
    intro:
      "Dépôt électronique ou physique, chaque consultation impose ses règles. Nous préparons l’arborescence, le nommage, les formats et l’ordre des pièces.",
    tasks: [
      "Arborescence et nommage des fichiers",
      "Conversion et contrôle des formats demandés",
      "Organisation des plis et des enveloppes",
      "Récapitulatif avant dépôt",
    ],
    deliverable: "Dossier prêt à déposer",
    note: "La signature et le dépôt de l’offre restent effectués par l’entreprise.",
    photo: "white-arch",
  },
  {
    slug: "suivi",
    number: "08",
    title: "Suivi",
    short: "Centraliser les évolutions et prochaines actions.",
    ref: "Échéances",
    intro:
      "Après le dépôt, une consultation continue de vivre : additifs, demandes de compléments, ouverture des plis, résultats. Nous centralisons les informations et les prochaines actions.",
    tasks: [
      "Suivi des additifs et des reports de date",
      "Centralisation des échanges et des compléments demandés",
      "Suivi des résultats publiés",
      "Archivage structuré du dossier",
    ],
    deliverable: "Historique et prochaines actions",
    photo: "sand-tower",
  },
];

/** Ce que MUNAQASA ne fait pas — affiché tel quel, sans ambiguïté. */
export const OUT_OF_SCOPE: readonly string[] = [
  "Métré",
  "Chiffrage BTP",
  "Calcul de quantités",
  "Estimation du coût des travaux",
  "Détermination de vos prix",
];

export const FINANCIAL_NOTE =
  "Lorsqu’un dossier comporte une offre financière, les prix et données financières sont préparés et validés par votre entreprise. MUNAQASA peut uniquement les organiser ou les intégrer au dossier.";
