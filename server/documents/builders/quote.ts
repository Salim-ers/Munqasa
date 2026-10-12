/**
 * Devis : document commercial aux couleurs de Talab Solutions, en PDF, Word et Excel, contrôlé comme les
 * autres exports (mise en page, structure). Couverture : client, chantier, numéro, date, validité, statut.
 * Corps : émetteur et client, prestations par section avec sous-totaux, options à part, totaux (remise,
 * TVA par taux ou mention du régime, TTC, acompte), conditions, mentions légales, bon pour accord.
 * Une version envoyée se rend telle qu'elle était, depuis sa copie figée.
 */
import { and, eq } from "drizzle-orm";
import type ExcelJS from "exceljs";
import { QUOTE_STATUS_LABELS, type QuoteStatus, TAX_REGIME_LABELS } from "../../../shared/enums.js";
import type { DocumentIdentity } from "../../../shared/settings.js";
import { type Database, schema } from "../../db/index.js";
import { computeQuote, type QuoteTotals } from "../../services/quote-calc.js";
import { loadQuote, priceUncertainty, type QuoteLineRow, type QuoteRow, settingsOf } from "../../services/quotes.js";
import { readSetting } from "../../services/settings.js";
import { type DocTheme, palette, type Palette } from "../brand.js";
import { ExportNotFound, fileName, money, percentLabel, quantity } from "../context.js";
import type { Block, DocMeta, DocModel, Row } from "../model.js";
import type { ExportFormat, ExportResult } from "../registry.js";
import { checkedWorkbook, renderDocxChecked, renderPdfChecked } from "../render-checked.js";
import { brandedSheet, moneyFormat, newWorkbook, QTY_FORMAT, styleRow } from "../xlsx.js";

type CompanyLike = { legalName?: string | null; tradeName?: string | null; legalForm?: string | null; address?: string | null; city?: string | null; postalCode?: string | null; email?: string | null; phone?: string | null; website?: string | null; legalIds?: Record<string, string> | null; country?: string | null };
type ClientLike = { name?: string | null; legalForm?: string | null; address?: string | null; city?: string | null; contactName?: string | null; email?: string | null; phone?: string | null; legalIds?: Record<string, string> | null };

export interface QuoteDocData {
  quote: QuoteRow;
  lines: QuoteLineRow[];
  totals: QuoteTotals;
  issuer: CompanyLike | null;
  client: ClientLike | null;
  project: { reference: string; name: string } | null;
  lotLabels: string[];
  identity: DocumentIdentity;
  /** Version figée rendue, sinon l'état courant. */
  version: { number: number; label: string; date: Date } | null;
}

/** Mentions de TVA propres au régime : textes légaux exacts, jamais une exonération sans fondement. */
export function regimeMention(quote: Pick<QuoteRow, "taxRegime" | "taxExemptionBasis">): string | null {
  switch (quote.taxRegime) {
    case "autoliquidation":
      return "Autoliquidation : TVA due par le preneur assujetti, article 283, 2 nonies, du code général des impôts.";
    case "franchise":
      return "TVA non applicable, article 293 B du code général des impôts.";
    case "exoneration":
      return quote.taxExemptionBasis?.trim() ? `Exonération de TVA : ${quote.taxExemptionBasis.trim()}.` : "Exonération de TVA : fondement légal à préciser.";
    default:
      return null;
  }
}

/** Unité affichée : m2 et m3 écrits en exposant. */
const unitLabel = (unit: string | null) => (unit ?? "").replace(/^m2$/i, "m²").replace(/^m3$/i, "m³");

const dateFr = (iso: string | Date) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Lignes dans l'ordre du devis avec leur profondeur et leur numéro (1, 1.1, 1.2… ; options numérotées à part). */
export function orderedLines(lines: QuoteLineRow[]): Array<{ line: QuoteLineRow; depth: number; code: string }> {
  const byParent = new Map<string | null, QuoteLineRow[]>();
  for (const line of lines) {
    const key = line.parentId && lines.some((l) => l.id === line.parentId) ? line.parentId : null;
    byParent.set(key, [...(byParent.get(key) ?? []), line]);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.position - b.position);
  const out: Array<{ line: QuoteLineRow; depth: number; code: string }> = [];
  let option = 0;
  const walk = (parent: string | null, prefix: string, depth: number) => {
    let n = 0;
    for (const line of byParent.get(parent) ?? []) {
      if (line.kind === "option") {
        option++;
        out.push({ line, depth, code: `Option ${option}` });
        continue;
      }
      n++;
      const code = prefix ? `${prefix}.${n}` : String(n);
      out.push({ line, depth, code });
      if (line.kind === "section") walk(line.id, code, depth + 1);
    }
  };
  walk(null, "", 0);
  return out;
}

