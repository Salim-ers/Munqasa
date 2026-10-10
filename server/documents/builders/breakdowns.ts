/** Sous-détails de prix d'une DPGF : composants, coûts, déboursés, frais, prix de revient et prix de vente. */
import { and, asc, eq, inArray } from "drizzle-orm";
import { COMPONENT_CATEGORY_LABELS, type MarginMode, RATE_BASE_LABELS } from "../../../shared/enums.js";
import { type Database, schema } from "../../db/index.js";
import { type BreakdownRow, type ComponentRow, resultOf } from "../../services/breakdowns.js";
import type { BreakdownResult } from "../../services/pricing.js";
import { type DocTheme, palette } from "../brand.js";
import { baseMeta, COVER_STATUS, type ExportContext, exportContext, ExportNotFound, money, quantity } from "../context.js";
import type { Block, DocModel } from "../model.js";
import { brandedSheet, moneyFormat, newWorkbook, styleRow } from "../xlsx.js";

export interface BreakdownsData {
  ctx: ExportContext;
  doc: typeof schema.dpgf.$inferSelect;
  postes: Array<{ code: string | null; designation: string; unit: string | null; breakdown: BreakdownRow; components: ComponentRow[]; result: BreakdownResult | { error: string } }>;
  withoutBreakdown: number;
}

export async function loadBreakdowns(db: Database, dpgfId: string): Promise<BreakdownsData> {
  const [doc] = await db.select().from(schema.dpgf).where(eq(schema.dpgf.id, dpgfId));
  if (!doc) throw new ExportNotFound("DPGF introuvable.");
  const ctx = await exportContext(db, doc.projectId, doc.lotId);
  const lines = await db
    .select()
    .from(schema.dpgfLine)
    .where(and(eq(schema.dpgfLine.dpgfId, dpgfId), eq(schema.dpgfLine.kind, "poste")))
    .orderBy(asc(schema.dpgfLine.position));
  const breakdowns = lines.length ? await db.select().from(schema.priceBreakdown).where(inArray(schema.priceBreakdown.dpgfLineId, lines.map((l) => l.id))) : [];
  const components = breakdowns.length
    ? await db.select().from(schema.priceBreakdownComponent).where(inArray(schema.priceBreakdownComponent.breakdownId, breakdowns.map((b) => b.id))).orderBy(asc(schema.priceBreakdownComponent.position))
    : [];
  const postes = lines.flatMap((line) => {
    const b = breakdowns.find((x) => x.dpgfLineId === line.id);
    if (!b) return [];
    const own = components.filter((c) => c.breakdownId === b.id);
    return [{ code: line.code, designation: line.designation, unit: line.unit, breakdown: b, components: own, result: resultOf(b, own) }];
  });
  return { ctx, doc, postes, withoutBreakdown: lines.length - postes.length };
}

function marginLabel(mode: MarginMode, rate: string | null): string {
  if (!rate) return "taux non saisi";
  if (mode === "coefficient") return `coefficient ${Number(rate)}`;
  return `${mode === "taux_de_marque" ? "taux de marque" : "taux de marge"} de ${Number(rate)} %`;
}

/** Lignes de résultat : libellé et valeur décimale (null si incomplète). */
function resultRows(p: BreakdownsData["postes"][number]): Array<{ label: string; value: string | null; key: string }> {
  if ("error" in p.result) return [{ label: `Calcul impossible : ${p.result.error}`, value: null, key: "erreur" }];
  const b = p.breakdown;
  const r = p.result;
  return [
    { key: "ds", label: "Déboursé sec", value: r.debourseSec },
    { key: "fc", label: "Frais de chantier", value: r.fraisChantier },
    { key: "dt", label: "Déboursé total", value: r.debourseTotal },
    { key: "fg", label: `Frais généraux, ${b.overheadRate ? `${Number(b.overheadRate)} % du ${RATE_BASE_LABELS[b.overheadBase].toLowerCase()}` : "taux non saisi"}`, value: r.overhead },
    { key: "al", label: `Aléas, ${b.contingencyRate ? `${Number(b.contingencyRate)} % du ${RATE_BASE_LABELS[b.contingencyBase].toLowerCase()}` : "taux non saisi"}`, value: r.contingency },
    { key: "pr", label: "Prix de revient", value: r.prixDeRevient },
    { key: "marge", label: `Marge, ${marginLabel(b.marginMode, b.marginRate)}`, value: r.margin },
    { key: "pv", label: "Prix de vente unitaire HT", value: r.prixDeVente },
  ];
}

function resultLines(p: BreakdownsData["postes"][number], currency: string): Array<[string, string]> {
  return resultRows(p).map((r) => [r.label, r.value !== null ? money(r.value, currency) : r.key === "pv" ? "incomplet : composant à chiffrer" : ""]);
}

