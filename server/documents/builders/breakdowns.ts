/**
 * Sous-détails de prix d'une DPGF : composants, quantités nette et brute, pertes appliquées une seule fois,
 * coûts, déboursés, frais, prix de revient et prix de vente.
 * Un coût inconnu n'est jamais présenté comme nul : un déboursé partiel est dit partiel, un sous-détail
 * sans décomposition possible est signalé comme tel, sans tableau vide ni total à zéro.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { AMOUNT_STATE_LABELS, DECOMPOSITION_IMPOSSIBLE_LABEL } from "../../../shared/amounts.js";
import { COMPONENT_CATEGORY_LABELS, type MarginMode, RATE_BASE_LABELS } from "../../../shared/enums.js";
import { type Database, schema } from "../../db/index.js";
import { type BreakdownRow, type ComponentRow, isUndecomposed, resultOf } from "../../services/breakdowns.js";
import type { BreakdownResult } from "../../services/pricing.js";
import { documentLevel, type DocumentLevelInfo } from "../../services/document-level.js";
import { type DocTheme, palette } from "../brand.js";
import { baseMeta, type ExportContext, exportContext, ExportNotFound, money, quantity } from "../context.js";
import type { Block, DocModel } from "../model.js";
import { brandedSheet, moneyFormat, newWorkbook, styleRow } from "../xlsx.js";

type Poste = { code: string | null; designation: string; unit: string | null; breakdown: BreakdownRow; components: ComponentRow[]; result: BreakdownResult | { error: string } };

export interface BreakdownsData {
  ctx: ExportContext;
  doc: typeof schema.dpgf.$inferSelect;
  postes: Poste[];
  withoutBreakdown: number;
  level: DocumentLevelInfo;
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
  return { ctx, doc, postes, withoutBreakdown: lines.length - postes.length, level: await documentLevel(db, { type: "sous_details", id: dpgfId }) };
}

function marginLabel(mode: MarginMode, rate: string | null): string {
  if (!rate) return "taux non saisi";
  if (mode === "coefficient") return `coefficient ${Number(rate)}`;
  return `${mode === "taux_de_marque" ? "taux de marque" : "taux de marge"} de ${Number(rate)} %`;
}

/** Ligne de résultat : libellé, montant exact (null si absent) et texte affiché quand il n'y a pas de montant. */
interface ResultRow {
  key: string;
  label: string;
  value: string | null;
  partial: boolean;
  absent: string | null;
}

/** Déboursés, frais et prix : jamais « 0,00 » pour un coût inconnu, un taux non saisi ou un total partiel. */
function resultRows(p: Poste): ResultRow[] {
  if ("error" in p.result) return [{ key: "erreur", label: `Calcul impossible : ${p.result.error}`, value: null, partial: false, absent: "" }];
  const b = p.breakdown;
  const r = p.result;
  const none = r.state === "non_renseigne";
  const partial = r.state === "partiel";
  const sum = (key: string, label: string, value: string): ResultRow => ({ key, label, value: none ? null : value, partial, absent: none ? "non chiffré" : null });
  const hasSiteCosts = p.components.some((c) => c.category === "frais_chantier");
  const rated = (key: string, label: string, value: string, missing: boolean): ResultRow =>
    missing ? { key, label, value: null, partial: false, absent: "taux non saisi" } : { key, label, value: none ? null : value, partial, absent: none ? "non chiffré" : null };
  return [
    { key: "etat", label: "Statut du coût", value: null, partial: false, absent: stateDetail(r) },
    sum("ds", "Déboursé sec", r.debourseSec),
    hasSiteCosts ? sum("fc", "Frais de chantier", r.fraisChantier) : { key: "fc", label: "Frais de chantier", value: null, partial: false, absent: "aucun composant" },
    sum("dt", "Déboursé total", r.debourseTotal),
    rated("fg", `Frais généraux${b.overheadRate ? `, ${Number(b.overheadRate)} % du ${RATE_BASE_LABELS[b.overheadBase].toLowerCase()}` : ""}`, r.overhead, r.ratesMissing.overhead),
    rated("al", `Aléas${b.contingencyRate ? `, ${Number(b.contingencyRate)} % du ${RATE_BASE_LABELS[b.contingencyBase].toLowerCase()}` : ""}`, r.contingency, r.ratesMissing.contingency),
    sum("pr", "Prix de revient", r.prixDeRevient),
    rated("marge", `Marge, ${marginLabel(b.marginMode, b.marginRate)}`, r.margin, r.ratesMissing.margin),
    { key: "pv", label: "Prix de vente unitaire HT", value: r.prixDeVente, partial: false, absent: r.prixDeVente === null ? "incomplet : composant à chiffrer" : null },
  ];
}

