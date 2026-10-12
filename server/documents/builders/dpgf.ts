/**
 * DPGF et documents tirés des mêmes lignes : bordereau des prix unitaires (BPU), détail quantitatif
 * estimatif (DQE) et estimation des travaux. Une seule lecture de la base alimente le PDF, le Word et
 * l'Excel de chacun ; dans Excel, montants, sous-totaux, taxe et totaux sont de vraies formules.
 */
import { asc, eq } from "drizzle-orm";
import type ExcelJS from "exceljs";
import { type Database, schema } from "../../db/index.js";
import { documentLevel, type DocumentLevelInfo, dpgfReserves, levelFrom } from "../../services/document-level.js";
import { computeTotals, type DpgfTotals, type LineRow, orderTree, type TotalState } from "../../services/dpgf.js";
import { type DocTheme, palette, type Palette } from "../brand.js";
import { baseMeta, type ExportContext, exportContext, ExportNotFound, money, percentLabel, quantity } from "../context.js";
import type { Block, DocMeta, DocModel, Row } from "../model.js";
import { amountInWords } from "../words.js";
import { autoFilter, brandedSheet, columnLetter, moneyFormat, newWorkbook, QTY_FORMAT, styleRow } from "../xlsx.js";

export interface DpgfData {
  ctx: ExportContext;
  doc: typeof schema.dpgf.$inferSelect;
  ordered: Array<{ line: LineRow; depth: number; code: string }>;
  totals: DpgfTotals;
  coverage: { postes: number; priced: number; withoutQuantity: number; withoutPrice: number };
  /** Version figée rendue (sinon l'état courant). */
  version: { number: number; date: Date; validated: boolean } | null;
  /** Statut imprimé : calculé sur les données, jamais « validé » d'office. */
  level: DocumentLevelInfo;
}

export async function loadDpgf(db: Database, id: string): Promise<DpgfData> {
  const [doc] = await db.select().from(schema.dpgf).where(eq(schema.dpgf.id, id));
  if (!doc) throw new ExportNotFound("DPGF introuvable.");
  const lines = await db.select().from(schema.dpgfLine).where(eq(schema.dpgfLine.dpgfId, id)).orderBy(asc(schema.dpgfLine.position));
  return dpgfFrom(db, doc, lines);
}

/** DPGF à partir de son document et de ses lignes (base ou instantané d'une version figée). */
export async function dpgfFrom(db: Database, doc: typeof schema.dpgf.$inferSelect, rawLines: LineRow[], version?: { number: number; date: Date; validated: boolean }): Promise<DpgfData> {
  // Les instantanés JSON portent des dates en texte : elles redeviennent des dates pour l'ordre des lignes.
  const lines = rawLines.map((l) => ({ ...l, createdAt: new Date(l.createdAt), updatedAt: new Date(l.updatedAt) }));
  const ctx = await exportContext(db, doc.projectId, doc.lotId);
  const ordered = orderTree(lines);
  const postes = lines.filter((l) => l.kind === "poste");
  return {
    ctx,
    doc: version ? { ...doc, currentVersion: version.number } : doc,
    version: version ?? null,
    ordered,
    totals: computeTotals(lines, doc.vatRate),
    coverage: {
      postes: postes.length,
      priced: postes.filter((l) => l.amount !== null).length,
      withoutQuantity: postes.filter((l) => l.quantity === null).length,
      withoutPrice: postes.filter((l) => l.unitPrice === null).length,
    },
    // Version figée : réserves tirées de ses propres lignes ; validée par l'utilisateur, elle reste « prête pour revue ».
    level: version ? levelFrom(dpgfReserves(postes, { prices: true }), { draft: false, validated: version.validated, professional: false }) : await documentLevel(db, { type: "dpgf", id: doc.id }),
  };
}

/** Mention d'une version figée, sous le titre. */
function versionNote(data: DpgfData): string | null {
  if (!data.version) return null;
  return `Version ${data.version.number} enregistrée le ${data.version.date.toLocaleDateString("fr-FR")}${data.version.validated ? ", validée par l’utilisateur" : ""}.`;
}

