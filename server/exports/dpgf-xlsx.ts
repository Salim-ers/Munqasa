/**
 * Export Excel de la DPGF : en-tête de l'affaire, lignes hiérarchiques, formules vivantes
 * (montant = quantité × prix unitaire arrondi au centime, sous-totaux par SOUS.TOTAL pour ne rien
 * compter deux fois, totaux HT, taxe et TTC), mise en page prête à imprimer.
 */
import ExcelJS from "exceljs";
import type { DocumentIdentity } from "../../shared/settings.js";
import type { DpgfTotals, LineRow } from "../services/dpgf.js";
import { orderTree } from "../services/dpgf.js";

export interface DpgfExportData {
  title: string;
  status: string;
  version: number;
  currency: string;
  vatRate: string | null;
  project: { reference: string; name: string };
  client: string | null;
  lot: string | null;
  company: string | null;
  identity: DocumentIdentity;
  lines: LineRow[];
  totals: DpgfTotals;
  date: Date;
}

const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;

export async function dpgfToXlsx(data: DpgfExportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = data.company ?? "Talab Solutions";
  workbook.created = data.date;
  const sheet = workbook.addWorksheet("DPGF", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
    headerFooter: { oddFooter: `&L${data.identity.footerText}&C${data.title}&RPage &P sur &N` },
  });
  const money = `#,##0.00 "${data.currency}"`;
  const primary = argb(data.identity.primaryColor);
  sheet.columns = [
    { key: "code", width: 10 },
    { key: "designation", width: 58 },
    { key: "unit", width: 8 },
    { key: "quantity", width: 13 },
    { key: "price", width: 16 },
    { key: "amount", width: 18 },
    { key: "cctp", width: 11 },
    { key: "source", width: 34 },
  ];

  // En-tête de l'affaire.
  sheet.mergeCells("A1:H1");
  sheet.getCell("A1").value = data.title;
  sheet.getCell("A1").font = { size: 16, bold: true, color: { argb: primary } };
  const info: Array<[string, string | null]> = [
    ["Affaire", `${data.project.reference}, ${data.project.name}`],
    ["Maître d’ouvrage", data.client],
    ["Lot", data.lot],
    ["Version", `${data.version}, du ${data.date.toLocaleDateString("fr-FR")}${data.status === "valide" ? "" : ", document de travail"}`],
    ["Établi par", data.company],
  ];
  let row = 2;
  for (const [label, value] of info) {
    if (!value) continue;
    sheet.getCell(`A${row}`).value = label;
    sheet.getCell(`A${row}`).font = { color: { argb: "FF7A7A7A" } };
    sheet.mergeCells(`B${row}:H${row}`);
    sheet.getCell(`B${row}`).value = value;
    row++;
  }
  row++;
  const headerRow = row;
  sheet.getRow(headerRow).values = ["N°", "Désignation", "Unité", "Quantité", "Prix unitaire", "Montant", "CCTP", "Source de la quantité"];
  sheet.getRow(headerRow).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: primary } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  sheet.getRow(headerRow).height = 22;
  sheet.views = [{ state: "frozen", ySplit: headerRow }];

  // Lignes : parcours en profondeur ; chaque sous-total couvre la plage de ses descendants.
  const ordered = orderTree(data.lines);
  const first = headerRow + 1;
  const rowOf = new Map<string, number>();
  ordered.forEach(({ line }, i) => rowOf.set(line.id, first + i));
  const lastDescendantRow = (index: number) => {
    const depth = ordered[index]!.depth;
    let end = index;
    while (end + 1 < ordered.length && ordered[end + 1]!.depth > depth) end++;
    return first + end;
  };
  ordered.forEach(({ line, depth, code }, index) => {
    const r = first + index;
    const excelRow = sheet.getRow(r);
    excelRow.getCell(1).value = code;
    excelRow.getCell(2).value = line.description ? `${line.designation}\n${line.description}` : line.designation;
    excelRow.getCell(2).alignment = { wrapText: true, vertical: "top", indent: Math.min(depth, 3) };
    excelRow.getCell(7).value = line.cctpRef ?? "";
    if (line.kind === "poste") {
      excelRow.getCell(3).value = line.unit ?? "";
      excelRow.getCell(4).value = line.quantity !== null ? Number(line.quantity) : null;
      excelRow.getCell(5).value = line.unitPrice !== null ? Number(line.unitPrice) : null;
      excelRow.getCell(6).value = { formula: `IF(AND(ISNUMBER(D${r}),ISNUMBER(E${r})),ROUND(D${r}*E${r},2),"")`, result: line.amount !== null ? Number(line.amount) : "" };
      excelRow.getCell(8).value = line.quantitySource ?? "";
      excelRow.getCell(4).numFmt = "#,##0.000";
      excelRow.getCell(5).numFmt = money;
      excelRow.getCell(6).numFmt = money;
      excelRow.getCell(8).font = { size: 9, color: { argb: "FF7A7A7A" } };
    } else {
      const end = lastDescendantRow(index);
      const subtotal = data.totals.subtotals[line.id];
      excelRow.getCell(6).value = end > r ? { formula: `SUBTOTAL(9,F${r + 1}:F${end})`, result: subtotal ? Number(subtotal) : 0 } : null;
      excelRow.getCell(6).numFmt = money;
      excelRow.eachCell({ includeEmpty: true }, (cell, col) => {
        if (col > 8) return;
        cell.font = { bold: true, color: { argb: line.kind === "chapitre" ? primary : "FF171717" } };
        if (line.kind === "chapitre") cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F3EE" } };
      });
    }
    excelRow.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > 8) return;
      cell.border = { bottom: { style: "hair", color: { argb: "FFD9D4CC" } } };
      if (col !== 2) cell.alignment = { ...cell.alignment, vertical: "top" };
    });
  });

  // Totaux.
  const last = first + ordered.length - 1;
  let t = last + 2;
  const totalRow = (label: string, formula: string, result: number | null, strong = false) => {
    sheet.mergeCells(`A${t}:E${t}`);
    sheet.getCell(`A${t}`).value = label;
    sheet.getCell(`A${t}`).alignment = { horizontal: "right" };
    sheet.getCell(`A${t}`).font = { bold: strong };
    sheet.getCell(`F${t}`).value = { formula, result: result ?? 0 };
    sheet.getCell(`F${t}`).numFmt = money;
    sheet.getCell(`F${t}`).font = { bold: true, color: { argb: strong ? primary : "FF171717" } };
    t++;
  };
  const htRow = t;
  totalRow("Total hors taxes", ordered.length ? `SUBTOTAL(9,F${first}:F${last})` : "0", Number(data.totals.totalHt), true);
  if (data.vatRate !== null) {
    const vatRow = t;
    totalRow(`Taxe sur la valeur ajoutée (${data.vatRate.replace(".", ",")} %)`, `ROUND(F${htRow}*${data.vatRate}/100,2)`, data.totals.vat !== null ? Number(data.totals.vat) : null);
    totalRow("Total toutes taxes comprises", `F${htRow}+F${vatRow}`, data.totals.totalTtc !== null ? Number(data.totals.totalTtc) : null, true);
  }
  sheet.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
