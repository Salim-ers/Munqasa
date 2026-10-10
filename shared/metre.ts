/**
 * Traçabilité du métré : origine de chaque entrée d'une formule jusqu'à la cote relevée sur la planche,
 * contrôle de cette cote dans le texte vectoriel du PDF, confiance déterministe de la mesure.
 *
 * Confiance d'une mesure proposée par l'agent (aucune appréciation du modèle n'entre dans le calcul) :
 * - élevée : chaque entrée reprend une cote relevée, retrouvée dans le texte vectoriel de sa page, et sa
 *   valeur est celle de la cote convertie en mètres ;
 * - moyenne : entrées appuyées sur des cotes relevées, mais calculées à partir de plusieurs cotes, lues sur
 *   une page sans texte vectoriel (plan scanné), déduites par le lecteur ou dénombrées sur la planche ;
 * - faible : une entrée sans cote relevée, une cote absente du texte vectoriel de sa page, ou une valeur qui
 *   ne concorde pas avec sa cote sans calcul indiqué.
 */

/** Contrôle d'une cote relevée dans le texte vectoriel de sa page. */
export const DIMENSION_CHECKS = ["couche_texte", "non_retrouvee", "sans_couche_texte", "deduite", "denombree"] as const;
export type DimensionCheck = (typeof DIMENSION_CHECKS)[number];
export const DIMENSION_CHECK_LABELS: Record<DimensionCheck, string> = {
  couche_texte: "Retrouvée dans le texte vectoriel",
  non_retrouvee: "Absente du texte vectoriel",
  sans_couche_texte: "Page sans texte vectoriel",
  deduite: "Déduite d’autres cotes par le lecteur",
  denombree: "Dénombré sur la planche",
};

export const MEASURE_CONFIDENCES = ["elevee", "moyenne", "faible"] as const;
export type MeasureConfidence = (typeof MEASURE_CONFIDENCES)[number];
export const MEASURE_CONFIDENCE_LABELS: Record<MeasureConfidence, string> = { elevee: "Élevée", moyenne: "Moyenne", faible: "Faible" };

/** Cote relevée citée par une entrée de formule. */
export interface DimensionRef {
  id: string;
  drawingId: string;
  element: string;
  name: string;
  value: string;
  unit: string;
  source: "cote_lue" | "texte_lu" | "deduit";
  check: DimensionCheck;
}

/** Origine d'une entrée de formule. */
export interface MeasureInputSource {
  name: string;
  value: string;
  /** « plan » : appuyée sur des cotes relevées ; « saisie » : valeur saisie ou corrigée par l'utilisateur. */
  origin: "plan" | "saisie";
  dimensions: DimensionRef[];
  /** Valeur calculée à partir des cotes (somme, différence, moitié…), et non simple conversion d'une cote. */
  computed: boolean;
  derivation: string | null;
  note: string | null;
  /** Écart constaté entre la valeur et sa cote convertie en mètres, sans calcul indiqué. */
  mismatch: string | null;
}

export interface MeasureDeduction {
  label: string;
  formula: string;
  quantity: string | null;
}

/** Confiance d'une mesure proposée, d'après l'origine de ses entrées. */
export function measureConfidence(sources: MeasureInputSource[]): MeasureConfidence {
  if (sources.length === 0) return "faible";
  let medium = false;
  for (const s of sources) {
    if (s.origin !== "plan" || s.dimensions.length === 0 || s.mismatch) return "faible";
    if (s.dimensions.some((d) => d.check === "non_retrouvee")) return "faible";
    if (s.computed || s.dimensions.some((d) => d.check !== "couche_texte")) medium = true;
  }
  return medium ? "moyenne" : "elevee";
}