/** Montant d'un sous-total, suivi de « partiel » quand une partie de ses postes n'est pas chiffrée. */
function subtotalText(data: DpgfData, id: string, currency: string): string {
  const state: TotalState | undefined = data.totals.subtotalStates[id];
  const value = data.totals.subtotals[id] ?? null;
  if (!state || state === "non_renseigne" || value === null) return "";
  return state === "partiel" ? `${money(value, currency)}\npartiel` : money(value, currency);
}

const designation = (line: LineRow) => (line.description ? `${line.designation}\n${line.description}` : line.designation);

function coverageBlock(data: DpgfData): Block | null {
  const c = data.coverage;
  if (c.postes === 0) return { type: "callout", tone: "info", title: "Document vide", content: ["Aucun poste n’est encore défini."] };
  const missing: string[] = [];
  if (c.withoutQuantity) missing.push(`${c.withoutQuantity} poste(s) sans quantité justifiée`);
  if (c.withoutPrice) missing.push(`${c.withoutPrice} poste(s) sans prix unitaire`);
  if (!missing.length) return { type: "callout", tone: "success", title: "Tous les postes sont quantifiés et chiffrés", content: [`${c.postes} poste(s). Les prix restent à vérifier avant tout usage contractuel.`] };
  return {
    type: "callout",
    tone: "warning",
    title: "Points à compléter",
    content: [`${missing.join(" ; ")}. Leurs montants ne sont pas comptés dans les totaux ; aucune quantité ni aucun prix n’a été supposé.`],
  };
}

/** Libellé d'un total selon sa complétude : un total partiel le dit, un total sans poste chiffré n'a pas de montant. */
export function totalLabel(base: string, state: TotalState, unpriced: number): string {
  if (state === "partiel") return `${base}, partiel : ${unpriced} poste(s) non chiffré(s) exclu(s)`;
  return base;
}

function totalsRows(data: DpgfData, cols: number, amountCol: number): Row[] {
  const currency = data.doc.currency;
  const { state } = data.totals;
  const unpriced = data.coverage.postes - data.coverage.priced;
  const row = (label: string, value: string | null, kind: Row["kind"]): Row => ({
    kind,
    cells: [
      { text: totalLabel(label, state, unpriced), colSpan: amountCol, align: "right" },
      { text: state === "non_renseigne" ? "non chiffré" : money(value, currency), align: "right", tone: state === "non_renseigne" ? "primary" : undefined },
      ...Array.from({ length: cols - amountCol - 1 }, () => ""),
    ],
  });
  const rows = [row("Total hors taxes", data.totals.totalHt, "total")];
  if (data.doc.vatRate !== null) {
    rows.push(row(`Taxe sur la valeur ajoutée (${percentLabel(data.doc.vatRate)})`, data.totals.vat, "subtotal"));
    rows.push(row("Total toutes taxes comprises", data.totals.totalTtc, "total"));
  }
  return rows;
}

/* ---------- DPGF ---------- */

export function dpgfModel(data: DpgfData): DocModel {
  const currency = data.doc.currency;
  const rows: Row[] = data.ordered.map(({ line, code }) => {
    if (line.kind !== "poste") {
      return {
        kind: line.kind === "chapitre" ? "group" : "subgroup",
        cells: [code, line.designation, "", "", "", { text: subtotalText(data, line.id, currency), align: "right" }, line.cctpRef ?? ""],
      };
    }
    const sources = [line.quantitySource ? `Quantité : ${line.quantitySource}` : null, line.priceSource ? `Prix : ${line.priceSource}` : null].filter(Boolean).join(". ");
    return {
      kind: "item",
      cells: [
        code,
        [designation(line), sources].filter(Boolean).join("\n"),
        line.unit ?? "",
        { text: line.quantity !== null ? quantity(line.quantity) : "à métrer", align: "right", tone: line.quantity === null ? "primary" : undefined },
        { text: line.unitPrice !== null ? money(line.unitPrice, currency) : "à chiffrer", align: "right", tone: line.unitPrice === null ? "primary" : undefined },
        { text: money(line.amount, currency), align: "right" },
        line.cctpRef ?? "",
      ],
    };
  });
  const coverage = coverageBlock(data);
  return {
    meta: baseMeta(data.ctx, {
      kind: "dpgf",
      typeLabel: "Décomposition du prix global et forfaitaire",
      shortLabel: "DPGF",
      title: data.doc.title,
      version: data.doc.currentVersion,
      status: data.level.label,
      toc: false,
      date: data.version?.date,
      disclaimer: versionNote(data),
    }),
    blocks: [
      ...(coverage ? [coverage] : []),
      {
        type: "table",
        columns: [
          { label: "N°", width: 8 },
          { label: "Désignation", width: "*" },
          { label: "Unité", width: 7, align: "center" },
          { label: "Quantité", width: 10, align: "right" },
          { label: "Prix unitaire", width: 14, align: "right" },
          { label: "Montant", width: 15, align: "right" },
          { label: "CCTP", width: 7, align: "center" },
        ],
        rows: [...rows, ...totalsRows(data, 7, 5)],
      },
    ],
  };
}

