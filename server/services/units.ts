/** Unités de mesure : écritures courantes ramenées à une forme unique pour les comparer. */
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