function issuerLines(c: CompanyLike | null): string[] {
  if (!c) return ["Entité émettrice à renseigner dans les paramètres"];
  const ids = Object.entries(c.legalIds ?? {}).map(([k, v]) => `${k.toUpperCase()} ${v}`);
  return [
    [c.legalName, c.legalForm].filter(Boolean).join(", "),
    c.tradeName && c.tradeName !== c.legalName ? c.tradeName : null,
    c.address,
    [c.postalCode, c.city].filter(Boolean).join(" ") || null,
    [c.phone, c.email].filter(Boolean).join(", ") || null,
    c.website ?? null,
    ids.length ? ids.join(", ") : null,
  ].filter((v): v is string => Boolean(v));
}

function clientLines(c: ClientLike | null): string[] {
  if (!c) return ["Client à renseigner"];
  const ids = Object.entries(c.legalIds ?? {}).map(([k, v]) => `${k.toUpperCase()} ${v}`);
  return [
    [c.name, c.legalForm].filter(Boolean).join(", "),
    c.address,
    c.city,
    c.contactName ? `À l’attention de ${c.contactName}` : null,
    [c.phone, c.email].filter(Boolean).join(", ") || null,
    ids.length ? ids.join(", ") : null,
  ].filter((v): v is string => Boolean(v));
}

/** Statut imprimé : un devis non encore prêt à envoyer est un document de travail. */
function printedStatus(quote: QuoteRow, totals: QuoteTotals): string {
  if (quote.status === "brouillon" || quote.status === "a_verifier") return `${QUOTE_STATUS_LABELS[quote.status]}, document de travail`;
  if (totals.state !== "complet") return `${QUOTE_STATUS_LABELS[quote.status]}, totaux partiels`;
  return QUOTE_STATUS_LABELS[quote.status as QuoteStatus];
}

export function quoteMeta(data: QuoteDocData): DocMeta {
  const { quote, totals } = data;
  const issue = quote.issueDate ?? new Date().toISOString().slice(0, 10);
  const validity = quote.validityDays ? `${quote.validityDays} jours, jusqu’au ${dateFr(addDays(issue, quote.validityDays))}` : null;
  const site = [quote.siteName, quote.siteAddress].filter(Boolean).join(", ") || null;
  const draft = quote.status === "brouillon" || quote.status === "a_verifier";
  return {
    kind: "devis",
    typeLabel: "Devis",
    shortLabel: "Devis",
    title: `Devis ${quote.number}`,
    project: { reference: data.project?.reference ?? quote.number, name: quote.title, location: quote.siteAddress ?? null, phase: "Proposition commerciale" },
    client: data.client?.name ?? null,
    lot: data.lotLabels.length === 1 ? data.lotLabels[0]! : null,
    version: data.version?.number ?? (quote.currentVersion || null),
    date: new Date(`${issue}T12:00:00Z`),
    status: printedStatus(quote, totals),
    company: data.issuer?.legalName ?? null,
    footerText: data.identity.footerText,
    orientation: "portrait",
    toc: false,
    disclaimer: draft || totals.state !== "complet" ? "Document de travail : prix et quantités à confirmer avant tout envoi." : null,
    coverRows: [
      ["Client", data.client?.name ?? ""],
      ["Chantier", site ?? ""],
      ["Référence de l’affaire", data.project?.reference ?? ""],
      ["Lots", data.lotLabels.join(", ")],
      ["Devis", `${quote.number}${data.version ? `, version ${data.version.number}` : quote.currentVersion ? `, version ${quote.currentVersion}` : ""}`],
      ["Date", dateFr(issue)],
      ["Validité", validity ?? ""],
      ["Statut", printedStatus(quote, totals)],
      ["Établi par", data.issuer?.legalName ?? ""],
    ],
  };
}