/** Feuille DPGF : formules identiques au modèle historique (montant, SOUS.TOTAL, taxe, total). */
function writeDpgfSheet(workbook: ExcelJS.Workbook, data: DpgfData, pal: Palette, meta: DocMeta) {
  const money$ = moneyFormat(data.doc.currency);
  const target = brandedSheet(workbook, "DPGF", {
    meta,
    pal,
    columns: [
      { header: "N°", width: 10 },
      { header: "Désignation", width: 58 },
      { header: "Unité", width: 8, align: "center" },
      { header: "Quantité", width: 13, align: "right" },
      { header: "Prix unitaire", width: 16, align: "right" },
      { header: "Montant", width: 18, align: "right" },
      { header: "CCTP", width: 11, align: "center" },
      { header: "Source de la quantité", width: 34 },
    ],
  });
  const { sheet, firstRow: first } = target;
  const ordered = data.ordered;
  const lastDescendantRow = (index: number) => {
    const depth = ordered[index]!.depth;
    let end = index;
    while (end + 1 < ordered.length && ordered[end + 1]!.depth > depth) end++;
    return first + end;
  };
  const subtotalRows: Record<string, number> = {};
  ordered.forEach(({ line, depth, code }, index) => {
    const r = first + index;
    const row = sheet.getRow(r);
    row.getCell(1).value = code;
    row.getCell(2).value = designation(line);
    row.getCell(2).alignment = { wrapText: true, vertical: "top", indent: Math.min(depth, 3) };
    row.getCell(7).value = line.cctpRef ?? "";
    if (line.kind === "poste") {
      row.getCell(3).value = line.unit ?? "";
      row.getCell(4).value = line.quantity !== null ? Number(line.quantity) : null;
      row.getCell(5).value = line.unitPrice !== null ? Number(line.unitPrice) : null;
      row.getCell(6).value = { formula: `IF(AND(ISNUMBER(D${r}),ISNUMBER(E${r})),ROUND(D${r}*E${r},2),"")`, result: line.amount !== null ? Number(line.amount) : "" };
      row.getCell(8).value = line.quantitySource ?? "";
      styleRow(row, 8, "item", pal);
      row.getCell(4).numFmt = QTY_FORMAT;
      row.getCell(5).numFmt = money$;
      row.getCell(6).numFmt = money$;
      row.getCell(8).font = { name: "Manrope", size: 8, color: { argb: "FF7A7A7A" } };
    } else {
      const end = lastDescendantRow(index);
      const subtotal = data.totals.subtotals[line.id];
      // Sous-total vide tant qu'aucun poste n'est chiffré : jamais « 0,00 » pour des prix inconnus.
      row.getCell(6).value = end > r ? { formula: `IF(COUNT(F${r + 1}:F${end})=0,"",SUBTOTAL(9,F${r + 1}:F${end}))`, result: subtotal ? Number(subtotal) : "" } : null;
      styleRow(row, 8, line.kind === "chapitre" ? "group" : "subgroup", pal);
      row.getCell(6).numFmt = money$;
      if (line.kind === "chapitre") subtotalRows[line.id] = r;
    }
    row.getCell(2).alignment = { wrapText: true, vertical: "top", indent: Math.min(depth, 3) };
  });
  const last = first + ordered.length - 1;
  autoFilter(target, last);
  const totals = writeTotals(sheet, data, pal, { first, last, amount: "F", units: "C", width: 8 }, last + 2);
  return { sheet, subtotalRows, ...totals };
}

