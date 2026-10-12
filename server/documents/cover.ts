/**
 * Géométrie de la couverture, commune au PDF et au Word : logo en haut à gauche, phase en haut à droite, arche
 * du site à droite avec le sigle dans sa niche, titre puis grille d'informations à gauche, filet et pied.
 * Le titre et la grille sont dans le flux de la page, l'un sous l'autre : leur position de départ et le corps
 * du titre sont calculés d'après la longueur réelle des textes pour que tout tienne avant le pied de page.
 */
import { mm, PAGE, printable, TYPE } from "./brand.js";
import { lineCount } from "./measure.js";
import type { DocMeta } from "./model.js";

const dateFr = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

export interface CoverLayout {
  side: number;
  landscape: boolean;
  arch: { x: number; y: number; width: number; bottom: number };
  /** Largeur du bloc de titre (il ne croise jamais l'arche en paysage). */
  textWidth: number;
  /** Largeur de la grille d'informations. */
  gridWidth: number;
  /** Ordonnée du haut du bloc de titre (points depuis le haut de la page). */
  top: number;
  titleSize: number;
  rows: Array<[string, string]>;
}

export function coverInfo(m: DocMeta): Array<[string, string]> {
  if (m.coverRows) return m.coverRows.filter((r) => Boolean(r[1]));
  const info: Array<[string, string | null]> = [
    ["Maître d’ouvrage", m.client],
    ["Localisation", m.project.location],
    ["Référence du dossier", m.project.reference],
    ["Lot", m.lot],
    ["Version", m.version !== null ? `${m.version}, du ${dateFr.format(m.date)}` : dateFr.format(m.date)],
    ["Statut", m.status],
    ["Phase", m.project.phase],
    ["Établi par", m.company],
  ];
  return info.filter((r): r is [string, string] => Boolean(r[1]));
}

export function coverLayout(m: DocMeta, page: { width: number; height: number }): CoverLayout {
  const side = mm(PAGE.marginSide);
  const landscape = page.width > page.height;
  const archWidth = Math.min(page.width * 0.4, 240);
  const archX = page.width - side - archWidth + 10;
  const archY = page.height * 0.2;
  const archBottom = archY + archWidth * 1.2;
  // En portrait, le titre commence sous l'arche et peut empiéter sur sa largeur ; en paysage, il reste à sa gauche.
  const textWidth = landscape ? archX - side - 18 : page.width - side * 2 - archWidth * 0.55;
  const gridWidth = landscape ? textWidth : page.width - side * 2;
  const rows = coverInfo(m);
  const half = Math.ceil(rows.length / 2);
  const columnWidth = (gridWidth - 24) / 2;
  const gridHeight = (items: Array<[string, string]>) => items.reduce((h, [, value]) => h + 6.6 * 1.885 + 1 + lineCount(printable(value), columnWidth, 9.2, "semibold") * 9.2 * 1.885 + 9, 0);
  const grid = Math.max(gridHeight(rows.slice(0, half)), gridHeight(rows.slice(half)));
  const footerTop = page.height - mm(24);
  const blockHeight = (size: number) =>
    TYPE.coverKicker * 1.885 +
    10 +
    lineCount(printable(m.title), textWidth, size, "serif") * size * 1.3 * 1.05 +
    12 +
    lineCount(printable(m.project.name), textWidth, TYPE.coverProject) * TYPE.coverProject * 1.885 +
    11 +
    (m.disclaimer ? 10 + lineCount(printable(m.disclaimer), textWidth, 7.6) * 7.6 * 1.885 : 0) +
    22;
  // Début du bloc : moitié de la page en portrait (sous l'arche), plus haut en paysage où il reste à sa gauche.
  const preferredTop = landscape ? page.height * 0.36 : page.height * 0.5;
  const minTop = landscape ? mm(46) : page.height * 0.42;
  const placed = (size: number) => Math.max(minTop, Math.min(preferredTop, footerTop - grid - blockHeight(size)));
  let titleSize: number = TYPE.coverTitle;
  while (titleSize > 18 && placed(titleSize) + blockHeight(titleSize) + grid > footerTop) titleSize -= 2;
  return { side, landscape, arch: { x: archX, y: archY, width: archWidth, bottom: archBottom }, textWidth, gridWidth, top: placed(titleSize), titleSize, rows };
}