function stateDetail(r: BreakdownResult): string {
  const label = AMOUNT_STATE_LABELS[r.state];
  if (r.state === "partiel") return `${label} : ${r.priced} composant(s) chiffré(s) sur ${r.count}, montants non définitifs`;
  if (r.state === "non_renseigne") return `${label} : aucun composant chiffré`;
  if (r.state === "estimatif") return `${label} : consommations proposées, à confirmer`;
  return label;
}

function shown(row: ResultRow, currency: string): string {
  if (row.value === null) return row.absent ?? "";
  return row.partial ? `partiel, ${money(row.value, currency)}` : money(row.value, currency);
}

/** Pertes affichées : taux, et mention quand la consommation saisie les comprenait déjà. */
function lossText(c: ComponentRow): string {
  if (c.lossRate === null || Number(c.lossRate) === 0) return "";
  return c.lossMode === "incluse" ? `${Number(c.lossRate)} %\ncomprises` : `${Number(c.lossRate)} %`;
}

export function breakdownsModel(data: BreakdownsData): DocModel {
  const currency = data.doc.currency;
  const impossible = data.postes.filter((p) => isUndecomposed(p.breakdown, p.components)).length;
  const complete = data.postes.filter((p) => !("error" in p.result) && p.result.prixDeVente !== null).length;
  const counts = [
    `${data.postes.length} sous-détail(s)`,
    complete ? `${complete} entièrement chiffré(s)` : null,
    impossible ? `${impossible} à décomposition impossible` : null,
    data.withoutBreakdown ? `${data.withoutBreakdown} poste(s) sans sous-détail` : null,
  ].filter(Boolean);
  const blocks: Block[] = [
    {
      type: "callout",
      tone: data.withoutBreakdown || impossible || complete < data.postes.length ? "warning" : "info",
      title: counts.join(", "),
      content: [
        "Chaque coût unitaire vient d’un prix de la bibliothèque ou d’une saisie ; une consommation marquée « hypothèse » reste à confirmer. Les pertes sont appliquées une seule fois : quantité brute = quantité nette × (1 + pertes), ou consommation saisie lorsqu’elle les comprend déjà. Un déboursé partiel n’est pas un montant final. Calculs exacts au centime.",
      ],
    },
  ];
  for (const p of data.postes) {
    blocks.push({ type: "heading", level: 2, number: p.code, text: `${p.designation}, prix pour 1 ${p.unit ?? "u"}` });
    if (isUndecomposed(p.breakdown, p.components)) {
      const missing = p.breakdown.missingCharacteristics;
      blocks.push({
        type: "callout",
        tone: "warning",
        title: DECOMPOSITION_IMPOSSIBLE_LABEL,
        content: [[p.breakdown.notes?.trim() || "Les caractéristiques de l’ouvrage ne permettent pas d’établir une décomposition pertinente.", missing.length ? `Caractéristiques à confirmer : ${missing.join(", ")}.` : null].filter(Boolean).join(" ")],
      });
      continue;
    }
    const figures = "error" in p.result ? null : p.result.figures;
    blocks.push({
      type: "table",
      dense: true,
      columns: [
        { label: "Catégorie", width: 12 },
        { label: "Composant", width: "*" },
        { label: "Unité", width: 6, align: "center" },
        { label: "Quantité nette", width: 9, align: "right" },
        { label: "Pertes", width: 8, align: "right" },
        { label: "Quantité brute", width: 9, align: "right" },
        { label: "Coût unitaire", width: 11, align: "right" },
        { label: "Montant pour 1 unité", width: 12, align: "right" },
      ],
      rows: p.components.map((c, i) => ({
        cells: [
          COMPONENT_CATEGORY_LABELS[c.category],
          [c.designation, [c.isHypothesis ? "Hypothèse" : null, c.sourceNote].filter(Boolean).join(". ")].filter(Boolean).join("\n"),
          c.unit,
          { text: figures ? quantity(figures[i]!.netQuantity) : quantity(c.quantity), align: "right" },
          { text: lossText(c), align: "right" },
          { text: figures ? quantity(figures[i]!.grossQuantity) : "", align: "right" },
          { text: c.unitCost !== null ? money(c.unitCost, currency) : "à chiffrer", align: "right", tone: c.unitCost === null ? "primary" : undefined },
          { text: figures?.[i]?.amount ? money(figures[i]!.amount, currency) : "", align: "right" },
        ],
      })),
    });
    blocks.push({ type: "keyValues", rows: resultRows(p).map((r) => [r.label, shown(r, currency)]) });
  }
  return {
    meta: baseMeta(data.ctx, {
      kind: "sous_details",
      typeLabel: "Sous-détails de prix",
      shortLabel: "Sous-détails",
      title: `Sous-détails, ${data.doc.title}`,
      version: data.doc.currentVersion,
      status: data.level.label,
      toc: data.postes.length > 8,
      orientation: "landscape",
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
      { header: "Catégorie", width: 16 },
      { header: "Composant", width: 44 },
      { header: "Unité", width: 8, align: "center" },
      { header: "Consommation saisie", width: 13, align: "right" },
      { header: "Pertes", width: 9, align: "right" },
      { header: "Pertes comprises dans la consommation", width: 14, align: "center" },
      { header: "Quantité nette", width: 12, align: "right" },
      { header: "Quantité brute", width: 12, align: "right" },
      { header: "Coût unitaire", width: 15, align: "right" },
      { header: "Montant pour 1 unité", width: 16, align: "right" },
      { header: "Source", width: 46 },
    ],
  });
  const { sheet } = target;
  const COLS = 11;
  let r = target.firstRow;
  for (const p of data.postes) {
    sheet.mergeCells(`A${r}:K${r}`);
    sheet.getCell(`A${r}`).value = `${[p.code, p.designation].filter(Boolean).join(" ")}, prix pour 1 ${p.unit ?? "u"}`;
    styleRow(sheet.getRow(r), COLS, "group", pal);
    r++;
    if (isUndecomposed(p.breakdown, p.components)) {
      const missing = p.breakdown.missingCharacteristics;
      sheet.mergeCells(`A${r}:K${r}`);
      sheet.getCell(`A${r}`).value = [DECOMPOSITION_IMPOSSIBLE_LABEL, p.breakdown.notes?.trim() || null, missing.length ? `Caractéristiques à confirmer : ${missing.join(", ")}.` : null].filter(Boolean).join(". ");
      styleRow(sheet.getRow(r), COLS, "item", pal);
      sheet.getCell(`A${r}`).alignment = { wrapText: true, vertical: "top" };
      sheet.getCell(`A${r}`).font = { name: "Manrope", size: 9, italic: true, color: { argb: "FFA0411E" } };
      sheet.getRow(r).height = 30;
      r += 2;
      continue;
    }
    const first = r;
    p.components.forEach((c, i) => {
      const row = sheet.getRow(r);
      const figure = "error" in p.result ? null : p.result.figures[i]!;
      row.getCell(1).value = COMPONENT_CATEGORY_LABELS[c.category];
      row.getCell(2).value = c.designation;
      row.getCell(3).value = c.unit;
      row.getCell(4).value = Number(c.quantity);
      row.getCell(5).value = c.lossRate !== null ? Number(c.lossRate) / 100 : null;
      row.getCell(6).value = c.lossMode === "incluse" ? "oui" : "non";
      // Pertes appliquées une seule fois : consommation nette majorée, ou consommation qui les comprend déjà.
      row.getCell(7).value = { formula: `IF(F${r}="oui",D${r}/(1+N(E${r})),D${r})`, result: figure ? Number(figure.netQuantity) : Number(c.quantity) };
      row.getCell(8).value = { formula: `IF(F${r}="oui",D${r},D${r}*(1+N(E${r})))`, result: figure ? Number(figure.grossQuantity) : Number(c.quantity) };
      row.getCell(9).value = c.unitCost !== null ? Number(c.unitCost) : null;
      row.getCell(10).value = { formula: `IF(ISNUMBER(I${r}),H${r}*I${r},"")`, result: figure?.amount ? Number(figure.amount) : "" };
      row.getCell(11).value = [c.isHypothesis ? "Hypothèse" : null, c.sourceNote].filter(Boolean).join(". ");
      styleRow(row, COLS, "item", pal);
      for (const n of [4, 7, 8]) row.getCell(n).numFmt = "#,##0.000###";
      row.getCell(5).numFmt = "0.0%";
      row.getCell(9).numFmt = money$;
      row.getCell(10).numFmt = money$;
      row.getCell(2).alignment = { wrapText: true, vertical: "top" };
      row.getCell(11).alignment = { wrapText: true, vertical: "top" };
      r++;
    });
    const last = r - 1;
    const amounts = `J${first}:J${last}`;
    const categories = `A${first}:A${last}`;
    const count = last - first + 1;
    const rowOf: Record<string, number> = {};
    for (const line of resultRows(p)) {
      sheet.mergeCells(`A${r}:I${r}`);
      const labelCell = sheet.getCell(`A${r}`);
      const cell = sheet.getCell(`J${r}`);
      labelCell.alignment = { horizontal: "right" };
      // Déboursés recalculés par Excel à partir des composants, avec un libellé qui dit s'ils sont partiels ;
      // frais, marge et prix repris du calcul exact.
      if (line.key === "ds" || line.key === "fc" || line.key === "dt") {
        const known = line.key === "fc" ? `COUNTIFS(${categories},"Frais de chantier",${amounts},">=0")` : `COUNT(${amounts})`;
        const total = line.key === "fc" ? `COUNTIF(${categories},"Frais de chantier")` : String(count);
        labelCell.value = { formula: `IF(${total}=0,"${line.label} : aucun composant",IF(${known}=0,"${line.label} : non chiffré",IF(${known}<${total},"${line.label}, partiel","${line.label}")))`, result: line.value === null ? `${line.label} : ${line.absent}` : line.partial ? `${line.label}, partiel` : line.label };
        const formula =
          line.key === "ds"
            ? `SUMIFS(${amounts},${categories},"<>Frais de chantier")`
            : line.key === "fc"
              ? `SUMIFS(${amounts},${categories},"Frais de chantier")`
              : `N(J${rowOf.ds})+N(J${rowOf.fc})`;
        cell.value = { formula: `IF(${known}=0,"",${formula})`, result: line.value !== null ? Number(line.value) : "" };
      } else {
        labelCell.value = line.label;
        cell.value = line.value !== null ? Number(line.value) : (line.absent ?? "");
      }
      rowOf[line.key] = r;
      if (line.key === "etat") sheet.mergeCells(`J${r}:K${r}`);
      styleRow(sheet.getRow(r), COLS, line.key === "pv" ? "total" : "subtotal", pal);
      cell.numFmt = money$;
      if (line.key === "etat") cell.alignment = { wrapText: true, horizontal: "left", vertical: "top" };
      r++;
    }
    r++;
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