/**
 * Totaux d'une feuille de postes : libellés et montants recalculés par Excel. Un total qui exclut des postes
 * non chiffrés dit qu'il est partiel ; sans aucun poste chiffré, il reste vide (jamais « 0,00 »).
 */
function writeTotals(sheet: ExcelJS.Worksheet, data: DpgfData, pal: Palette, cols: { first: number; last: number; amount: string; units: string; width: number }, start: number) {
  const money$ = moneyFormat(data.doc.currency);
  const { first, last, amount: A, units: U } = cols;
  const amounts = `${A}${first}:${A}${last}`;
  // Postes : lignes portant une unité ; montants : cellules numériques.
  const postes = `COUNTIFS(${U}${first}:${U}${last},"?*")`;
  const priced = `COUNT(${amounts})`;
  const unpriced = data.coverage.postes - data.coverage.priced;
  const merge = `${String.fromCharCode(A.charCodeAt(0) - 1)}`;
  let t = start;
  const totalRow = (label: string, formula: string, result: number | null, strong = false) => {
    sheet.mergeCells(`A${t}:${merge}${t}`);
    sheet.getCell(`A${t}`).value = {
      formula: `IF(${priced}=0,"${label} : aucun poste chiffré",IF(${priced}<${postes},"${label}, partiel : "&(${postes}-${priced})&" poste(s) non chiffré(s) exclu(s)","${label}"))`,
      result: data.totals.state === "non_renseigne" ? `${label} : aucun poste chiffré` : totalLabel(label, data.totals.state, unpriced),
    };
    sheet.getCell(`A${t}`).alignment = { horizontal: "right" };
    sheet.getCell(`${A}${t}`).value = { formula: `IF(${priced}=0,"",${formula})`, result: data.totals.state === "non_renseigne" || result === null ? "" : result };
    styleRow(sheet.getRow(t), cols.width, strong ? "total" : "subtotal", pal);
    sheet.getCell(`${A}${t}`).numFmt = money$;
    t++;
    return t - 1;
  };
  const htRow = totalRow("Total hors taxes", data.ordered.length ? `SUBTOTAL(9,${amounts})` : "0", Number(data.totals.totalHt), true);
  let ttcRow: number | null = null;
  let vatRow: number | null = null;
  if (data.doc.vatRate !== null) {
    vatRow = totalRow(`Taxe sur la valeur ajoutée (${percentLabel(data.doc.vatRate)})`, `ROUND(${A}${htRow}*${data.doc.vatRate}/100,2)`, data.totals.vat !== null ? Number(data.totals.vat) : null);
    ttcRow = totalRow("Total toutes taxes comprises", `${A}${htRow}+${A}${vatRow}`, data.totals.totalTtc !== null ? Number(data.totals.totalTtc) : null, true);
  }
  return { htRow, vatRow, ttcRow };
}

