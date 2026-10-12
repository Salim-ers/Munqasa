/**
 * Catalogue des lots : nomenclature interne indicative de Talab Solutions, modifiable. Ce n'est pas une
 * codification réglementaire : les numéros varient selon l'opération et le découpage contractuel.
 * Un lot choisi dans le catalogue est recopié dans l'affaire (numéro, intitulé, famille) : une modification
 * ultérieure du catalogue ne renumérote jamais une affaire existante.
 */

export interface CatalogLot {
  number: string;
  name: string;
  tradeFamily: string;
  /** Sous-lots proposés comme modèles adaptables, jamais imposés. */
  subLots?: Array<{ number: string; name: string }>;
}

/** Nomenclature par défaut : 30 lots, dont certains avec leurs sous-lots usuels. */
export const DEFAULT_LOTS: CatalogLot[] = [
  {
    number: "01",
    name: "Gros œuvre",
    tradeFamily: "gros_oeuvre",
    subLots: [
      { number: "01.01", name: "Installation de chantier" },
      { number: "01.02", name: "Terrassements associés" },
      { number: "01.03", name: "Fondations" },
      { number: "01.04", name: "Béton armé" },
      { number: "01.05", name: "Planchers" },
      { number: "01.06", name: "Maçonneries" },
      { number: "01.07", name: "Ouvrages divers" },
    ],
  },
  { number: "02", name: "Terrassements", tradeFamily: "preparation_terrassement" },
  {
    number: "03",
    name: "VRD",
    tradeFamily: "exterieurs_infrastructures",
    subLots: [
      { number: "03.01", name: "Terrassements de voirie" },
      { number: "03.02", name: "Assainissement eaux usées et eaux vannes" },
      { number: "03.03", name: "Eaux pluviales" },
      { number: "03.04", name: "Adduction d’eau potable" },
      { number: "03.05", name: "Réseaux secs" },
      { number: "03.06", name: "Chaussées, trottoirs et bordures" },
    ],
  },
  { number: "04", name: "Fondations spéciales", tradeFamily: "preparation_terrassement" },
  { number: "05", name: "Démolition / Déconstruction", tradeFamily: "preparation_terrassement" },
  { number: "06", name: "Charpente bois", tradeFamily: "gros_oeuvre" },
  { number: "07", name: "Charpente métallique", tradeFamily: "gros_oeuvre" },
  { number: "08", name: "Couverture", tradeFamily: "enveloppe" },
  { number: "09", name: "Étanchéité", tradeFamily: "enveloppe" },
  { number: "10", name: "Façades / Ravalement", tradeFamily: "enveloppe" },
  { number: "11", name: "Menuiseries extérieures", tradeFamily: "enveloppe" },
  { number: "12", name: "Menuiseries intérieures", tradeFamily: "second_oeuvre" },
  { number: "13", name: "Serrurerie / Métallerie", tradeFamily: "second_oeuvre" },
  { number: "14", name: "Cloisons / Doublages", tradeFamily: "second_oeuvre" },
  { number: "15", name: "Isolation thermique et acoustique", tradeFamily: "second_oeuvre" },
  { number: "16", name: "Faux plafonds", tradeFamily: "second_oeuvre" },
  { number: "17", name: "Carrelage / Faïence", tradeFamily: "second_oeuvre" },
  { number: "18", name: "Revêtements de sols", tradeFamily: "second_oeuvre" },
  { number: "19", name: "Peinture / Finitions", tradeFamily: "second_oeuvre" },
  {
    number: "20",
    name: "Plomberie / Sanitaire",
    tradeFamily: "lots_techniques",
    subLots: [
      { number: "20.01", name: "Production d’eau chaude sanitaire" },
      { number: "20.02", name: "Distribution d’eau froide et d’eau chaude" },
      { number: "20.03", name: "Évacuations eaux usées et eaux vannes" },
      { number: "20.04", name: "Appareils sanitaires" },
    ],
  },
  { number: "21", name: "Chauffage", tradeFamily: "lots_techniques" },
  { number: "22", name: "Ventilation / Climatisation", tradeFamily: "lots_techniques" },
  {
    number: "23",
    name: "Électricité CFO",
    tradeFamily: "lots_techniques",
    subLots: [
      { number: "23.01", name: "Branchement et tableau général" },
      { number: "23.02", name: "Distribution" },
      { number: "23.03", name: "Éclairage" },
      { number: "23.04", name: "Prises et appareillages" },
      { number: "23.05", name: "Mise à la terre" },
    ],
  },
  { number: "24", name: "Électricité CFA / SSI", tradeFamily: "lots_techniques" },
  { number: "25", name: "Ascenseurs / Élévateurs", tradeFamily: "lots_techniques" },
  { number: "26", name: "Réseaux hydrauliques", tradeFamily: "lots_techniques" },
  { number: "27", name: "Aménagements extérieurs", tradeFamily: "exterieurs_infrastructures" },
  { number: "28", name: "Espaces verts / Paysage", tradeFamily: "exterieurs_infrastructures" },
  { number: "29", name: "Équipements techniques spécialisés", tradeFamily: "ouvrages_specialises" },
  { number: "30", name: "Piscines / Ouvrages spécifiques", tradeFamily: "ouvrages_specialises" },
];

