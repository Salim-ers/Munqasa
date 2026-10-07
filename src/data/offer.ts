import type { Need } from "../lib/contact";

export interface Formula {
  slug: string;
  title: string;
  text: string;
  includes: readonly string[];
  featured?: boolean;
  /** Besoin pré-coché dans le formulaire. */
  need: Need;
}

export const FORMULAS: readonly Formula[] = [
  {
    slug: "mission",
    title: "Mission ponctuelle",
    text: "Un appel d’offres précis à préparer ou à structurer.",
    includes: ["Analyse du dossier", "Constitution des pièces", "Revue avant dépôt"],
    need: "global",
  },
  {
    slug: "audit",
    title: "Audit avant dépôt",
    text: "Un regard extérieur sur votre dossier, avant l’échéance.",
    includes: ["Contrôle pièce par pièce", "Signatures, versions, formats", "Écarts à corriger"],
    need: "audit",
  },
  {
    slug: "cellule",
    title: "Cellule appels d’offres externalisée",
    text: "Une organisation continue pour les entreprises qui répondent souvent.",
    includes: ["Veille suivie", "Base documentaire à jour", "Dossiers préparés en continu", "Échéances et résultats suivis"],
    featured: true,
    need: "global",
  },
];

export const PILLARS: readonly { title: string; statement: string; text: string }[] = [
  {
    title: "Structure",
    statement: "Chaque dossier est décomposé.",
    text: "Une consultation devient une liste de pièces, de responsables et de dates. Rien n’est laissé au dernier moment.",
  },
  {
    title: "Clarté",
    statement: "Chaque besoin devient lisible.",
    text: "Les exigences du règlement et du cahier des prescriptions deviennent des actions concrètes, comprises par chacun.",
  },
  {
    title: "Vigilance",
    statement: "Chaque pièce et chaque version compte.",
    text: "Dates de validité, signatures, formats, versions : les détails qui rendent une offre recevable sont contrôlés un à un.",
  },
  {
    title: "Réactivité",
    statement: "Les échéances imposent le rythme.",
    text: "Additifs, reports, compléments demandés : l’organisation absorbe les changements sans perdre le fil.",
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
  "PME",
];
