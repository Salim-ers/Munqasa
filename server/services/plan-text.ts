/**
 * Exploitation du texte vectoriel d'une planche PDF (plans issus de la CAO) : les nombres réellement
 * écrits sur la page servent à contrôler chaque cote relevée par l'agent, l'échelle est lue telle qu'elle
 * est écrite, un extrait ordonné du texte accompagne l'image pour que l'agent lise les cotes exactes.
 * Une page scannée n'a pas de texte vectoriel : ses cotes restent non contrôlables, et c'est dit.
 */
import { Decimal } from "decimal.js";
import type { DimensionCheck } from "../../shared/metre.js";
import type { TextItem } from "./pdf-text.js";

const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** Forme canonique d'un nombre écrit (« 2,50 » et « 2.5 » donnent « 2.5 », « 060 » donne « 60 »), ou null. */
export function normalizeNumber(raw: string): string | null {
  const text = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(text)) return null;
  return new Dec(text).toString();
}

/** Nombres écrits sur la page, sous leur forme canonique. */
export function numberTokens(items: TextItem[]): Set<string> {
  const out = new Set<string>();
  for (const item of items) {
    for (const match of item.text.matchAll(/\d+(?:[.,]\d+)?/g)) {
      const n = normalizeNumber(match[0]);
      if (n !== null) out.add(n);
    }
  }
  return out;
}

/** « 1/50 », « Ech.1:100 » ; ni « 21/100 », ni « 2.1/50 », ni un niveau « R+1/2 ». */
const SCALE = /(?<![\d+\-/])(?<!\d[.,])1\s*[/:]\s*(\d{1,4})(?![\d/,.])/g;
const ALLOWED_SCALES = new Set([5, 10, 20, 25, 50, 75, 100, 125, 200, 250, 500, 1000, 2000, 2500, 5000]);

/** Échelles écrites dans un texte (« 1/50 », « Ech. 1:100 »), limitées aux échelles usuelles du bâtiment. */
export function scalesIn(text: string): number[] {
  const found = new Set<number>();
  for (const match of text.matchAll(SCALE)) {
    const ratio = Number(match[1]);
    if (ALLOWED_SCALES.has(ratio)) found.add(ratio);
  }
  return [...found].sort((a, b) => a - b);
}

/**
 * Échelle retenue pour la planche : celle du texte vectoriel quand il n'en porte qu'une, sinon celle écrite
 * dans le cartouche si elle figure parmi les échelles de la page ; jamais devinée.
 */
export function resolveScale(textScales: number[], cartouche: string | null): { ratio: number | null; reason: string } {
  const read = cartouche ? scalesIn(cartouche) : [];
  if (textScales.length === 1) return { ratio: textScales[0]!, reason: `échelle 1/${textScales[0]} lue dans le texte vectoriel` };
  if (textScales.length > 1) {
    const match = read.find((r) => textScales.includes(r));
    return match ? { ratio: match, reason: `échelle 1/${match} du cartouche, parmi ${textScales.length} échelles de la page` } : { ratio: null, reason: `${textScales.length} échelles sur la page, aucune retenue` };
  }
  if (read.length === 1) return { ratio: read[0]!, reason: `échelle 1/${read[0]} lue sur l’image du cartouche` };
  return { ratio: null, reason: "échelle non lue" };
}

/**
 * Extrait du texte de la page pour l'agent, sans doublons et borné : d'abord les nombres écrits seuls
 * (cotes, niveaux), puis les autres textes, chacun dans l'ordre de lecture (de haut en bas, de gauche à droite).
 */
export function textExcerpt(items: TextItem[], maxChars = 6000): string {
  const sorted = [...items].sort((a, b) => Math.round(a.y / 4) - Math.round(b.y / 4) || a.x - b.x);
  const numbers: string[] = [];
  const texts: string[] = [];
  const seen = new Set<string>();
  for (const item of sorted) {
    const text = item.text.replace(/\s+/g, " ").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    if (/^[+-]?\d+(?:[.,]\d+)?$/.test(text)) numbers.push(text);
    else texts.push(text);
  }
  const clip = (list: string[], budget: number) => {
    let out = "";
    for (const entry of list) {
      if (out.length + entry.length + 3 > budget) return `${out} ; [suite tronquée]`;
      out = out ? `${out} ; ${entry}` : entry;
    }
    return out;
  };
  const numberBudget = Math.min(Math.floor(maxChars * 0.4), numbers.join(" ; ").length + 20);
  const parts = [
    numbers.length ? `Nombres écrits seuls : ${clip(numbers, numberBudget)}` : null,
    texts.length ? `Textes : ${clip(texts, maxChars - numberBudget)}` : null,
  ];
  return parts.filter(Boolean).join("\n");
}

/** Contrôle d'une cote relevée : sa valeur figure-t-elle parmi les nombres écrits sur la page ? */
export function checkDimension(value: string, source: "cote_lue" | "texte_lu" | "deduit", numbers: Set<string> | null): DimensionCheck {
  if (source === "deduit") return "deduite";
  if (numbers === null) return "sans_couche_texte";
  const n = normalizeNumber(value);
  return n !== null && numbers.has(n) ? "couche_texte" : "non_retrouvee";
}

/** Valeur exprimée en mètres (m, cm, mm), ou null si l'unité n'est pas une longueur reconnue. */
export function toMeters(value: string, unit: string): string | null {
  const n = normalizeNumber(value);
  if (n === null) return null;
  const u = unit.trim().toLowerCase();
  const factor = u === "m" ? 1 : u === "cm" ? 100 : u === "mm" ? 1000 : null;
  if (factor === null) return null;
  return new Dec(n).div(factor).toString();
}
