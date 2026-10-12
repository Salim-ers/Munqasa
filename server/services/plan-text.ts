/**
 * Exploitation du texte vectoriel d'une planche PDF (plans issus de la CAO) : les nombres réellement
 * écrits sur la page servent à contrôler chaque cote relevée par l'agent, l'échelle est lue telle qu'elle
 * est écrite, un extrait ordonné du texte accompagne l'image pour que l'agent lise les cotes exactes.
 * Une page scannée n'a pas de texte vectoriel : ses cotes restent non contrôlables, et c'est dit.
 */
import { Decimal } from "decimal.js";
import type { DimensionChain, DimensionCheck } from "../../shared/metre.js";
import type { TextItem } from "./pdf-text.js";

export type { ChainItem, DimensionChain } from "../../shared/metre.js";

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

/* ---------- Chaînes de cotes ---------- */

/** Valeur en mètres d'une cote écrite selon l'usage des plans : décimale en mètres, entière en centimètres. */
export function dimensionMeters(text: string): string | null {
  const t = text.trim().replace(",", ".");
  if (/^\d{1,2}\.\d{1,3}$/.test(t)) return new Dec(t).toString();
  if (/^\d{1,3}$/.test(t) && Number(t) > 0) return new Dec(t).div(100).toString();
  return null;
}

/** Points de papier par mètre réel, à l'échelle 1/ratio. */
const pointsPerMeter = (ratio: number) => (72 / 25.4) * (1000 / ratio);

/**
 * Chaînes de cotes d'une page : cotes numériques horizontales ou verticales regroupées par ligne de cote, puis
 * découpées là où l'écartement ne correspond plus aux valeurs (contrôle impossible sans échelle lue).
 */
export function dimensionChains(items: TextItem[], ratio: number | null): DimensionChain[] {
  const k = ratio ? pointsPerMeter(ratio) : null;
  type Token = { text: string; meters: number; orientation: "horizontale" | "verticale"; line: number; at: number };
  const tokens: Token[] = [];
  for (const item of items) {
    const meters = dimensionMeters(item.text);
    if (meters === null) continue;
    const angle = ((Math.round(item.angle) % 360) + 360) % 360;
    // Centre du texte le long de son sens d'écriture (repère de la page affichée, y vers le bas).
    if (angle === 0) tokens.push({ text: item.text.trim(), meters: Number(meters), orientation: "horizontale", line: item.y, at: item.x + item.width / 2 });
    else if (angle === 180) tokens.push({ text: item.text.trim(), meters: Number(meters), orientation: "horizontale", line: item.y, at: item.x - item.width / 2 });
    else if (angle === 90) tokens.push({ text: item.text.trim(), meters: Number(meters), orientation: "verticale", line: item.x, at: item.y - item.width / 2 });
    else if (angle === 270) tokens.push({ text: item.text.trim(), meters: Number(meters), orientation: "verticale", line: item.x, at: item.y + item.width / 2 });
  }
  // Lignes de cote : même orientation, même position transversale à 1,5 point près.
  const lines: Token[][] = [];
  for (const t of [...tokens].sort((a, b) => (a.orientation === b.orientation ? a.line - b.line : a.orientation < b.orientation ? -1 : 1))) {
    const last = lines[lines.length - 1];
    if (last && last[0]!.orientation === t.orientation && Math.abs(last[last.length - 1]!.line - t.line) <= 1.5) last.push(t);
    else lines.push([t]);
  }
  const chains: DimensionChain[] = [];
  for (const line of lines) {
    const sorted = [...line].sort((a, b) => a.at - b.at);
    let current: Token[] = [];
    const flush = () => {
      if (current.length >= 2) {
        const sum = current.reduce((s, t) => s.plus(t.meters), new Dec(0));
        const first = current[0]!;
        const last = current[current.length - 1]!;
        chains.push({
          orientation: first.orientation,
          line: Math.round(first.line * 10) / 10,
          start: k ? Math.round((first.at - (first.meters / 2) * k) * 10) / 10 : Math.round(first.at),
          end: k ? Math.round((last.at + (last.meters / 2) * k) * 10) / 10 : Math.round(last.at),
          items: current.map((t) => ({ text: t.text, meters: String(t.meters), at: Math.round(t.at * 10) / 10 })),
          sum: sum.toDecimalPlaces(3).toString(),
          verified: k !== null,
          total: null,
        });
      }
      current = [];
    };
    for (const t of sorted) {
      const previous = current[current.length - 1];
      if (previous && k) {
        // Deux cotes voisines d'une même chaîne : leurs centres sont écartés de la demi-somme de leurs valeurs.
        const expected = ((previous.meters + t.meters) / 2) * k;
        const gap = t.at - previous.at;
        if (Math.abs(gap - expected) > Math.max(3, expected * 0.06)) flush();
      } else if (previous && !k && t.at - previous.at > 400) flush();
      current.push(t);
    }
    flush();
  }
  // Cote totale : sur une ligne parallèle proche, égale à la somme (au centimètre) et centrée sur la chaîne.
  if (k) {
    for (const chain of chains) {
      const mid = (chain.start + chain.end) / 2;
      const length = chain.end - chain.start;
      const total = tokens.find(
        (t) =>
          t.orientation === chain.orientation &&
          Math.abs(t.line - chain.line) > 1.5 &&
          Math.abs(t.line - chain.line) <= 80 &&
          Math.abs(t.meters - Number(chain.sum)) <= 0.011 &&
          Math.abs(t.at - mid) <= Math.max(6, length * 0.03),
      );
      if (total) chain.total = { text: total.text, meters: String(total.meters) };
    }
  }
  return chains;
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
