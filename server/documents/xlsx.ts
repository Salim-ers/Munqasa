/**
 * Classeurs Excel aux couleurs de Talab Solutions : bandeau de titre avec le logo, informations de
 * l'affaire, en-tête de tableau filtrable et figé, mise en page d'impression (A4, ajusté à la largeur,
 * en-tête répété), pied de page paginé. Le thème sombre colore le bandeau et l'en-tête ; les cellules de
 * données restent claires pour la saisie et l'impression.
 */
import ExcelJS from "exceljs";
import { LOGO_RATIO, logo, type Palette } from "./brand.js";
import type { DocMeta } from "./model.js";

export const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;
export const moneyFormat = (currency: string) => `#,##0.00 "${currency}"`;
export const QTY_FORMAT = "#,##0.000";

export interface XlsxColumn {
  header: string;
  width: number;
  align?: "left" | "right" | "center";
}

export interface BrandedSheet {
  sheet: ExcelJS.Worksheet;
  headerRow: number;
  firstRow: number;
  lastColumn: string;
}

const col = (index: number) => {
  let n = index;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};
export const columnLetter = col;

export function newWorkbook(meta: DocMeta): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = meta.company ?? "Talab Solutions";
  workbook.company = "Talab Solutions";
  workbook.title = meta.title;
  workbook.created = meta.date;
  return workbook;
}

export function brandedSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  options: { meta: DocMeta; pal: Palette; columns: XlsxColumn[]; info?: Array<[string, string | null]>; landscape?: boolean },
): BrandedSheet {
  const { meta, pal, columns } = options;
  const sheet = workbook.addWorksheet(name, {
    pageSetup: {
      paperSize: 9,
      orientation: options.landscape ? "landscape" : "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
    headerFooter: { oddFooter: `&L${meta.footerText}&C${meta.title}&RPage &P sur &N`, oddHeader: `&L${meta.project.reference}&R${meta.lot ?? ""}` },
    properties: { defaultRowHeight: 16 },
  });
  sheet.columns = columns.map((c) => ({ width: c.width }));
  const last = col(columns.length);
  const dark = pal.theme === "sombre";
  const bandFill = dark ? argb(pal.page) : "FFFFFFFF";
  const ink = argb(pal.ink);

  // Bandeau : logo, titre, type de document, affaire.
  for (let r = 1; r <= 3; r++) {
    sheet.getRow(r).height = r === 1 ? 26 : 17;
    for (let c = 1; c <= columns.length; c++) sheet.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bandFill } };
  }
  const logoId = workbook.addImage({ buffer: logo("logo", pal.theme) as unknown as ExcelJS.Buffer, extension: "png" });
  const logoHeight = 58;
  sheet.addImage(logoId, { tl: { col: 0.08, row: 0.1 }, ext: { width: logoHeight * LOGO_RATIO.logo, height: logoHeight }, editAs: "oneCell" });
  sheet.mergeCells(`B1:${last}1`);
  sheet.getCell("B1").value = meta.title;
  sheet.getCell("B1").font = { name: "Instrument Serif", size: 18, color: { argb: argb(pal.primary) } };
  sheet.getCell("B1").alignment = { vertical: "middle", indent: 1 };
  sheet.mergeCells(`B2:${last}2`);
  sheet.getCell("B2").value = meta.typeLabel.toUpperCase();
  sheet.getCell("B2").font = { name: "Manrope", size: 8, bold: true, color: { argb: argb(pal.secondary) } };
  sheet.getCell("B2").alignment = { indent: 1 };
  sheet.mergeCells(`B3:${last}3`);
  sheet.getCell("B3").value = `${meta.project.reference}, ${meta.project.name}`;
  sheet.getCell("B3").font = { name: "Manrope", size: 10, color: { argb: dark ? argb(pal.ink) : ink } };
  sheet.getCell("B3").alignment = { indent: 1 };
  for (let c = 1; c <= columns.length; c++) sheet.getCell(3, c).border = { bottom: { style: "thin", color: { argb: argb(pal.secondary) } } };

  // Informations de l'affaire.
  let row = 5;
  const info = (options.info ?? [
    ["Maître d’ouvrage", meta.client],
    ["Localisation", meta.project.location],
    ["Lot", meta.lot],
    ["Version", meta.version !== null ? `${meta.version}, du ${meta.date.toLocaleDateString("fr-FR")}` : meta.date.toLocaleDateString("fr-FR")],
    ["Statut", meta.status],
    ["Établi par", meta.company],
  ]).filter((r): r is [string, string] => Boolean(r[1]));
  for (const [label, value] of info) {
    sheet.getCell(`A${row}`).value = label;
    sheet.getCell(`A${row}`).font = { name: "Manrope", size: 8, color: { argb: argb(pal.faint) } };
    sheet.mergeCells(`B${row}:${last}${row}`);
    sheet.getCell(`B${row}`).value = value;
    sheet.getCell(`B${row}`).font = { name: "Manrope", size: 9, bold: true, color: { argb: dark ? "FF171717" : ink } };
    row++;
  }
  if (meta.disclaimer) {
    sheet.mergeCells(`A${row}:${last}${row}`);
    sheet.getCell(`A${row}`).value = meta.disclaimer;
    sheet.getCell(`A${row}`).font = { name: "Manrope", size: 8, italic: true, color: { argb: argb(pal.muted) } };
    sheet.getCell(`A${row}`).alignment = { wrapText: true };
    sheet.getRow(row).height = 24;
    row++;
  }
  row++;

  // En-tête du tableau.
  const headerRow = row;
  const header = sheet.getRow(headerRow);
  header.values = columns.map((c) => c.header);
  header.height = 22;
  header.eachCell((cell, i) => {
    cell.font = { name: "Manrope", size: 9, bold: true, color: { argb: dark ? argb(pal.ink) : ink } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(pal.surface) } };
    cell.alignment = { vertical: "middle", horizontal: columns[i - 1]?.align ?? "left", wrapText: true };
    cell.border = { bottom: { style: "medium", color: { argb: argb(pal.secondary) } } };
  });
  sheet.views = [{ state: "frozen", ySplit: headerRow, showGridLines: false }];
  sheet.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`;
  return { sheet, headerRow, firstRow: headerRow + 1, lastColumn: last };
}

/** Style d'une ligne de données selon son rôle (chapitre, poste, total). */
export function styleRow(row: ExcelJS.Row, columns: number, kind: "group" | "subgroup" | "item" | "total" | "subtotal", pal: Palette) {
  for (let c = 1; c <= columns; c++) {
    const cell = row.getCell(c);
    const strong = kind !== "item";
    cell.font = { name: "Manrope", size: 9, bold: strong, color: { argb: kind === "group" && c <= 2 ? argb(pal.theme === "sombre" ? "#A0411E" : pal.primary) : "FF171717" }, ...(cell.font?.size ? { size: cell.font.size } : {}) };
    if (kind === "group") cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8F4EE" } };
    if (kind === "total") cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1EADF" } };
    cell.border = kind === "total" ? { top: { style: "thin", color: { argb: "FF171717" } } } : { bottom: { style: "hair", color: { argb: "FFE3D9CC" } } };
    cell.alignment = { ...cell.alignment, vertical: "top" };
  }
}

/** Filtre automatique sur l'en-tête et les lignes de données. */
export function autoFilter(target: BrandedSheet, lastRow: number) {
  if (lastRow >= target.firstRow) target.sheet.autoFilter = { from: `A${target.headerRow}`, to: `${target.lastColumn}${lastRow}` };
}
