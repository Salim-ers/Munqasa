/**
 * Note de métrés : chaque ouvrage, chacune de ses mesures avec sa formule, ses valeurs, sa planche et son
 * statut ; la quantité retenue additionne les mesures non rejetées de même unité (règle de la DPGF). Dans
 * Excel, chaque quantité est une vraie formule écrite avec ses valeurs, et chaque total une somme.
 */
import { asc, eq, inArray } from "drizzle-orm";
import { MEASURE_METHOD_LABELS, MEASURE_SOURCE_LABELS, VALIDATION_STATUS_LABELS } from "../../../shared/enums.js";
import { formulaToExcel } from "../../../shared/formula.js";
import { type Database, schema } from "../../db/index.js";
import { Dec } from "../../services/decimal.js";
import { sameUnit } from "../../services/units.js";
import { type DocTheme, palette } from "../brand.js";
import { baseMeta, type ExportContext, exportContext, quantity } from "../context.js";
import type { Block, DocModel, Row } from "../model.js";
import { autoFilter, brandedSheet, newWorkbook, QTY_FORMAT, styleRow } from "../xlsx.js";

type WorkItem = typeof schema.workItem.$inferSelect;
type Measurement = typeof schema.measurement.$inferSelect;

export interface MetreData {
  ctx: ExportContext;
  items: Array<{ item: WorkItem; measures: Measurement[]; retained: string | null }>;
  sheets: Map<string, string>;
  counts: { items: number; measures: number; verified: number; toVerify: number; rejected: number };
}

export async function loadMetre(db: Database, projectId: string, lotId: string | null = null): Promise<MetreData> {
  const ctx = await exportContext(db, projectId, lotId);
  const items = (await db.select().from(schema.workItem).where(eq(schema.workItem.projectId, projectId)).orderBy(asc(schema.workItem.code), asc(schema.workItem.createdAt))).filter((i) => !lotId || i.lotId === lotId);
  const measures = await db.select().from(schema.measurement).where(eq(schema.measurement.projectId, projectId)).orderBy(asc(schema.measurement.createdAt));
  const drawingIds = [...new Set(measures.map((m) => m.drawingId).filter((v): v is string => Boolean(v)))];
  const drawings = drawingIds.length ? await db.select().from(schema.drawing).where(inArray(schema.drawing.id, drawingIds)) : [];
  const fileIds = [...new Set(drawings.map((d) => d.sourceFileId))];
  const files = fileIds.length ? await db.select({ id: schema.sourceFile.id, name: schema.sourceFile.originalName }).from(schema.sourceFile).where(inArray(schema.sourceFile.id, fileIds)) : [];
  const sheets = new Map(
    drawings.map((d) => {
      const file = files.find((f) => f.id === d.sourceFileId)?.name;
      return [d.id, [d.sheetNumber, d.title, file ? `${file}, page ${d.pageNumber}` : `page ${d.pageNumber}`].filter(Boolean).join(", ")];
    }),
  );
  const grouped = items.map((item) => {
    const own = measures.filter((m) => m.workItemId === item.id);
    const counted = own.filter((m) => m.status !== "rejete" && m.quantity !== null && (!item.unit || sameUnit(m.unit, item.unit)));
    const retained = counted.length ? counted.reduce((sum, m) => sum.plus(m.quantity!), new Dec(0)).toDecimalPlaces(4).toFixed(4) : null;
    return { item, measures: own, retained };
  });
  const inScope = grouped.flatMap((g) => g.measures);
  return {
    ctx,
    items: grouped,
    sheets,
    counts: {
      items: grouped.length,
      measures: inScope.length,
      verified: inScope.filter((m) => m.status === "verifie").length,
      toVerify: inScope.filter((m) => m.status === "a_verifier").length,
      rejected: inScope.filter((m) => m.status === "rejete").length,
    },
  };
}

/** Valeurs d'une mesure, dans l'ordre où elles apparaissent dans la formule (la base ne garde pas l'ordre). */
const values = (m: Measurement) => {
  const formula = m.formula ?? "";
  const position = (name: string) => {
    const match = new RegExp(`(^|[^A-Za-z0-9_])${name}([^A-Za-z0-9_]|$)`).exec(formula);
    return match ? match.index : Number.MAX_SAFE_INTEGER;
  };
  return Object.entries(m.inputs ?? {})
    .sort(([a], [b]) => position(a) - position(b))
    .map(([k, v]) => `${k} = ${v}`)
    .join(" ; ");
};