/** Feuille de synthèse : montant de chaque chapitre repris de la feuille DPGF par formule. */
function writeSummarySheet(workbook: ExcelJS.Workbook, data: DpgfData, pal: Palette, meta: DocMeta, links: { subtotalRows: Record<string, number>; htRow: number; vatRow: number | null; ttcRow: number | null }) {
  const money$ = moneyFormat(data.doc.currency);
  const target = brandedSheet(workbook, "Synthèse", {
    meta,
    pal,
    columns: [
      { header: "N°", width: 8 },
      { header: "Chapitre", width: 52 },
      { header: "Montant hors taxes", width: 20, align: "right" },
      { header: "Part", width: 10, align: "right" },
      { header: "Postes", width: 9, align: "right" },
      { header: "Chiffrés", width: 10, align: "right" },
    ],
  });
  const { sheet, firstRow } = target;
  const chapters = data.ordered.filter((o) => o.depth === 0 && o.line.kind !== "poste");
  let r = firstRow;
  const totalRow = firstRow + chapters.length + 1;
  for (const chapter of chapters) {
    const descendants = collectPostes(data, chapter.line.id);
    const row = sheet.getRow(r);
    row.getCell(1).value = chapter.code;
    row.getCell(2).value = chapter.line.designation;
    const sourceRow = links.subtotalRows[chapter.line.id];
    const subtotal = data.totals.subtotals[chapter.line.id];
    row.getCell(3).value = sourceRow ? { formula: `'DPGF'!F${sourceRow}`, result: subtotal ? Number(subtotal) : "" } : "";
    row.getCell(4).value = { formula: `IF(N(C${totalRow})=0,"",N(C${r})/C${totalRow})`, result: "" };
    row.getCell(5).value = descendants.length;
    row.getCell(6).value = descendants.filter((l) => l.amount !== null).length;
    styleRow(row, 6, "item", pal);
    row.getCell(3).numFmt = money$;
    row.getCell(4).numFmt = "0.0%";
    r++;
  }
  sheet.mergeCells(`A${totalRow}:B${totalRow}`);
  // Libellé et montant repris de la feuille DPGF : partiel ou vide comme elle.
  sheet.getCell(`A${totalRow}`).value = { formula: `'DPGF'!A${links.htRow}`, result: data.totals.state === "non_renseigne" ? "Total hors taxes : aucun poste chiffré" : totalLabel("Total hors taxes", data.totals.state, data.coverage.postes - data.coverage.priced) };
  sheet.getCell(`A${totalRow}`).alignment = { horizontal: "right" };
  sheet.getCell(`C${totalRow}`).value = { formula: `'DPGF'!F${links.htRow}`, result: data.totals.state === "non_renseigne" ? "" : Number(data.totals.totalHt) };
  sheet.getCell(`E${totalRow}`).value = { formula: chapters.length ? `SUM(E${firstRow}:E${totalRow - 2})` : "0", result: data.coverage.postes };
  sheet.getCell(`F${totalRow}`).value = { formula: chapters.length ? `SUM(F${firstRow}:F${totalRow - 2})` : "0", result: data.coverage.priced };
  styleRow(sheet.getRow(totalRow), 6, "total", pal);
  sheet.getCell(`C${totalRow}`).numFmt = money$;
  if (links.vatRow && links.ttcRow) {
    for (const [offset, label, source] of [
      [1, `Taxe sur la valeur ajoutée (${percentLabel(data.doc.vatRate!)})`, links.vatRow],
      [2, "Total toutes taxes comprises", links.ttcRow],
    ] as const) {
      const rr = totalRow + offset;
      sheet.mergeCells(`A${rr}:B${rr}`);
      sheet.getCell(`A${rr}`).value = { formula: `'DPGF'!A${source}`, result: label };
      sheet.getCell(`A${rr}`).alignment = { horizontal: "right" };
      const value = offset === 1 ? data.totals.vat : data.totals.totalTtc;
      sheet.getCell(`C${rr}`).value = { formula: `'DPGF'!F${source}`, result: data.totals.state === "non_renseigne" || value === null ? "" : Number(value) };
      styleRow(sheet.getRow(rr), 6, offset === 2 ? "total" : "subtotal", pal);
      sheet.getCell(`C${rr}`).numFmt = money$;
    }
  }
}

function collectPostes(data: DpgfData, chapterId: string): LineRow[] {
  const index = data.ordered.findIndex((o) => o.line.id === chapterId);
  if (index < 0) return [];
  const depth = data.ordered[index]!.depth;
  const out: LineRow[] = [];
  for (let i = index + 1; i < data.ordered.length && data.ordered[i]!.depth > depth; i++) if (data.ordered[i]!.line.kind === "poste") out.push(data.ordered[i]!.line);
  return out;
}

