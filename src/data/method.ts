/**
 * Accueil : la séquence « Le dossier » — une consultation devient un dossier
 * structuré, sous les yeux du visiteur.
 */
export const SEQUENCE_PHASES: readonly { title: string; text: string }[] = [
  { title: "Un avis est publié.", text: "L’échéance est fixée. Tout commence ici." },
  { title: "Chaque exigence est relevée.", text: "Le règlement et le cahier des prescriptions sont lus ligne à ligne." },
  { title: "Les pièces affluent.", text: "Attestations, références, notes, plannings : elles arrivent de partout." },
  { title: "Chaque pièce trouve sa place.", text: "Trois dossiers, un ordre précis, rien qui dépasse." },
  { title: "Vérifié, prêt, déposé à temps.", text: "La revue se fait avant l’échéance, jamais après." },
];

/** Pièces d'une réponse type à un appel d'offres au Maroc, rangées par dossier. */
export const SEQUENCE_FOLDERS: readonly { title: string; short: string; pieces: readonly string[] }[] = [
  { title: "Dossier administratif", short: "Administratif", pieces: ["Déclaration sur l’honneur", "Attestation fiscale", "Attestation CNSS", "Registre de commerce"] },
  { title: "Dossier technique", short: "Technique", pieces: ["Moyens humains", "Moyens matériels", "Attestations de références"] },
  { title: "Offre technique", short: "Offre", pieces: ["Note méthodologique", "Planning", "Organisation"] },
];

/**
 * Page Méthode : le calendrier réel d'une consultation, et ce que nous faisons
 * à chaque moment.
 */
export const TIMELINE: readonly { moment: string; action: string; deliverable: string }[] = [
  {
    moment: "Publication de l’avis",
    action: "La consultation est qualifiée : correspond-elle à votre activité, à vos références, à votre calendrier ?",
    deliverable: "Une fiche de consultation",
  },
  {
    moment: "Retrait du dossier",
    action: "Le dossier de consultation est téléchargé, lu et décortiqué, exigence par exigence.",
    deliverable: "Une grille d’analyse",
  },
  {
    moment: "Visite des lieux et questions",
    action: "Les points flous sont listés et formulés pour être posés au maître d’ouvrage dans les délais.",
    deliverable: "Une liste de questions",
  },
  {
    moment: "Constitution",
    action: "Les pièces sont réunies, mises en forme et classées, contributeur par contributeur.",
    deliverable: "Un dossier constitué",
  },
  {
    moment: "Revue",
    action: "Le dossier complet est relu contre les exigences, avec le temps de corriger.",
    deliverable: "Un rapport de revue",
  },
  {
    moment: "Dépôt",
    action: "Fichiers et plis sont prêts : le dépôt se fait sans précipitation.",
    deliverable: "Une arborescence de dépôt",
  },
  {
    moment: "Ouverture des plis et résultats",
    action: "Compléments, additifs et résultats sont suivis jusqu’au bout, puis archivés.",
    deliverable: "Un historique du dossier",
  },
];

export const EXCHANGE = {
  given: ["Les documents de votre entreprise", "Vos références et vos moyens", "Le contenu technique de vos équipes", "Vos validations"],
  returned: ["Une checklist partagée du dossier", "Un calendrier de remise", "Des pièces classées et contrôlées", "Un dossier prêt au dépôt"],
} as const;