function meta(data: MetreData) {
  return baseMeta(data.ctx, {
    kind: "metre",
    typeLabel: "Note de métrés",
    shortLabel: "Métrés",
    title: data.ctx.lot ? `Note de métrés, lot ${data.ctx.lot.code} ${data.ctx.lot.name}` : "Note de métrés",
    version: null,
    status: data.counts.toVerify ? "Mesures à vérifier" : data.counts.measures ? "Mesures vérifiées" : "Aucune mesure",
    toc: data.items.length > 6,
    disclaimer: "Quantités calculées par le serveur à partir des formules et des valeurs indiquées. Une mesure « à vérifier » reste une proposition ; une valeur absente n’est jamais comptée comme zéro.",
  });
}

export function metreModel(data: MetreData): DocModel {
  const c = data.counts;
  const blocks: Block[] = [
    {
      type: "callout",
      tone: c.toVerify ? "warning" : "info",
      title: `${c.items} ouvrage(s), ${c.measures} mesure(s)`,
      content: [`${c.verified} vérifiée(s), ${c.toVerify} à vérifier, ${c.rejected} rejetée(s). Les mesures rejetées ne sont pas comptées.`],
    },
    { type: "heading", level: 1, text: "Récapitulatif des quantités", pageBreakBefore: false },
    {
      type: "table",
      columns: [
        { label: "Code", width: 10 },
        { label: "Ouvrage", width: "*" },
        { label: "Unité", width: 8, align: "center" },
        { label: "Quantité retenue", width: 15, align: "right" },
        { label: "Mesures", width: 9, align: "right" },
        { label: "Vérifiées", width: 9, align: "right" },
      ],
      rows: data.items.map(({ item, measures, retained }) => ({
        cells: [
          item.code ?? "",
          item.designation,
          item.unit ?? "",
          { text: retained !== null ? quantity(retained) : "non quantifié", align: "right", tone: retained === null ? "primary" : undefined },
          { text: String(measures.length), align: "right" },
          { text: String(measures.filter((m) => m.status === "verifie").length), align: "right" },
        ],
      })),
    },
  ];
  for (const { item, measures, retained } of data.items) {
    blocks.push({ type: "heading", level: 2, number: item.code, text: item.designation });
    const facts: Array<[string, string]> = [
      ["Unité", item.unit ?? "non définie"],
      ["Quantité retenue", retained !== null ? `${quantity(retained)} ${item.unit ?? ""}`.trim() : "non quantifiable de manière fiable avec les données disponibles"],
    ];
    if (item.location) facts.push(["Localisation", item.location]);
    for (const a of item.attributes ?? []) facts.push([a.name, `${a.value} (${a.source})`]);
    blocks.push({ type: "keyValues", rows: facts });
    if (measures.length === 0) {
      blocks.push({ type: "paragraph", tone: "muted", content: ["Aucune mesure : l’ouvrage est conservé et signalé comme à quantifier."] });
      continue;
    }
    const rows: Row[] = measures.map((m) => ({
      cells: [
        [m.label, m.notes].filter(Boolean).join("\n"),
        [MEASURE_METHOD_LABELS[m.method], m.formula].filter(Boolean).join(" : "),
        values(m),
        { text: m.quantity !== null ? `${quantity(m.quantity)} ${m.unit}` : "non calculée", align: "right", tone: m.quantity === null ? "primary" : undefined },
        { text: VALIDATION_STATUS_LABELS[m.status], tone: m.status === "verifie" ? undefined : "primary" },
        [m.drawingId ? data.sheets.get(m.drawingId) : null, m.zoneRef, MEASURE_SOURCE_LABELS[m.source]].filter(Boolean).join("\n"),
      ],
    }));
    blocks.push({
      type: "table",
      dense: true,
      columns: [
        { label: "Mesure", width: 24 },
        { label: "Méthode et formule", width: 17 },
        { label: "Valeurs", width: "*" },
        { label: "Quantité", width: 12, align: "right" },
        { label: "Statut", width: 10 },
        { label: "Source", width: 18 },
      ],
      rows,
    });
  }
  return { meta: meta(data), blocks };
}

