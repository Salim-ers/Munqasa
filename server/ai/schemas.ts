/**
 * Formats de sortie imposés aux agents (sorties structurées strictes) : chaque champ est obligatoire,
 * les valeurs inconnues sont « null » plutôt qu'inventées. Les quantités et montants sont calculés par
 * le serveur à partir des entrées fournies, jamais recopiés tels quels depuis le modèle.
 */
import { z } from "zod";
import { COMPONENT_CATEGORIES, DRAWING_KINDS, MEASURE_METHODS } from "../../shared/enums.js";

export const ELEMENT_CATEGORIES = [
  "terrassement",
  "fondation",
  "longrine",
  "dallage",
  "voile",
  "mur",
  "poteau",
  "poutre",
  "dalle",
  "escalier",
  "acrotere",
  "ouverture",
  "reseau",
  "facade",
  "couverture",
  "menuiserie",
  "cloison",
  "revetement",
  "equipement",
  "voirie",
  "autre",
] as const;

/* ---------- Lecture d'une page de plan ---------- */

export const planExtraction = z.object({
  sheet: z.object({
    title: z.string().nullable(),
    number: z.string().nullable(),
    kind: z.enum(DRAWING_KINDS),
    level: z.string().nullable(),
    scale: z.string().nullable(),
    /** Indice ou révision du plan, tel qu'écrit dans le cartouche. */
    revision: z.string().nullable(),
    readable: z.boolean(),
  }),
  elements: z.array(
    z.object({
      category: z.enum(ELEMENT_CATEGORIES),
      designation: z.string(),
      location: z.string().nullable(),
      count: z.number().int().nullable(),
      material: z.string().nullable(),
      dimensions: z.array(
        z.object({
          name: z.string(),
          value: z.string(),
          unit: z.string(),
          source: z.enum(["cote_lue", "texte_lu", "deduit"]),
        }),
      ),
      confidence: z.enum(["elevee", "moyenne", "faible"]),
      note: z.string().nullable(),
    }),
  ),
  notes: z.array(z.string()),
  uncertainties: z.array(z.string()),
});
export type PlanExtraction = z.output<typeof planExtraction>;

/* ---------- Métré consolidé ---------- */

const metreMeasurement = z.object({
  label: z.string(),
  method: z.enum(MEASURE_METHODS),
  formula: z.string(),
  inputs: z.array(
    z.object({
      name: z.string(),
      value: z.string(),
      source: z.string(),
      /** Identifiants des cotes relevées ou des chaînes de cotes dont vient la valeur (« 1.2.3 », « C1.2 ») ; vide si aucune. */
      dimensionIds: z.array(z.string()),
      /** Calcul ou conversion qui mène des cotes à la valeur, ou null si elle est reprise telle quelle. */
      derivation: z.string().nullable(),
    }),
  ),
  /** Déductions explicites (vides, trémies), avec les mêmes variables que la formule. */
  deductions: z.array(z.object({ label: z.string(), formula: z.string() })),
  unit: z.string(),
  drawingId: z.string().nullable(),
  zone: z.string().nullable(),
  note: z.string().nullable(),
});

export const metreProposal = z.object({
  workItems: z.array(
    z.object({
      code: z.string(),
      designation: z.string(),
      unit: z.string(),
      location: z.string().nullable(),
      attributes: z.array(z.object({ name: z.string(), value: z.string(), source: z.string() })),
      measurements: z.array(metreMeasurement),
      /** Données manquantes pour mesurer l'ouvrage, dites précisément ; vide si rien ne manque. */
      missing: z.array(z.string()),
    }),
  ),
  warnings: z.array(z.string()),
});
export type MetreProposal = z.output<typeof metreProposal>;

/** Métré des postes de DPGF restés « à métrer » : mesures calculables, ou données manquantes. */
export const metrePostes = z.object({
  postes: z.array(
    z.object({
      lineId: z.string(),
      measurements: z.array(metreMeasurement),
      missing: z.array(z.string()),
    }),
  ),
  warnings: z.array(z.string()),
});
export type MetrePostes = z.output<typeof metrePostes>;

/* ---------- CCTP ---------- */

export const CCTP_DETAIL_LEVELS = ["synthetique", "standard", "detaille"] as const;
export type CctpDetailLevel = (typeof CCTP_DETAIL_LEVELS)[number];

/** Plan du CCTP : chapitres et articles, chacun avec son objet et les ouvrages qu'il couvre. */
export const cctpOutline = z.object({
  title: z.string(),
  chapters: z.array(
    z.object({
      number: z.string(),
      title: z.string(),
      articles: z.array(
        z.object({
          number: z.string(),
          title: z.string(),
          intent: z.string(),
          workItemCodes: z.array(z.string()),
        }),
      ),
    }),
  ),
});
export type CctpOutline = z.output<typeof cctpOutline>;

export const CCTP_BLOCK_TYPES = ["paragraphe", "liste", "exigence", "note"] as const;

export const cctpBlock = z.object({
  type: z.enum(CCTP_BLOCK_TYPES),
  text: z.string().nullable(),
  items: z.array(z.string()),
  referenceIds: z.array(z.string()),
});
export type CctpBlock = z.output<typeof cctpBlock>;

/** Rédaction des articles d'un chapitre (ou d'articles à réécrire). */
export const cctpChapter = z.object({
  articles: z.array(
    z.object({
      number: z.string(),
      blocks: z.array(cctpBlock),
    }),
  ),
});
export type CctpChapter = z.output<typeof cctpChapter>;

/* ---------- DPGF ---------- */

/**
 * Postes de DPGF proposés pour un chapitre du CCTP. Aucun nombre n'est demandé au modèle :
 * la quantité vient du métré (« metre »), vaut 1 pour un forfait, ou reste « à métrer ».
 */
export const dpgfChapter = z.object({
  title: z.string(),
  groups: z.array(
    z.object({
      title: z.string().nullable(),
      postes: z.array(
        z.object({
          designation: z.string(),
          description: z.string().nullable(),
          unit: z.string(),
          cctpArticle: z.string().nullable(),
          workItemCode: z.string().nullable(),
          quantityBasis: z.enum(["metre", "forfait", "a_metrer"]),
        }),
      ),
    }),
  ),
});
export type DpgfChapter = z.output<typeof dpgfChapter>;

/* ---------- Sous-détails de prix ---------- */

/**
 * Décomposition d'une unité d'ouvrage. Le modèle ne donne jamais de coût : chaque coût unitaire vient
 * d'un prix candidat de la bibliothèque (« priceItemId »), sinon le composant reste à chiffrer.
 * La consommation est nette ; les pertes sont un taux distinct, appliqué une seule fois par le serveur.
 */
export const sousDetailBatch = z.object({
  postes: z.array(
    z.object({
      lineId: z.string(),
      components: z.array(
        z.object({
          category: z.enum(COMPONENT_CATEGORIES),
          designation: z.string(),
          unit: z.string(),
          /** Consommation nette par unité d'ouvrage, sans pertes ni chutes. */
          netQuantity: z.string(),
          /** Taux de pertes en pourcentage, ou null s'il est sans objet. */
          lossRate: z.string().nullable(),
          priceItemId: z.string().nullable(),
          justification: z.string(),
        }),
      ),
      /** Décomposition impossible faute de caractéristiques suffisantes : raison et caractéristiques à confirmer. */
      impossible: z.object({ reason: z.string(), missing: z.array(z.string()) }).nullable(),
      notes: z.string().nullable(),
    }),
  ),
});
export type SousDetailBatch = z.output<typeof sousDetailBatch>;