/** Modèles de nomenclature par type d'opération : sous-ensembles de la nomenclature par défaut. */
export const LOT_TEMPLATES: Array<{ key: string; name: string; projectType: string; numbers: string[] | "tous" }> = [
  { key: "batiment", name: "Bâtiment, nomenclature complète", projectType: "batiment", numbers: "tous" },
  {
    key: "logements",
    name: "Logements, opération courante",
    projectType: "logements",
    numbers: ["01", "02", "03", "08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "27", "28"],
  },
  { key: "rehabilitation", name: "Réhabilitation", projectType: "rehabilitation", numbers: ["05", "01", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "22", "23", "24"] },
  { key: "vrd", name: "VRD et aménagements extérieurs", projectType: "vrd", numbers: ["02", "03", "26", "27", "28"] },
];

export const PROJECT_TYPES: Record<string, string> = {
  batiment: "Bâtiment",
  logements: "Logements",
  rehabilitation: "Réhabilitation",
  vrd: "VRD et aménagements extérieurs",
};

/** Libellé d'un lot, identique sur tous les documents de l'affaire : « Lot 01, Gros œuvre ». */
export function lotLabel(lot: { code: string; name: string }): string {
  return `Lot ${lot.code}, ${lot.name}`;
}

/** Titre d'un document de lot : « CCTP, lot 01 Gros œuvre » ; sans lot, le nom de l'affaire. */
export function lotDocumentTitle(kind: string, lot: { code: string; name: string } | null, projectName: string): string {
  return lot ? `${kind}, lot ${lot.code} ${lot.name}` : `${kind}, ${projectName}`;
}

/**
 * Lots suggérés par les éléments relevés sur les plans (catégorie de l'élément vers numéro de la nomenclature
 * par défaut). Une suggestion n'est qu'une présélection : l'utilisateur garde la main.
 */
export const ELEMENT_LOT_SUGGESTIONS: Record<string, string[]> = {
  terrassement: ["02"],
  fondation: ["01"],
  longrine: ["01"],
  dallage: ["01"],
  voile: ["01"],
  mur: ["01"],
  poteau: ["01"],
  poutre: ["01"],
  dalle: ["01"],
  escalier: ["01"],
  acrotere: ["01", "09"],
  ouverture: ["11"],
  reseau: ["03"],
  facade: ["10"],
  couverture: ["08"],
  menuiserie: ["11", "12"],
  cloison: ["14"],
  revetement: ["17", "18", "19"],
  equipement: ["20", "23"],
  voirie: ["03", "27"],
};

/** Texte comparable pour la recherche : minuscules, sans accents ni ligatures. */
export function searchable(text: string): string {
  return text
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
}
