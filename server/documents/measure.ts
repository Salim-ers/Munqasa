/**
 * Mesure des textes avec les métriques des polices embarquées (Manrope, Instrument Serif) : largeur exacte
 * d'un texte à une taille donnée, plus long mot d'une cellule. Sert à dimensionner les colonnes des tableaux
 * et la couverture sans jamais couper un mot ni déborder de la page.
 */
import { create, type Font } from "fontkit";
import { asset, FONTS } from "./brand.js";

export type MeasureFont = "regular" | "semibold" | "bold" | "serif";

const cache = new Map<MeasureFont, Font>();
const FILES: Record<MeasureFont, string> = { regular: FONTS.regular, semibold: FONTS.semibold, bold: FONTS.bold, serif: FONTS.serif };

function font(name: MeasureFont): Font {
  let f = cache.get(name);
  if (!f) {
    f = create(asset(FILES[name]));
    cache.set(name, f);
  }
  return f;
}

/** Largeur d'un texte en points (espacement des caractères éventuel compris). */
export function textWidth(text: string, size: number, name: MeasureFont = "regular", characterSpacing = 0): number {
  if (!text) return 0;
  const f = font(name);
  return (f.layout(text).advanceWidth / f.unitsPerEm) * size + characterSpacing * text.length;
}

/** Plus long mot d'un texte (insécable pour le rendu : jamais coupé). */
export function longestWord(text: string, size: number, name: MeasureFont = "regular"): number {
  let max = 0;
  for (const word of text.split(/\s+/)) if (word) max = Math.max(max, textWidth(word, size, name));
  return max;
}

/** Nombre de lignes approximatif d'un texte dans une largeur donnée (coupure aux espaces). */
export function lineCount(text: string, width: number, size: number, name: MeasureFont = "regular"): number {
  let lines = 0;
  for (const paragraph of text.split("\n")) {
    let current = 0;
    let used = 1;
    const space = textWidth(" ", size, name);
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const w = textWidth(word, size, name);
      if (current > 0 && current + space + w > width) {
        used++;
        current = w;
      } else current += (current > 0 ? space : 0) + w;
    }
    lines += used;
  }
  return Math.max(lines, 1);
}
