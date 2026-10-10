/**
 * Calcul d'une mesure de métré et origine de ses entrées :
 * - quantité brute par la formule, déductions explicites évaluées avec les mêmes variables, quantité nette ;
 *   une déduction incalculable rend la mesure incalculable (jamais comptée comme zéro) ;
 * - pour une mesure proposée par l'agent, chaque entrée est rattachée aux cotes relevées qu'elle cite,
 *   et sa valeur est comparée à la cote convertie en mètres.
 */
import type { DimensionRef, MeasureDeduction, MeasureInputSource } from "../../shared/metre.js";
import { Dec } from "./decimal.js";
import { evaluateFormula, FormulaError } from "./formula.js";
import { normalizeNumber, toMeters } from "./plan-text.js";

export interface MeasureResult {
  gross: string;
  net: string;
  deductions: MeasureDeduction[];
}

export function computeMeasure(formula: string, inputs: Record<string, string>, deductions: Array<{ label: string; formula: string }> = []): MeasureResult {
  const gross = evaluateFormula(formula, inputs);
  let total = new Dec(0);
  const evaluated = deductions.map((d) => {
    let quantity: string;
    try {
      quantity = evaluateFormula(d.formula, inputs);
    } catch (error) {
      throw new FormulaError(`Déduction « ${d.label} » : ${error instanceof Error ? error.message : "calcul impossible"}`);
    }
    total = total.plus(quantity);
    return { label: d.label, formula: d.formula, quantity };
  });
  const net = new Dec(gross).minus(total);
  if (net.lt(0)) throw new FormulaError("Les déductions dépassent la quantité brute.");
  return { gross, net: net.toDecimalPlaces(4).toFixed(4), deductions: evaluated };
}

/** Valeur attendue d'une cote reprise telle quelle : convertie en mètres si c'est une longueur. */
function expectedValue(d: DimensionRef): string | null {
  return toMeters(d.value, d.unit) ?? normalizeNumber(d.value);
}

/** Origine d'une entrée proposée : cotes citées, calcul éventuel, concordance de la valeur. */
export function analyseInput(input: { name: string; value: string; source: string; dimensionIds: string[]; derivation: string | null }, index: Map<string, DimensionRef>): MeasureInputSource {
  const dimensions = input.dimensionIds.map((id) => index.get(id)).filter((d): d is DimensionRef => Boolean(d));
  const unknown = input.dimensionIds.filter((id) => !index.has(id));
  const derivation = input.derivation?.trim() || null;
  const value = normalizeNumber(input.value);
  let computed = false;
  let mismatch: string | null = null;
  if (dimensions.length === 1) {
    const expected = expectedValue(dimensions[0]!);
    if (expected === null || value === null || expected !== value) {
      if (derivation) computed = true;
      else mismatch = `${input.value} ne correspond pas à la cote ${dimensions[0]!.value} ${dimensions[0]!.unit}${expected ? `, soit ${expected} m` : ""}`;
    }
  } else if (dimensions.length > 1) {
    if (derivation) computed = true;
    else mismatch = `valeur tirée de ${dimensions.length} cotes sans calcul indiqué`;
  }
  const notes = [input.source.trim() || null, unknown.length ? `identifiant de cote inconnu : ${unknown.join(", ")}` : null].filter(Boolean);
  return { name: input.name, value: input.value, origin: "plan", dimensions, computed, derivation, note: notes.join(" ; ") || null, mismatch };
}

/** Origine des entrées après une saisie : une valeur inchangée garde ses cotes, une valeur modifiée devient saisie. */
export function manualSources(inputs: Record<string, string>, previous: MeasureInputSource[]): MeasureInputSource[] {
  return Object.entries(inputs).map(([name, value]) => {
    const before = previous.find((s) => s.name === name);
    if (before && before.value === value) return before;
    return { name, value, origin: "saisie", dimensions: [], computed: false, derivation: null, note: null, mismatch: null };
  });
}
