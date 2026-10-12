/**
 * Unités de mesure : écritures courantes ramenées à une forme unique pour les comparer, et conversions exactes
 * entre unités d'une même grandeur (masse, volume, longueur, surface). Aucune conversion n'est faite entre
 * grandeurs différentes, ni pour l'heure, le jour, l'unité ou le forfait, dont l'équivalence dépend du chantier.
 */
import { Dec } from "./decimal.js";

const ALIASES: Record<string, string> = {
  "m³": "m3",
  m3: "m3",
  "m²": "m2",
  m2: "m2",
  m: "ml",
  ml: "ml",
  "m.l": "ml",
  "mètre": "ml",
  u: "u",
  "unité": "u",
  unite: "u",
  pce: "u",
  "pièce": "u",
  piece: "u",
  nb: "u",
  ens: "ens",
  ensemble: "ens",
  ft: "ens",
  ff: "ens",
  fft: "ens",
  forfait: "ens",
  kg: "kg",
  t: "t",
  tonne: "t",
  h: "h",
  heure: "h",
  j: "j",
  jour: "j",
  l: "l",
  litre: "l",
};

export function normalizeUnit(unit: string | null | undefined): string {
  const key = (unit ?? "").trim().toLowerCase().replace(/\s+/g, "");
  return ALIASES[key] ?? key;
}

/** Unités reconnues : formes ci-dessus, distances, durées, pourcentage et « pour mémoire ». */
const KNOWN = new Set([...Object.values(ALIASES), "km", "cm", "mm", "mois", "sem", "semaine", "an", "%", "pm", "t.km", "m3.km"]);

export function isKnownUnit(unit: string | null | undefined): boolean {
  return KNOWN.has(normalizeUnit(unit));
}

export function sameUnit(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b) && normalizeUnit(a) === normalizeUnit(b);
}

/** Valeur de chaque unité convertible dans l'unité de référence de sa grandeur. */
const MEASURES: Record<string, { quantity: string; value: string }> = {
  t: { quantity: "masse", value: "1000" },
  kg: { quantity: "masse", value: "1" },
  g: { quantity: "masse", value: "0.001" },
  m3: { quantity: "volume", value: "1" },
  l: { quantity: "volume", value: "0.001" },
  km: { quantity: "longueur", value: "1000" },
  ml: { quantity: "longueur", value: "1" },
  cm: { quantity: "longueur", value: "0.01" },
  mm: { quantity: "longueur", value: "0.001" },
  ha: { quantity: "surface", value: "10000" },
  m2: { quantity: "surface", value: "1" },
};

/** Nombre d'unités « to » dans une unité « from » (1 t = 1 000 kg), ou null si elles ne se convertissent pas. */
export function unitFactor(from: string | null | undefined, to: string | null | undefined): Dec | null {
  if (!from || !to) return null;
  const a = MEASURES[normalizeUnit(from)];
  const b = MEASURES[normalizeUnit(to)];
  if (!a || !b || a.quantity !== b.quantity) return sameUnit(from, to) ? new Dec(1) : null;
  return new Dec(a.value).div(b.value);
}

/** Même unité, ou unités d'une même grandeur convertibles exactement. */
export function compatibleUnits(a: string | null | undefined, b: string | null | undefined): boolean {
  return unitFactor(a, b) !== null;
}

/** Prix exprimé dans une autre unité de la même grandeur (1 200 la tonne : 1,20 le kilogramme), à 4 décimales. */
export function convertPrice(price: string, priceUnit: string | null | undefined, targetUnit: string | null | undefined): string | null {
  const factor = unitFactor(priceUnit, targetUnit);
  if (!factor) return null;
  return new Dec(price).div(factor).toDecimalPlaces(4).toFixed(4);
}
