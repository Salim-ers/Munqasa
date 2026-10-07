import type { Need } from "../lib/contact";

export interface Formula {
  number: string;
  slug: string;
  title: string;
  text: string;
  ref: string;
  includes: readonly string[];
  featured?: boolean;
  /** Besoin pré-coché dans le formulaire de contact. */
  need: Need;
}

export const FORMULAS: readonly Formula[] = [
  {
    number: "01",
    slug: "mission",
    title: "Mission ponctuelle",
    text: "Un appel d’offres précis à préparer ou structurer.",
    ref: "1 consultation",
    includes: ["Analyse du dossier de consultation", "Checklist des pièces", "Constitution du dossier", "Revue avant dépôt"],
    need: "global",
  },
  {
    number: "02",
    slug: "audit",
    title: "Audit avant dépôt",
    text: "Une revue du dossier avant l’échéance.",
    ref: "Revue",
    includes: ["Contrôle pièce par pièce", "Signatures, versions, formats", "Liste des écarts à corriger"],
    need: "audit",
  },
  {
    number: "03",
    slug: "cellule",
    title: "Cellule appels d’offres externalisée",
    text: "Une organisation continue pour les entreprises répondant régulièrement aux consultations.",
    ref: "Continu",
    includes: [
      "Veille suivie selon vos critères",
      "Base documentaire tenue à jour",
      "Préparation des dossiers successifs",
      "Suivi des échéances et des résultats",
    ],
    featured: true,
    need: "global",
  },
];

export const PILLARS: readonly { number: string; title: string; statement: string; text: string }[] = [
  {
    number: "01",
    title: "Structure",
    statement: "Chaque dossier est décomposé.",
    text: "Une consultation devient une liste de pièces, de responsables et de dates. Rien n’est laissé à l’interprétation au dernier moment.",
  },
  {
    number: "02",
    title: "Clarté",
    statement: "Chaque besoin devient lisible.",
    text: "Les exigences du RC et du CPS sont reformulées en actions concrètes, compréhensibles par chaque intervenant de l’entreprise.",
  },
  {
    number: "03",
    title: "Vigilance",
    statement: "Chaque pièce et chaque version compte.",
    text: "Dates de validité, signatures, formats, versions : les détails qui rendent une offre recevable sont contrôlés un à un.",
  },
  {
    number: "04",
    title: "Réactivité",
    statement: "Les échéances imposent une organisation efficace.",
    text: "Additifs, reports, compléments demandés : l’organisation est pensée pour absorber les changements sans perdre le fil.",
  },
];

export const SECTORS: readonly string[] = [
  "Entreprises BTP",
  "Sociétés de travaux",
  "Bureaux d’études",
  "Sociétés d’ingénierie",
  "Cabinets d’architecture",
  "Fournisseurs techniques",
  "Entreprises de services",
  "PME répondant aux appels d’offres",
];