export async function dpgfWorkbook(data: DpgfData, theme: DocTheme): Promise<Buffer> {
  const pal = palette(theme, data.ctx.identity);
  const meta = dpgfModel(data).meta;
  const workbook = newWorkbook(meta);
  const links = writeDpgfSheet(workbook, data, pal, meta);
  writeSummarySheet(workbook, data, pal, meta, links);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/* ---------- BPU : bordereau des prix unitaires ---------- */

export function bpuModel(data: DpgfData): DocModel {
  const currency = data.doc.currency;
  const priced = data.coverage.postes - data.coverage.withoutPrice;
  const rows: Row[] = data.ordered.map(({ line, code }) =>
    line.kind !== "poste"
      ? { kind: line.kind === "chapitre" ? "group" : "subgroup", cells: [code, line.designation, "", "", ""] }
      : {
          kind: "item",
          cells: [
            code,
            designation(line),
            line.unit ?? "",
            { text: line.unitPrice !== null ? money(line.unitPrice, currency) : "", align: "right" },
            { text: line.unitPrice !== null ? amountInWords(line.unitPrice, currency) : "", tone: "muted" },
          ],
        },
  );
  return {
    meta: baseMeta(data.ctx, {
      kind: "bpu",
      typeLabel: "Bordereau des prix unitaires",
      shortLabel: "BPU",
      title: data.doc.title.replace(/^DPGF/i, "BPU"),
      version: data.doc.currentVersion,
      status: data.level.label,
      toc: false,
      disclaimer: priced
        ? "Prix unitaires hors taxes de pré-estimation, repris de la DPGF ; les cases vides restent à compléter. Ils ne constituent ni une offre ni un engagement de prix."
        : "Bordereau à compléter : aucun prix unitaire n’est encore renseigné.",
    }),
    blocks: [
      {
        type: "table",
        columns: [
          { label: "N° de prix", width: 9 },
          { label: "Désignation des ouvrages", width: "*" },
          { label: "Unité", width: 7, align: "center" },
          { label: "Prix unitaire HT en chiffres", width: 15, align: "right" },
          { label: "Prix unitaire HT en lettres", width: 27 },
        ],
        rows,
      },
    ],
  };
}

export async function bpuWorkbook(data: DpgfData, theme: DocTheme): Promise<Buffer> {
  const pal = palette(theme, data.ctx.identity);
  const meta = bpuModel(data).meta;
  const workbook = newWorkbook(meta);
  const target = brandedSheet(workbook, "BPU", {
    meta,
    pal,
    columns: [
      { header: "N° de prix", width: 10 },
      { header: "Désignation des ouvrages", width: 58 },
      { header: "Unité", width: 8, align: "center" },
      { header: "Prix unitaire HT en chiffres", width: 18, align: "right" },
      { header: "Prix unitaire HT en lettres", width: 46 },
    ],
  });
  const { sheet, firstRow } = target;
  data.ordered.forEach(({ line, depth, code }, i) => {
    const row = sheet.getRow(firstRow + i);
    row.getCell(1).value = code;
    row.getCell(2).value = line.kind === "poste" ? designation(line) : line.designation;
    if (line.kind === "poste") {
      row.getCell(3).value = line.unit ?? "";
      row.getCell(4).value = line.unitPrice !== null ? Number(line.unitPrice) : null;
      row.getCell(5).value = line.unitPrice !== null ? amountInWords(line.unitPrice, data.doc.currency) : "";
      styleRow(row, 5, "item", pal);
      row.getCell(4).numFmt = moneyFormat(data.doc.currency);
      row.getCell(5).alignment = { wrapText: true, vertical: "top" };
    } else styleRow(row, 5, line.kind === "chapitre" ? "group" : "subgroup", pal);
    row.getCell(2).alignment = { wrapText: true, vertical: "top", indent: Math.min(depth, 3) };
  });
  autoFilter(target, firstRow + data.ordered.length - 1);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/* ---------- DQE : détail quantitatif estimatif ---------- */

export function dqeModel(data: DpgfData): DocModel {
  const currency = data.doc.currency;
  const rows: Row[] = data.ordered.map(({ line, code }) =>
    line.kind !== "poste"
      ? { kind: line.kind === "chapitre" ? "group" : "subgroup", cells: [code, line.designation, "", "", "", { text: subtotalText(data, line.id, currency), align: "right" }] }
      : {
          kind: "item",
          cells: [
            code,
            designation(line),
            line.unit ?? "",
            { text: line.quantity !== null ? quantity(line.quantity) : "à métrer", align: "right", tone: line.quantity === null ? "primary" : undefined },
            { text: line.unitPrice !== null ? money(line.unitPrice, currency) : "à chiffrer", align: "right", tone: line.unitPrice === null ? "primary" : undefined },
            { text: money(line.amount, currency), align: "right" },
          ],
        },
  );
  const coverage = coverageBlock(data);
  return {
    meta: baseMeta(data.ctx, {
      kind: "dqe",
      typeLabel: "Détail quantitatif estimatif",
      shortLabel: "DQE",
      title: data.doc.title.replace(/^DPGF/i, "DQE"),
      version: data.doc.currentVersion,
      status: data.level.label,
      toc: false,
    }),
    blocks: [
      ...(coverage ? [coverage] : []),
      {
        type: "table",
        columns: [
          { label: "N°", width: 8 },
          { label: "Désignation", width: "*" },
          { label: "Unité", width: 7, align: "center" },
          { label: "Quantité", width: 11, align: "right" },
          { label: "Prix unitaire HT", width: 15, align: "right" },
          { label: "Montant HT", width: 16, align: "right" },
        ],
        rows: [...rows, ...totalsRows(data, 6, 5)],
      },
    ],
  };
}

export async function dqeWorkbook(data: DpgfData, theme: DocTheme): Promise<Buffer> {
  const pal = palette(theme, data.ctx.identity);
  const meta = dqeModel(data).meta;
  const workbook = newWorkbook(meta);
  const money$ = moneyFormat(data.doc.currency);
  const target = brandedSheet(workbook, "DQE", {
    meta,
    pal,
    columns: [
      { header: "N°", width: 10 },
      { header: "Désignation", width: 58 },
      { header: "Unité", width: 8, align: "center" },
      { header: "Quantité", width: 13, align: "right" },
      { header: "Prix unitaire HT", width: 16, align: "right" },
      { header: "Montant HT", width: 18, align: "right" },
    ],
  });
  const { sheet, firstRow: first } = target;
  data.ordered.forEach(({ line, depth, code }, i) => {
    const r = first + i;
    const row = sheet.getRow(r);
    row.getCell(1).value = code;
    row.getCell(2).value = line.kind === "poste" ? designation(line) : line.designation;
    if (line.kind === "poste") {
      row.getCell(3).value = line.unit ?? "";
      row.getCell(4).value = line.quantity !== null ? Number(line.quantity) : null;
      row.getCell(5).value = line.unitPrice !== null ? Number(line.unitPrice) : null;
      row.getCell(6).value = { formula: `IF(AND(ISNUMBER(D${r}),ISNUMBER(E${r})),ROUND(D${r}*E${r},2),"")`, result: line.amount !== null ? Number(line.amount) : "" };
      styleRow(row, 6, "item", pal);
      row.getCell(4).numFmt = QTY_FORMAT;
      row.getCell(5).numFmt = money$;
      row.getCell(6).numFmt = money$;
    } else {
      const depthHere = depth;
      let end = i;
      while (end + 1 < data.ordered.length && data.ordered[end + 1]!.depth > depthHere) end++;
      const subtotal = data.totals.subtotals[line.id];
      row.getCell(6).value = end > i ? { formula: `IF(COUNT(F${r + 1}:F${first + end})=0,"",SUBTOTAL(9,F${r + 1}:F${first + end}))`, result: subtotal ? Number(subtotal) : "" } : null;
      styleRow(row, 6, line.kind === "chapitre" ? "group" : "subgroup", pal);
      row.getCell(6).numFmt = money$;
    }
    row.getCell(2).alignment = { wrapText: true, vertical: "top", indent: Math.min(depth, 3) };
  });
  const last = first + data.ordered.length - 1;
  autoFilter(target, last);
  writeTotals(sheet, data, pal, { first, last, amount: "F", units: "C", width: 6 }, last + 2);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/* ---------- Estimation des travaux ---------- */

export function estimationModel(data: DpgfData): DocModel {
  const currency = data.doc.currency;
  const c = data.coverage;
  const chapters = data.ordered.filter((o) => o.depth === 0 && o.line.kind !== "poste");
  const total = Number(data.totals.totalHt);
  const unpriced = data.ordered.filter((o) => o.line.kind === "poste" && o.line.amount === null);
  const none = data.totals.state === "non_renseigne";
  const partial = data.totals.state === "partiel";
  const shownTotal = (value: string | null) => (none ? "non chiffré" : partial ? `partiel, ${money(value, currency)}` : money(value, currency));
  const blocks: Block[] = [
    {
      type: "keyValues",
      rows: [
        ["Postes", String(c.postes)],
        ["Postes chiffrés", `${c.priced} sur ${c.postes}`],
        ["Postes sans quantité justifiée", String(c.withoutQuantity)],
        ["Postes sans prix unitaire", String(c.withoutPrice)],
        ["Total hors taxes des postes chiffrés", shownTotal(data.totals.totalHt)],
        ...(data.doc.vatRate !== null ? ([["Total toutes taxes comprises des postes chiffrés", shownTotal(data.totals.totalTtc)]] as Array<[string, string]>) : []),
        ["Statut de l’estimation", none ? "non renseignée : aucun poste chiffré" : partial ? "partielle : le total n’est pas un montant final" : "tous les postes sont chiffrés"],
      ],
    },
    {
      type: "heading",
      level: 2,
      text: "Montants par chapitre",
    },
    {
      type: "table",
      columns: [
        { label: "N°", width: 8 },
        { label: "Chapitre", width: "*" },
        { label: "Postes", width: 9, align: "right" },
        { label: "Chiffrés", width: 9, align: "right" },
        { label: "Montant HT", width: 18, align: "right" },
        { label: "Part", width: 9, align: "right" },
      ],
      rows: [
        ...chapters.map(({ line, code }) => {
          const postes = collectPostes(data, line.id);
          const amount = Number(data.totals.subtotals[line.id] ?? 0);
          const text = subtotalText(data, line.id, currency) || "non chiffré";
          return {
            kind: "item" as const,
            cells: [
              code,
              line.designation,
              { text: String(postes.length), align: "right" as const },
              { text: String(postes.filter((p) => p.amount !== null).length), align: "right" as const },
              { text, align: "right" as const, tone: data.totals.subtotals[line.id] ? undefined : ("primary" as const) },
              { text: total && amount ? percentLabel(((amount / total) * 100).toFixed(1)) : "", align: "right" as const },
            ],
          };
        }),
        ...totalsRows(data, 6, 4).map((r) => ({ ...r, cells: [...r.cells.slice(0, 2), ""] })),
      ],
    },
  ];
  if (unpriced.length) {
    blocks.push({ type: "heading", level: 2, text: "Postes non chiffrés" });
    blocks.push({ type: "paragraph", tone: "muted", content: ["Ces postes ne sont pas comptés dans les totaux : leur quantité ou leur prix unitaire reste à établir."] });
    blocks.push({
      type: "table",
      dense: true,
      columns: [
        { label: "N°", width: 8 },
        { label: "Désignation", width: "*" },
        { label: "Unité", width: 7, align: "center" },
        { label: "Manque", width: 22 },
      ],
      rows: unpriced.map(({ line, code }) => ({
        cells: [code, line.designation, line.unit ?? "", [line.quantity === null ? "quantité" : null, line.unitPrice === null ? "prix unitaire" : null].filter(Boolean).join(" et ")],
      })),
    });
  }
  return {
    meta: baseMeta(data.ctx, {
      kind: "estimation",
      typeLabel: "Estimation des travaux",
      shortLabel: "Estimation",
      title: data.doc.title.replace(/^DPGF/i, "Estimation"),
      version: data.doc.currentVersion,
      status: data.level.label,
      toc: false,
      disclaimer: `Estimation établie à partir des quantités justifiées et des prix disponibles : ${c.priced} poste(s) chiffré(s) sur ${c.postes}. Elle ne constitue ni une offre ni un engagement de prix.`,
    }),
    blocks,
  };
}

export async function estimationWorkbook(data: DpgfData, theme: DocTheme): Promise<Buffer> {
  const pal = palette(theme, data.ctx.identity);
  const meta = estimationModel(data).meta;
  const workbook = newWorkbook(meta);
  // Le classeur d'estimation embarque la DPGF complète : la synthèse la reprend par formules.
  const links = writeDpgfSheet(workbook, data, pal, meta);
  writeSummarySheet(workbook, data, pal, meta, links);
  workbook.views = [{ x: 0, y: 0, width: 10000, height: 20000, firstSheet: 0, activeTab: 1, visibility: "visible" }];
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export { columnLetter };