export function breakdownsModel(data: BreakdownsData): DocModel {
  const currency = data.doc.currency;
  const blocks: Block[] = [
    {
      type: "callout",
      tone: data.withoutBreakdown ? "warning" : "info",
      title: `${data.postes.length} sous-détail(s)${data.withoutBreakdown ? `, ${data.withoutBreakdown} poste(s) sans sous-détail` : ""}`,
      content: ["Chaque coût unitaire vient d’un prix de la bibliothèque ou d’une saisie ; une consommation marquée « hypothèse » reste à confirmer. Calculs exacts au centime."],
    },
  ];
  for (const p of data.postes) {
    blocks.push({ type: "heading", level: 2, number: p.code, text: `${p.designation}, prix pour 1 ${p.unit ?? "u"}` });
    blocks.push({
      type: "table",
      dense: true,
      columns: [
        { label: "Catégorie", width: 13 },
        { label: "Composant", width: "*" },
        { label: "Unité", width: 7, align: "center" },
        { label: "Consommation", width: 11, align: "right" },
        { label: "Coût unitaire", width: 12, align: "right" },
        { label: "Pertes", width: 7, align: "right" },
        { label: "Coût pour 1 unité", width: 13, align: "right" },
      ],
      rows: p.components.map((c, i) => ({
        cells: [
          COMPONENT_CATEGORY_LABELS[c.category],
          [c.designation, [c.isHypothesis ? "Hypothèse" : null, c.sourceNote].filter(Boolean).join(". ")].filter(Boolean).join("\n"),
          c.unit,
          { text: quantity(c.quantity), align: "right" },
          { text: c.unitCost !== null ? money(c.unitCost, currency) : "à chiffrer", align: "right", tone: c.unitCost === null ? "primary" : undefined },
          { text: c.lossRate !== null ? `${Number(c.lossRate)} %` : "", align: "right" },
          { text: "error" in p.result ? "" : money(p.result.componentTotals[i] ?? null, currency), align: "right" },
        ],
      })),
    });
    blocks.push({ type: "keyValues", rows: resultLines(p, currency) });
  }
  return {
    meta: baseMeta(data.ctx, {
      kind: "sous_details",
      typeLabel: "Sous-détails de prix",
      shortLabel: "Sous-détails",
      title: `Sous-détails, ${data.doc.title}`,
      version: data.doc.currentVersion,
      status: COVER_STATUS[data.doc.status],
      toc: data.postes.length > 8,
      disclaimer: "Prix de pré-estimation calculés à partir de la bibliothèque de prix ; ils ne constituent ni une offre ni un engagement.",
    }),
    blocks,
  };
}

export async function breakdownsWorkbook(data: BreakdownsData, theme: DocTheme): Promise<Buffer> {
  const pal = palette(theme, data.ctx.identity);
  const model = breakdownsModel(data);
  const workbook = newWorkbook(model.meta);
  const money$ = moneyFormat(data.doc.currency);
  const target = brandedSheet(workbook, "Sous-détails", {
    meta: model.meta,
    pal,
    landscape: true,
    columns: [
      { header: "Catégorie", width: 18 },
      { header: "Composant", width: 50 },
      { header: "Unité", width: 9, align: "center" },
      { header: "Consommation", width: 13, align: "right" },
      { header: "Coût unitaire", width: 16, align: "right" },
      { header: "Pertes", width: 9, align: "right" },
      { header: "Coût pour 1 unité", width: 18, align: "right" },
      { header: "Source", width: 50 },
    ],
  });
  const { sheet } = target;
  let r = target.firstRow;
  for (const p of data.postes) {
    sheet.mergeCells(`A${r}:H${r}`);
    sheet.getCell(`A${r}`).value = `${[p.code, p.designation].filter(Boolean).join(" ")}, prix pour 1 ${p.unit ?? "u"}`;
    styleRow(sheet.getRow(r), 8, "group", pal);
    r++;
    const first = r;
    p.components.forEach((c) => {
      const row = sheet.getRow(r);
      row.getCell(1).value = COMPONENT_CATEGORY_LABELS[c.category];
      row.getCell(2).value = c.designation;
      row.getCell(3).value = c.unit;
      row.getCell(4).value = Number(c.quantity);
      row.getCell(5).value = c.unitCost !== null ? Number(c.unitCost) : null;
      row.getCell(6).value = c.lossRate !== null ? Number(c.lossRate) / 100 : null;
      // Coût = consommation × coût unitaire × (1 + pertes), recalculé par Excel.
      row.getCell(7).value = { formula: `IF(ISNUMBER(E${r}),D${r}*E${r}*(1+IF(ISNUMBER(F${r}),F${r},0)),"")`, result: "error" in p.result ? "" : Number(p.result.componentTotals[p.components.indexOf(c)] ?? 0) };
      row.getCell(8).value = [c.isHypothesis ? "Hypothèse" : null, c.sourceNote].filter(Boolean).join(". ");
      styleRow(row, 8, "item", pal);
      row.getCell(4).numFmt = "#,##0.000###";
      row.getCell(5).numFmt = money$;
      row.getCell(6).numFmt = "0.0%";
      row.getCell(7).numFmt = money$;
      row.getCell(8).alignment = { wrapText: true, vertical: "top" };
      r++;
    });
    const last = r - 1;
    const rowOf: Record<string, number> = {};
    for (const line of resultRows(p)) {
      sheet.mergeCells(`A${r}:F${r}`);
      sheet.getCell(`A${r}`).value = line.label;
      sheet.getCell(`A${r}`).alignment = { horizontal: "right" };
      const cell = sheet.getCell(`G${r}`);
      const range = p.components.length ? `G${first}:G${last}` : null;
      // Déboursés recalculés par Excel à partir des composants ; frais, marge et prix repris du calcul exact.
      if (line.key === "ds" && range) cell.value = { formula: `SUMIFS(${range},A${first}:A${last},"<>Frais de chantier")`, result: Number(line.value ?? 0) };
      else if (line.key === "fc" && range) cell.value = { formula: `SUMIFS(${range},A${first}:A${last},"Frais de chantier")`, result: Number(line.value ?? 0) };
      else if (line.key === "dt" && rowOf.ds && rowOf.fc) cell.value = { formula: `G${rowOf.ds}+G${rowOf.fc}`, result: Number(line.value ?? 0) };
      else cell.value = line.value !== null ? Number(line.value) : line.key === "pv" ? "incomplet" : null;
      rowOf[line.key] = r;
      styleRow(sheet.getRow(r), 8, line.key === "pv" ? "total" : "subtotal", pal);
      cell.numFmt = money$;
      r++;
    }
    r++;
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