export async function metreWorkbook(data: MetreData, theme: DocTheme): Promise<Buffer> {
  const pal = palette(theme, data.ctx.identity);
  const m = meta(data);
  const workbook = newWorkbook(m);
  const target = brandedSheet(workbook, "Métré", {
    meta: m,
    pal,
    landscape: true,
    columns: [
      { header: "Ouvrage", width: 10 },
      { header: "Désignation et mesure", width: 46 },
      { header: "Méthode", width: 13 },
      { header: "Formule", width: 18 },
      { header: "Valeurs", width: 28 },
      { header: "Quantité", width: 13, align: "right" },
      { header: "Unité", width: 7, align: "center" },
      { header: "Statut", width: 11 },
      { header: "Planche", width: 26 },
      { header: "Sources et notes", width: 44 },
    ],
  });
  const { sheet, firstRow } = target;
  let r = firstRow;
  const totals: Array<{ code: string; designation: string; unit: string; row: number; count: number }> = [];
  for (const { item, measures, retained } of data.items) {
    const head = sheet.getRow(r);
    head.getCell(1).value = item.code ?? "";
    head.getCell(2).value = item.designation;
    head.getCell(7).value = item.unit ?? "";
    styleRow(head, 10, "group", pal);
    const totalRow = r + measures.length + 1;
    const start = r + 1;
    r++;
    for (const measure of measures) {
      const row = sheet.getRow(r);
      row.getCell(1).value = item.code ?? "";
      row.getCell(2).value = measure.label;
      row.getCell(3).value = MEASURE_METHOD_LABELS[measure.method];
      row.getCell(4).value = measure.formula ?? "";
      row.getCell(5).value = values(measure);
      const excel = measure.formula ? formulaToExcel(measure.formula, measure.inputs ?? {}) : null;
      row.getCell(6).value = excel
        ? { formula: `ROUND(${excel},4)`, result: measure.quantity !== null ? Number(measure.quantity) : 0 }
        : measure.quantity !== null
          ? Number(measure.quantity)
          : null;
      row.getCell(7).value = measure.unit;
      row.getCell(8).value = VALIDATION_STATUS_LABELS[measure.status];
      row.getCell(9).value = [measure.drawingId ? data.sheets.get(measure.drawingId) : null, measure.zoneRef].filter(Boolean).join(", ");
      row.getCell(10).value = [MEASURE_SOURCE_LABELS[measure.source], measure.notes].filter(Boolean).join("\n");
      styleRow(row, 10, "item", pal);
      row.getCell(6).numFmt = QTY_FORMAT;
      for (const c of [2, 5, 9, 10]) row.getCell(c).alignment = { wrapText: true, vertical: "top" };
      r++;
    }
    const total = sheet.getRow(totalRow);
    total.getCell(2).value = `Quantité retenue ${item.code ?? ""}`.trim();
    // Les mesures rejetées ne comptent pas ; une valeur absente n'est jamais un zéro.
    total.getCell(6).value = measures.length
      ? { formula: `IF(COUNTIFS(H${start}:H${totalRow - 1},"<>Rejeté",F${start}:F${totalRow - 1},"<>")=0,"",SUMIFS(F${start}:F${totalRow - 1},H${start}:H${totalRow - 1},"<>Rejeté"))`, result: retained !== null ? Number(retained) : "" }
      : "";
    total.getCell(7).value = item.unit ?? "";
    styleRow(total, 10, "subtotal", pal);
    total.getCell(6).numFmt = QTY_FORMAT;
    totals.push({ code: item.code ?? "", designation: item.designation, unit: item.unit ?? "", row: totalRow, count: measures.length });
    r = totalRow + 2;
  }
  autoFilter(target, r - 2);

  const summary = brandedSheet(workbook, "Récapitulatif", {
    meta: m,
    pal,
    columns: [
      { header: "Code", width: 10 },
      { header: "Ouvrage", width: 56 },
      { header: "Unité", width: 8, align: "center" },
      { header: "Quantité retenue", width: 18, align: "right" },
      { header: "Mesures", width: 10, align: "right" },
    ],
  });
  totals.forEach((t, i) => {
    const row = summary.sheet.getRow(summary.firstRow + i);
    row.getCell(1).value = t.code;
    row.getCell(2).value = t.designation;
    row.getCell(3).value = t.unit;
    row.getCell(4).value = { formula: `'Métré'!F${t.row}`, result: Number(data.items[i]?.retained ?? 0) };
    row.getCell(5).value = t.count;
    styleRow(row, 5, "item", pal);
    row.getCell(4).numFmt = QTY_FORMAT;
  });
  autoFilter(summary, summary.firstRow + totals.length - 1);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
