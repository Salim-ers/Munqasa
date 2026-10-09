/**
 * Formats de sortie imposés aux agents (sorties structurées strictes) : chaque champ est obligatoire,
 * les valeurs inconnues sont « null » plutôt qu'inventées. Les quantités et montants sont calculés par
 * le serveur à partir des entrées fournies, jamais recopiés tels quels depuis le modèle.
 */
import { z } from "zod";
import { DRAWING_KINDS, MEASURE_METHODS } from "../../shared/enums.js";

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

export const metreProposal = z.object({
  workItems: z.array(
    z.object({
      code: z.string(),
      designation: z.string(),
      unit: z.string(),
      location: z.string().nullable(),
      attributes: z.array(z.object({ name: z.string(), value: z.string(), source: z.string() })),
      measurements: z.array(
        z.object({
          label: z.string(),
          method: z.enum(MEASURE_METHODS),
          formula: z.string(),
          inputs: z.array(z.object({ name: z.string(), value: z.string(), source: z.string() })),
          unit: z.string(),
          drawingId: z.string().nullable(),
          zone: z.string().nullable(),
          note: z.string().nullable(),
        }),
      ),
    }),
  ),
  warnings: z.array(z.string()),
});
export type MetreProposal = z.output<typeof metreProposal>;
