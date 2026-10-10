/** Outils des lecteurs de sources : statistiques (médiane, quartiles), clés stables, dates, CSV. */

/** Quantile d'une série triée (interpolation linéaire entre rangs, méthode usuelle des tableurs). */
export function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) throw new Error("Série vide.");
  const h = (sorted.length - 1) * p;
  const low = Math.floor(h);
  const high = Math.min(low + 1, sorted.length - 1);
  return sorted[low]! + (h - low) * (sorted[high]! - sorted[low]!);
}

export interface Summary {
  n: number;
  median: number;
  q1: number;
  q3: number;
}

export function summarize(values: number[]): Summary {
  const sorted = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  return { n: sorted.length, median: quantile(sorted, 0.5), q1: quantile(sorted, 0.25), q3: quantile(sorted, 0.75) };
}

/** Chaîne décimale à 4 décimales au plus, sans zéros superflus. */
export function decimal(value: number): string {
  return String(Math.round(value * 10_000) / 10_000);
}

/** Clé stable : minuscules, sans accents, mots séparés par des tirets. */
export function slug(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Date ISO d'une date française jj/mm/aaaa, ou null. */
export function frenchDate(raw: string | undefined): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((raw ?? "").trim());
  if (!m) return null;
  const year = Number(m[3]);
  if (year < 1990 || year > 2100) return null;
  return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
}

/** Date médiane d'une liste de dates ISO. */
export function medianDate(dates: string[]): string | null {
  if (dates.length === 0) return null;
  const sorted = [...dates].sort();
  return sorted[Math.floor((sorted.length - 1) / 2)]!;
}

/** Texte d'un fichier : UTF-8 s'il est valide, sinon Windows-1252 (exports CSV historiques). */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF+/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** CSV complet (guillemets, retours à la ligne dans un champ), séparateur imposé, sans limite de lignes. */
export function parseDelimited(text: string, sep = ";"): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  const [header, ...data] = rows;
  if (!header) return [];
  const names = header.map((h) => h.replace(/^\uFEFF+/, "").trim());
  return data.map((cells) => Object.fromEntries(names.map((name, i) => [name, (cells[i] ?? "").trim()])));
}

/** Nombre d'un champ CSV (point ou virgule décimale), ou null. */
export function csvNumber(raw: string | undefined): number | null {
  const text = (raw ?? "").replace(/\s/g, "").replace(",", ".");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}
