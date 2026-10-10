/**
 * Charte documentaire de Talab Solutions, reprise du site : couleurs (src/styles/tokens.css), polices
 * (Instrument Serif pour les titres, Manrope pour le texte), logos jour et nuit (public/logos), arche
 * brisée à épaulements (src/lib/arch.ts). Un seul système pour tous les exports Word, PDF et Excel, en
 * version claire (impression, par défaut) et sombre (présentation) : seules les couleurs changent, jamais
 * les logos, les tailles, les polices ni la composition.
 *
 * Les couleurs principales restent celles de Paramètres > Identité documentaire, dont les valeurs par
 * défaut sont celles du site. Polices sous licence SIL Open Font License (assets/fonts/OFL-*.txt).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DocumentIdentity } from "../../shared/settings.js";

export type DocTheme = "clair" | "sombre";

/** Couleurs fixes de la marque (site, tokens.css). */
export const BRAND = {
  terracotta: "#A0411E",
  terracottaDeep: "#86351A",
  sand: "#B88D5E",
  ink: "#171717",
  night: "#0B0C0D",
  ivory: "#F5F1E9",
  warmWhite: "#FFFDF8",
  stone: "#D8CBBB",
  nightAccent: "#C9A06A",
  nightSurface: "#141414",
  nightSurfaceAlt: "#1D1915",
} as const;

export interface Palette {
  theme: DocTheme;
  /** Fond de page (blanc à l'impression, nuit en présentation). */
  page: string;
  /** En-têtes de tableau, encadrés. */
  surface: string;
  /** Lignes de chapitre, exigences. */
  surfaceAlt: string;
  ink: string;
  muted: string;
  faint: string;
  rule: string;
  /** Accent principal (terracotta) : titres de chapitre, repères. */
  primary: string;
  /** Accent secondaire (sable) : filets, arche, numéros. */
  secondary: string;
  /** Texte posé sur l'accent principal. */
  onPrimary: string;
}

const clean = (hex: string) => (/^#[0-9a-f]{6}$/i.test(hex) ? hex.toUpperCase() : null);

export function palette(theme: DocTheme, identity: Pick<DocumentIdentity, "primaryColor" | "secondaryColor" | "inkColor">): Palette {
  const primary = clean(identity.primaryColor) ?? BRAND.terracotta;
  const secondary = clean(identity.secondaryColor) ?? BRAND.sand;
  if (theme === "sombre") {
    return {
      theme,
      page: BRAND.night,
      surface: BRAND.nightSurfaceAlt,
      surfaceAlt: BRAND.nightSurface,
      ink: BRAND.ivory,
      muted: "#B9AD9C",
      faint: "#7D7367",
      rule: "#3A332B",
      // Le terracotta reste réservé aux filets : sur fond nuit, l'accent lisible est le bronze du site.
      primary: BRAND.nightAccent,
      secondary,
      onPrimary: BRAND.night,
    };
  }
  return {
    theme,
    page: "#FFFFFF",
    surface: "#F1EADF",
    surfaceAlt: "#F8F4EE",
    ink: clean(identity.inkColor) ?? BRAND.ink,
    muted: "#5E5A54",
    faint: "#8A847B",
    rule: "#E3D9CC",
    primary,
    secondary,
    onPrimary: "#FFFFFF",
  };
}

/** Échelle typographique commune, en points. */
export const TYPE = {
  coverTitle: 30,
  coverKicker: 8.5,
  coverProject: 14,
  h1: 19,
  h2: 11.5,
  h3: 10,
  body: 9.5,
  small: 8,
  table: 8.3,
  tableSmall: 7.6,
  running: 7.4,
  lineHeight: 1.38,
} as const;

/** Marges de page (millimètres) : identiques en Word et en PDF. */
export const PAGE = { marginTop: 24, marginBottom: 20, marginSide: 20, headerTop: 9, footerBottom: 9 } as const;

export const mm = (value: number) => (value * 72) / 25.4;

/**
 * Arche brisée à épaulements du site (src/lib/arch.ts), dans une boîte 200 x 240, ouverte en bas.
 * Reprise telle quelle pour la couverture et les repères de chapitre.
 */
export const ARCH_OUTLINE = "M24 240 V150 L46 132 V100 L66 88 C66 58 88 42 100 14 C112 42 134 58 134 88 L154 100 V132 L176 150 V240";
export const ARCH_INNER = "M70 240 V118 C70 94 90 80 100 62 C110 80 130 94 130 118 V240";

export function archSvg(stroke: string, inner: string, width = 1.4, innerFill = "none"): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240"><path d="${ARCH_OUTLINE}" fill="none" stroke="${stroke}" stroke-width="${width}"/><path d="${ARCH_INNER}" fill="${innerFill}" stroke="${inner}" stroke-width="${width * 0.8}"/></svg>`;
}

/* ---------- Fichiers de la charte (polices, logos), lus une fois puis gardés en mémoire ---------- */

const ASSETS = join(process.cwd(), "server", "documents", "assets");
const cache = new Map<string, Buffer>();

export function asset(relative: string): Buffer {
  let data = cache.get(relative);
  if (!data) {
    data = readFileSync(join(ASSETS, relative));
    cache.set(relative, data);
  }
  return data;
}

export const FONTS = {
  regular: "fonts/Manrope-Regular.ttf",
  medium: "fonts/Manrope-Medium.ttf",
  semibold: "fonts/Manrope-SemiBold.ttf",
  bold: "fonts/Manrope-Bold.ttf",
  serif: "fonts/InstrumentSerif-Regular.ttf",
  serifItalic: "fonts/InstrumentSerif-Italic.ttf",
  arabic: "fonts/NotoSansArabic-Regular.ttf",
  arabicBold: "fonts/NotoSansArabic-SemiBold.ttf",
} as const;

export type LogoKind = "logo" | "symbole" | "nom";

/** Logo officiel : version jour sur fond clair, version nuit sur fond sombre. */
export function logo(kind: LogoKind, theme: DocTheme): Buffer {
  return asset(`logos/${kind}-${theme === "sombre" ? "nuit" : "jour"}.png`);
}

/** Proportions des logos (largeur / hauteur), pour réserver leur place sans les déformer. */
export const LOGO_RATIO: Record<LogoKind, number> = { logo: 700 / 637, symbole: 360 / 228, nom: 600 / 176 };

/* ---------- Texte : écriture française et arabe ---------- */

/**
 * Les polices ne portent pas l'espace fine insécable (U+202F) produite par Intl en français :
 * elle devient une espace insécable ordinaire, sans changer la mise en forme des nombres.
 */
export function printable(text: string): string {
  return text.replace(/[  ]/g, " ");
}

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
export const hasArabic = (text: string) => ARABIC.test(text);

/** Découpe un texte en segments latins et arabes, pour donner à chacun sa police. */
export function scriptRuns(text: string): Array<{ text: string; arabic: boolean }> {
  const runs: Array<{ text: string; arabic: boolean }> = [];
  for (const ch of text) {
    const arabic = ARABIC.test(ch);
    const neutral = /[\s\d.,:;()\-/]/.test(ch);
    const last = runs[runs.length - 1];
    if (last && (last.arabic === arabic || neutral)) last.text += ch;
    else runs.push({ text: ch, arabic });
  }
  return runs;
}
