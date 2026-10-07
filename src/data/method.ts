export interface MethodStep {
  number: string;
  title: string;
  text: string;
  deliverable: string;
}

/** Les sept étapes — chacune correspond à un état du « plateau documentaire ». */
export const METHOD_STEPS: readonly MethodStep[] = [
  {
    number: "01",
    title: "Cadrage",
    text: "Comprendre votre activité, vos références, vos capacités et les consultations que vous visez.",
    deliverable: "Fiche de cadrage",
  },
  {
    number: "02",
    title: "Veille",
    text: "Identifier les avis pertinents et retenir ceux qui correspondent à vos critères.",
    deliverable: "Sélection d’avis",
  },
  {
    number: "03",
    title: "Analyse",
    text: "Lire le dossier de consultation et relever exigences, pièces, critères et dates.",
    deliverable: "Grille d’analyse",
  },
  {
    number: "04",
    title: "Checklist",
    text: "Transformer chaque exigence en pièce attendue, avec un responsable et une échéance.",
    deliverable: "Checklist du dossier",
  },
  {
    number: "05",
    title: "Constitution",
    text: "Rassembler, classer et mettre en forme les pièces administratives et techniques.",
    deliverable: "Dossier constitué",
  },
  {
    number: "06",
    title: "Revue",
    text: "Contrôler chaque pièce contre la checklist, avant l’échéance, et corriger les écarts.",
    deliverable: "Rapport de revue",
  },
  {
    number: "07",
    title: "Soumission & suivi",
    text: "Préparer les fichiers pour le dépôt, puis suivre la consultation jusqu’au résultat.",
    deliverable: "Dossier final · suivi",
  },
];

export const CHECKLIST: readonly { ref: string; label: string }[] = [
  { ref: "A.01", label: "Pièces administratives" },
  { ref: "A.02", label: "Offre technique" },
  { ref: "A.03", label: "Annexes" },
  { ref: "A.04", label: "Formulaires" },
  { ref: "A.05", label: "Signatures" },
  { ref: "A.06", label: "Versions" },
  { ref: "A.07", label: "Formats" },
  { ref: "A.08", label: "Échéance" },
];

/** Pièces d'un dossier de consultation (section « Problème »). */
export const DOSSIER_PIECES: readonly { ref: string; label: string }[] = [
  { ref: "01", label: "RC" },
  { ref: "02", label: "CPS" },
  { ref: "03", label: "Dossier administratif" },
  { ref: "04", label: "Offre technique" },
  { ref: "05", label: "Annexes" },
  { ref: "06", label: "Planning" },
  { ref: "07", label: "Formulaires" },
  { ref: "08", label: "Validations" },
  { ref: "09", label: "Signatures" },
  { ref: "10", label: "Échéance" },
];