export function quoteModel(data: QuoteDocData): DocModel {
  const { quote, totals } = data;
  const currency = quote.currency;
  const meta = quoteMeta(data);
  const draft = quote.status === "brouillon" || quote.status === "a_verifier";
  const ordered = orderedLines(data.lines);
  const showVat = quote.taxRegime === "normal" && new Set(ordered.filter((o) => o.line.kind !== "section").map((o) => totals.lines[o.line.id]?.vatRate ?? "")).size > 1;
  const row = ({ line, code }: (typeof ordered)[number]): Row => {
    if (line.kind === "section") {
      const sub = totals.sections[line.id];
      return { kind: "group", cells: [code, line.designation, "", "", "", "", ...(showVat ? [""] : []), { text: sub && sub.count ? `${sub.complete ? "" : "partiel "}${money(sub.total, currency)}` : "", align: "right" }] };
    }
    const f = totals.lines[line.id]!;
    const notes = [line.description, draft && priceUncertainty(line) ? "Prix à confirmer" : null].filter(Boolean);
    return {
      kind: "item",
      cells: [
        code,
        [line.designation, ...notes].join("\n"),
        unitLabel(line.unit),
        { text: line.quantity !== null ? quantity(line.quantity) : "à préciser", align: "right", tone: line.quantity === null ? "primary" : undefined },
        { text: f.unitPrice !== null ? money(f.unitPrice, currency) : "à établir", align: "right", tone: f.unitPrice === null ? "primary" : undefined },
        { text: line.discountRate ? percentLabel(line.discountRate) : "", align: "right" },
        ...(showVat ? [{ text: f.vatRate ? percentLabel(f.vatRate) : "", align: "right" as const }] : []),
        { text: f.net !== null ? money(f.net, currency) : f.unitPrice === null ? "à établir" : "à préciser", align: "right", tone: f.net === null ? "primary" : undefined },
      ],
    };
  };
  const columns = [
    { label: "N°", width: 8 },
    { label: "Désignation", width: "*" as const },
    { label: "Unité", width: 7, align: "center" as const },
    { label: "Quantité", width: 10, align: "right" as const },
    { label: "Prix unitaire HT", width: 14, align: "right" as const },
    { label: "Remise", width: 8, align: "right" as const },
    ...(showVat ? [{ label: "TVA", width: 7, align: "right" as const }] : []),
    { label: "Montant HT", width: 15, align: "right" as const },
  ];
  const mainRows = ordered.filter((o) => o.line.kind !== "option").map(row);
  const optionRows = ordered.filter((o) => o.line.kind === "option").map(row);

  // Totaux : partiels tant qu'une ligne n'a pas de montant, jamais complétés par un zéro.
  const missing = totals.missing.prices + totals.missing.quantities;
  const totalsRows: Array<[string, string]> = [];
  const partial = totals.state !== "complet";
  if (Number(totals.globalDiscount) > 0) {
    totalsRows.push([partial ? `Total partiel des lignes HT, ${missing} ligne(s) à compléter` : "Total des lignes HT", money(totals.linesTotal, currency)]);
    totalsRows.push([`Remise globale de ${percentLabel(quote.discountRate!)}`, `− ${money(totals.globalDiscount, currency)}`]);
  }
  totalsRows.push([partial ? `Total partiel HT${missing ? `, ${missing} ligne(s) à compléter` : ""}` : "Total HT", totals.state === "non_renseigne" ? "à établir" : money(totals.totalHt, currency)]);
  const mention = regimeMention(quote);
  if (quote.taxRegime === "normal") {
    if (totals.totalVat !== null) for (const v of totals.vat) totalsRows.push([`TVA ${percentLabel(v.rate)} sur ${money(v.base, currency)}`, money(v.amount, currency)]);
    else totalsRows.push(["TVA", totals.missing.vatRates ? "taux à préciser" : "à établir"]);
  } else totalsRows.push([`TVA non facturée, ${TAX_REGIME_LABELS[quote.taxRegime].toLowerCase()}`, money("0", currency)]);
  totalsRows.push(["Total TTC", totals.totalTtc !== null ? money(totals.totalTtc, currency) : "à établir"]);
  if (totals.deposit !== null) totalsRows.push([quote.depositRate ? `Acompte à la commande, ${percentLabel(quote.depositRate)} du TTC` : "Acompte à la commande", money(totals.deposit, currency)]);

  const blocks: Block[] = [
    {
      type: "table",
      columns: [
        { label: "Émetteur", width: "*" },
        { label: "Client", width: "*" },
      ],
      rows: [{ kind: "item", cells: [issuerLines(data.issuer).join("\n"), clientLines(data.client).join("\n")] }],
    },
    {
      type: "keyValues",
      rows: [
        ["Objet", quote.title],
        ...(quote.siteName || quote.siteAddress ? ([["Chantier", [quote.siteName, quote.siteAddress].filter(Boolean).join(", ")]] as Array<[string, string]>) : []),
        ...(data.project ? ([["Référence de l’affaire", `${data.project.reference}, ${data.project.name}`]] as Array<[string, string]>) : []),
        ...(data.lotLabels.length ? ([["Lots", data.lotLabels.join(", ")]] as Array<[string, string]>) : []),
      ],
    },
    { type: "heading", level: 1, text: "Détail des prestations" },
    { type: "table", columns, rows: mainRows.length ? mainRows : [{ kind: "note", cells: [{ text: "Aucune ligne.", colSpan: columns.length }] }] },
  ];
  if (optionRows.length) {
    blocks.push({ type: "heading", level: 2, text: "Options, non comprises dans le total" });
    blocks.push({ type: "table", columns, rows: optionRows });
  }
  blocks.push({ type: "heading", level: 2, text: "Montant du devis" });
  blocks.push({
    type: "table",
    columns: [
      { label: "Récapitulatif", width: "*" },
      { label: `Montant, ${currency}`, width: 22, align: "right" },
    ],
    rows: totalsRows.map(([label, value]) => ({ kind: label.startsWith("Total TTC") ? "total" : "item", cells: [label, { text: value, align: "right" }] })),
  });
  const conditions: Array<[string, string]> = [];
  if (quote.paymentTerms) conditions.push(["Conditions de règlement", quote.paymentTerms]);
  if (totals.deposit !== null) conditions.push(["Acompte", `${money(totals.deposit, currency)} à la commande`]);
  if (quote.validityDays) conditions.push(["Validité de l’offre", `${quote.validityDays} jours à compter du ${dateFr(quote.issueDate ?? new Date().toISOString().slice(0, 10))}`]);
  if (conditions.length) {
    blocks.push({ type: "heading", level: 2, text: "Conditions" });
    blocks.push({ type: "keyValues", rows: conditions });
  }
  if (quote.notes) blocks.push({ type: "paragraph", content: [quote.notes] });
  const legal = [mention, quote.legalMentions].filter((v): v is string => Boolean(v?.trim()));
  if (legal.length) {
    blocks.push({ type: "heading", level: 2, text: "Mentions légales" });
    for (const text of legal) for (const paragraph of text.split(/\n{2,}/)) blocks.push({ type: "paragraph", content: [paragraph.trim()], tone: "small" });
  }
  blocks.push({ type: "heading", level: 2, text: "Bon pour accord" });
  blocks.push({
    type: "table",
    columns: [
      { label: "Pour l’entreprise", width: "*" },
      { label: "Pour le client", width: "*" },
    ],
    rows: [{ kind: "item", cells: [`${data.issuer?.legalName ?? "Entreprise"}\nDate et signature\n\n\n`, "Mention « Bon pour accord », date, nom, qualité et signature\n\n\n"] }],
  });
  return { meta, blocks };
}

