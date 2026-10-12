/**
 * Largeur des colonnes d'un tableau, commune au PDF et au Word : largeurs relatives demandées par le modèle,
 * puis chaque colonne élargie jusqu'à son plus long mot (en-tête compris) pour qu'aucun mot ne soit coupé ;
 * le surplus est pris sur les colonnes qui ont de la marge, en priorité les colonnes extensibles. La somme
 * vaut toujours la largeur utile de la page : le tableau ne déborde jamais des marges.
 */
import { textWidth } from "./measure.js";
import { type Block, cellOf } from "./model.js";

type TableBlock = Extract<Block, { type: "table" }>;

export interface FitOptions {
  /** Largeur utile (points), marges de la page déduites. */
  contentWidth: number;
  /** Taille du texte des cellules et de l'en-tête (points). */
  size: number;
  /** Retrait intérieur gauche + droit d'une cellule (points). */
  padding: number;
}

function longest(text: string, size: number, bold: boolean): number {
  let max = 0;
  for (const word of text.split(/\s+/)) if (word) max = Math.max(max, textWidth(word, size, bold ? "semibold" : "regular"));
  return max;
}

/** Largeurs extérieures des colonnes (points), retrait intérieur compris. */
export function fitColumns(block: TableBlock, options: FitOptions): number[] {
  const { contentWidth: W, size, padding } = options;
  const columns = block.columns;
  const stars = columns.map((c, i) => (c.width === undefined || c.width === "*" ? i : -1)).filter((i) => i >= 0);
  const widths = columns.map((c) => (typeof c.width === "number" ? (c.width / 100) * W : 0));
  const remaining = Math.max(W - widths.reduce((s, w) => s + w, 0), 0);
  for (const i of stars) widths[i] = remaining / stars.length;

  // Plus long mot de chaque colonne : en-tête en gras, cellules (gras pour les lignes de groupe et de total).
  const mins = columns.map((c) => longest(c.label, size, true));
  for (const row of block.rows) {
    const strong = row.kind === "group" || row.kind === "subtotal" || row.kind === "total";
    let col = 0;
    for (const raw of row.cells) {
      const cell = cellOf(raw);
      const span = cell.colSpan && cell.colSpan > 1 ? cell.colSpan : 1;
      // Une cellule fusionnée se répartit sur plusieurs colonnes : elle n'impose pas de minimum à une seule.
      if (span === 1 && col < columns.length) {
        const lines = cell.text.split("\n");
        lines.forEach((line, li) => {
          mins[col] = Math.max(mins[col]!, longest(line, li === 0 ? size : size - 0.8, (cell.bold || strong) && li === 0));
        });
      }
      col += span;
    }
  }
  const floor = mins.map((m) => Math.min(m + padding + 1.5, W * 0.45));

  let deficit = 0;
  widths.forEach((w, i) => {
    if (w < floor[i]!) {
      deficit += floor[i]! - w;
      widths[i] = floor[i]!;
    }
  });
  if (deficit > 0) {
    const donors = widths.map((w, i) => ({ i, slack: w - floor[i]!, star: stars.includes(i) })).filter((d) => d.slack > 0);
    const starSlack = donors.filter((d) => d.star).reduce((s, d) => s + d.slack, 0);
    const otherSlack = donors.filter((d) => !d.star).reduce((s, d) => s + d.slack, 0);
    // Colonnes extensibles d'abord, puis les autres colonnes qui ont de la marge, chacune à proportion.
    const fromStars = Math.min(deficit, starSlack);
    const fromOthers = Math.min(deficit - fromStars, otherSlack);
    for (const d of donors) {
      if (d.star && starSlack > 0) widths[d.i] = widths[d.i]! - fromStars * (d.slack / starSlack);
      else if (!d.star && otherSlack > 0) widths[d.i] = widths[d.i]! - fromOthers * (d.slack / otherSlack);
    }
  }
  // Somme ramenée exactement à la largeur utile (arrondis, ou minimums impossibles à tous tenir).
  const total = widths.reduce((s, w) => s + w, 0);
  return widths.map((w) => Math.floor(((w * W) / total) * 100) / 100);
}