/* ---------- Excel ---------- */

export async function quoteWorkbook(data: QuoteDocData, theme: DocTheme): Promise<Buffer> {
  const pal = palette(theme, data.identity);
  const meta = quoteMeta(data);
  const workbook = newWorkbook(meta);
  writeQuoteSheet(workbook, data, pal, meta);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Feuille du devis : montants, sous-totaux, remise, TVA par taux, TTC et acompte en formules, mêmes arrondis que le moteur. */
function writeQuoteSheet(workbook: ExcelJS.Workbook, data: QuoteDocData, pal: Palette, meta: DocMeta) {
  const { quote, totals } = data;
  const money$ = moneyFormat(quote.currency);
  const target = brandedSheet(workbook, "Devis", {
    meta,
    pal,
    columns: [
      { header: "N°", width: 10 },
      { header: "Désignation", width: 52 },
      { header: "Unité", width: 8, align: "center" },
      { header: "Quantité", width: 12, align: "right" },
      { header: "Prix unitaire HT", width: 16, align: "right" },
      { header: "Remise %", width: 10, align: "right" },
      { header: "Montant HT", width: 17, align: "right" },
      { header: "TVA %", width: 9, align: "right" },
      { header: "Provenance du prix", width: 38 },
      { header: "Provenance de la quantité", width: 34 },
    ],
    info: [
      ["Client", data.client?.name ?? null],
      ["Chantier", [quote.siteName, quote.siteAddress].filter(Boolean).join(", ") || null],
      ["Référence de l’affaire", data.project ? `${data.project.reference}, ${data.project.name}` : null],
      ["Statut", meta.status],
      ["Établi par", data.issuer?.legalName ?? null],
    ],
  });
  const { sheet, firstRow } = target;
  const ordered = orderedLines(data.lines).filter((o) => o.line.kind !== "option");
  const options = orderedLines(data.lines).filter((o) => o.line.kind === "option");
  let r = firstRow;
  const itemRows: number[] = [];
  const write = (entry: (typeof ordered)[number], rowNumber: number) => {
    const { line, code } = entry;
    const row = sheet.getRow(rowNumber);
    row.getCell(1).value = code;
    row.getCell(2).value = [line.designation, line.description].filter(Boolean).join("\n");
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
    if (line.kind === "section") {
      styleRow(row, 10, "group", pal);
      return;
    }
    const f = totals.lines[line.id]!;
    row.getCell(3).value = unitLabel(line.unit);
    row.getCell(4).value = line.quantity !== null ? Number(line.quantity) : null;
    row.getCell(5).value = f.unitPrice !== null ? Number(f.unitPrice) : null;
    row.getCell(6).value = line.discountRate !== null ? Number(line.discountRate) : null;
    row.getCell(7).value = { formula: `IF(OR(D${rowNumber}="",E${rowNumber}=""),"",ROUND(ROUND(D${rowNumber}*E${rowNumber},2)*(1-N(F${rowNumber})/100),2))`, result: f.net !== null ? Number(f.net) : "" };
    row.getCell(8).value = f.vatRate !== null ? Number(f.vatRate) : null;
    row.getCell(9).value = line.priceOrigin ?? (f.unitPrice === null ? "Prix à établir" : "");
    row.getCell(10).value = line.quantitySource ?? (line.quantity === null ? "Quantité à préciser" : "Saisie");
    styleRow(row, 10, "item", pal);
    row.getCell(4).numFmt = QTY_FORMAT;
    row.getCell(5).numFmt = money$;
    row.getCell(7).numFmt = money$;
  };
  // Sous-totaux de section : SOUS.TOTAL sur les lignes qui suivent jusqu'à la section suivante de même niveau.
  const sectionRows: Array<{ row: number; end: number; id: string }> = [];
  ordered.forEach((entry, index) => {
    write(entry, r);
    if (entry.line.kind === "section") {
      let end = index;
      while (end + 1 < ordered.length && ordered[end + 1]!.depth > entry.depth) end++;
      sectionRows.push({ row: r, end: firstRow + end, id: entry.line.id });
    } else itemRows.push(r);
    r++;
  });
  for (const { row, end, id } of sectionRows) {
    if (end > row) sheet.getCell(`G${row}`).value = { formula: `SUBTOTAL(9,G${row + 1}:G${end})`, result: Number(totals.sections[id]?.total ?? 0) };
    sheet.getCell(`G${row}`).numFmt = money$;
  }
  const lastItem = r - 1;
  r++;
  const label = (text: string, rowNumber: number) => {
    sheet.mergeCells(`A${rowNumber}:F${rowNumber}`);
    sheet.getCell(`A${rowNumber}`).value = text;
    sheet.getCell(`A${rowNumber}`).alignment = { horizontal: "right" };
  };
  const range = ordered.length ? `G${firstRow}:G${lastItem}` : null;
  const linesRow = r++;
  label(totals.state === "complet" ? "Total des lignes HT" : `Total partiel des lignes HT, ${totals.missing.prices + totals.missing.quantities} ligne(s) à compléter à l’export`, linesRow);
  sheet.getCell(`G${linesRow}`).value = { formula: range ? `IF(COUNT(${range})=0,"",SUBTOTAL(9,${range}))` : `""`, result: totals.state === "non_renseigne" ? "" : Number(totals.linesTotal) };
  const discountRow = r++;
  label(`Remise globale, ${quote.discountRate ? percentLabel(quote.discountRate) : "0 %"}`, discountRow);
  sheet.getCell(`G${discountRow}`).value = { formula: `IF(G${linesRow}="","",ROUND(G${linesRow}*${quote.discountRate ? Number(quote.discountRate) : 0}/100,2))`, result: totals.state === "non_renseigne" ? "" : Number(totals.globalDiscount) };
  const htRow = r++;
  label("Total HT", htRow);
  sheet.getCell(`G${htRow}`).value = { formula: `IF(G${linesRow}="","",G${linesRow}-G${discountRow})`, result: totals.state === "non_renseigne" ? "" : Number(totals.totalHt) };
  const vatRows: number[] = [];
  if (quote.taxRegime === "normal" && totals.vat.length && range) {
    // Remise globale répartie sur les bases de TVA au prorata ; le reste d'arrondi sur la plus forte base.
    const largest = [...totals.vat].sort((a, b) => Number(b.base) - Number(a.base) || Number(b.rate) - Number(a.rate))[0]!;
    const shareRows = new Map<string, number>();
    for (const v of totals.vat) shareRows.set(v.rate, r++);
    for (const v of totals.vat) {
      const sr = shareRows.get(v.rate)!;
      label(`Part de la remise sur la base à ${percentLabel(v.rate)}`, sr);
      const base = `SUMIF(H${firstRow}:H${lastItem},${Number(v.rate)},${range})`;
      const others = totals.vat.filter((o) => o.rate !== largest.rate).map((o) => `G${shareRows.get(o.rate)}`);
      sheet.getCell(`G${sr}`).value = v.rate === largest.rate ? { formula: `G${discountRow}${others.length ? `-(${others.join("+")})` : ""}`, result: "" } : { formula: `IF(G${linesRow}=0,0,ROUND(G${discountRow}*${base}/G${linesRow},2))`, result: "" };
    }
    for (const v of totals.vat) {
      const vr = r++;
      label(`TVA ${percentLabel(v.rate)}`, vr);
      sheet.getCell(`G${vr}`).value = { formula: `ROUND((SUMIF(H${firstRow}:H${lastItem},${Number(v.rate)},${range})-G${shareRows.get(v.rate)})*${Number(v.rate)}/100,2)`, result: Number(v.amount) };
      vatRows.push(vr);
    }
  } else if (quote.taxRegime !== "normal") {
    const vr = r++;
    label(regimeMention(quote) ?? "TVA non facturée", vr);
    sheet.getCell(`G${vr}`).value = 0;
    vatRows.push(vr);
  }
  const ttcRow = r++;
  label(totals.totalTtc !== null ? "Total TTC" : "Total TTC, à établir : prix, quantités ou taux de TVA manquants à l’export", ttcRow);
  sheet.getCell(`G${ttcRow}`).value = vatRows.length ? { formula: `IF(G${htRow}="","",G${htRow}+${vatRows.map((v) => `N(G${v})`).join("+")})`, result: totals.totalTtc !== null ? Number(totals.totalTtc) : "" } : "";
  let depositRow: number | null = null;
  if (quote.depositRate || quote.depositAmount) {
    depositRow = r++;
    label(quote.depositRate ? `Acompte, ${percentLabel(quote.depositRate)} du TTC` : "Acompte", depositRow);
    sheet.getCell(`G${depositRow}`).value = quote.depositRate ? { formula: `ROUND(G${ttcRow}*${Number(quote.depositRate)}/100,2)`, result: totals.deposit !== null ? Number(totals.deposit) : "" } : { formula: `MIN(${Number(quote.depositAmount)},G${ttcRow})`, result: totals.deposit !== null ? Number(totals.deposit) : "" };
  }
  for (let row = linesRow; row < r; row++) {
    styleRow(sheet.getRow(row), 10, row === htRow || row === ttcRow ? "total" : "subtotal", pal);
    sheet.getCell(`G${row}`).numFmt = money$;
  }
  if (options.length) {
    r++;
    const head = r++;
    sheet.mergeCells(`A${head}:J${head}`);
    sheet.getCell(`A${head}`).value = "Options, non comprises dans le total";
    styleRow(sheet.getRow(head), 10, "group", pal);
    for (const entry of options) write(entry, r++);
  }
}

/* ---------- Chargement et rendu ---------- */

async function lotLabelsOf(db: Database, quote: QuoteRow, lines: QuoteLineRow[]): Promise<string[]> {
  const ids = quote.lotIds ?? [];
  if (ids.length === 0) return [...new Set(lines.map((l) => l.lotLabel).filter((v): v is string => Boolean(v)))];
  const lots = await db.select().from(schema.projectLot);
  return ids.map((id) => lots.find((l) => l.id === id)).filter((l): l is NonNullable<typeof l> => Boolean(l)).map((l) => `Lot ${l.code}, ${l.name}`);
}

export async function loadQuoteDoc(db: Database, id: string): Promise<QuoteDocData> {
  const { quote, lines } = await loadQuote(db, id);
  const [company] = quote.companyProfileId ? await db.select().from(schema.companyProfile).where(eq(schema.companyProfile.id, quote.companyProfileId)) : [];
  const [client] = quote.clientId ? await db.select().from(schema.client).where(eq(schema.client.id, quote.clientId)) : [];
  const [project] = quote.projectId ? await db.select({ reference: schema.project.reference, name: schema.project.name }).from(schema.project).where(eq(schema.project.id, quote.projectId)) : [];
  return {
    quote,
    lines,
    totals: computeQuote(lines, settingsOf(quote)),
    issuer: (quote.issuerSnapshot as CompanyLike | null) ?? company ?? null,
    client: (quote.clientSnapshot as ClientLike | null) ?? client ?? null,
    project: project ?? null,
    lotLabels: await lotLabelsOf(db, quote, lines),
    identity: await readSetting("identite_documentaire"),
    version: null,
  };
}

async function render(data: QuoteDocData, format: ExportFormat, theme: DocTheme): Promise<ExportResult> {
  const model = quoteModel(data);
  const { buffer, layout } =
    format === "xlsx" ? await checkedWorkbook(await quoteWorkbook(data, theme)) : format === "docx" ? await renderDocxChecked(model, data.identity, { theme }) : await renderPdfChecked(model, data.identity, { theme });
  const suffix = data.version ? ` version ${data.version.number}` : "";
  const contentType = { pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", csv: "text/csv; charset=utf-8" }[format];
  return { buffer, layout, fileName: fileName(data.quote.number, `${data.quote.title}${suffix}`, format), contentType, projectId: data.quote.projectId, title: `${model.meta.title}${suffix}` };
}

export async function renderQuote(db: Database, id: string, format: ExportFormat, theme: DocTheme): Promise<ExportResult> {
  return render(await loadQuoteDoc(db, id), format, theme);
}

/** Version figée d'un devis, rendue depuis sa copie : en-tête, lignes, émetteur et client tels qu'à l'envoi. */
export async function renderQuoteVersion(db: Database, quoteId: string, versionId: string, format: ExportFormat, theme: DocTheme): Promise<ExportResult> {
  const [version] = await db.select().from(schema.quoteVersion).where(and(eq(schema.quoteVersion.id, versionId), eq(schema.quoteVersion.quoteId, quoteId)));
  if (!version) throw new ExportNotFound("Version introuvable.");
  const snap = version.snapshot as { quote: QuoteRow; lines: QuoteLineRow[]; issuer: CompanyLike | null; client: ClientLike | null };
  const quote = { ...snap.quote, status: version.status } as QuoteRow;
  const [project] = quote.projectId ? await db.select({ reference: schema.project.reference, name: schema.project.name }).from(schema.project).where(eq(schema.project.id, quote.projectId)) : [];
  return render(
    {
      quote,
      lines: snap.lines,
      totals: computeQuote(snap.lines, settingsOf(quote)),
      issuer: snap.issuer,
      client: snap.client,
      project: project ?? null,
      lotLabels: await lotLabelsOf(db, quote, snap.lines),
      identity: await readSetting("identite_documentaire"),
      version: { number: version.version, label: version.label, date: new Date(version.createdAt) },
    },
    format,
    theme,
  );
}
