/**
 * Export de la bibliothèque de prix : chaque prix avec sa provenance, sa date, sa zone et son statut.
 * Excel (filtrable), CSV (point-virgule et virgule décimale, lisible tel quel par Excel en français) et PDF.
 */
import { and, asc, eq, ilike, isNotNull, isNull, or, type SQL } from "drizzle-orm";
import { COUNTRY_LABELS, type Country, type Currency, PRICE_KIND_LABELS, PRICE_ORIGIN_LABELS, type PriceKind, VALIDATION_STATUS_LABELS } from "../../../shared/enums.js";
import { tradeLabel } from "../../../shared/trades.js";
import { type Database, schema } from "../../db/index.js";
import { readSetting } from "../../services/settings.js";
import { type DocTheme, palette } from "../brand.js";
import { money } from "../context.js";
import type { DocMeta, DocModel } from "../model.js";
import { autoFilter, brandedSheet, moneyFormat, newWorkbook, styleRow } from "../xlsx.js";

export interface LibraryFilters {
  q?: string | null;
  country?: Country | null;
  currency?: Currency | null;
  kind?: PriceKind | null;
  status?: "a_verifier" | "verifie" | "rejete" | null;
  archived?: boolean;
}

type Price = typeof schema.priceItem.$inferSelect & { supplierName: string | null };

export async function loadPrices(db: Database, f: LibraryFilters): Promise<Price[]> {
  const p = schema.priceItem;
  const where: SQL[] = [f.archived ? isNotNull(p.archivedAt) : isNull(p.archivedAt)];
  if (f.q) where.push(or(ilike(p.designation, `%${f.q}%`), ilike(p.code, `%${f.q}%`), ilike(p.subFamily, `%${f.q}%`))!);
  if (f.country) where.push(eq(p.country, f.country));
  if (f.currency) where.push(eq(p.currency, f.currency));
  if (f.kind) where.push(eq(p.kind, f.kind));
  if (f.status) where.push(eq(p.verificationStatus, f.status));
  const rows = await db
    .select({ price: p, supplierName: schema.supplier.name })
    .from(p)
    .leftJoin(schema.supplier, eq(schema.supplier.id, p.supplierId))
    .where(and(...where))
    .orderBy(asc(p.tradeFamily), asc(p.designation))
    .limit(20000);
  return rows.map((r) => ({ ...r.price, supplierName: r.supplierName }));
}

const HEADERS = ["Code", "Désignation", "Nature", "Unité", "Prix unitaire HT", "Devise", "Pays", "Zone", "Famille", "Provenance", "Source", "Fournisseur", "Date du prix", "Statut"];

function row(p: Price): Array<string | number> {
  return [
    p.code ?? "",
    p.designation,
    PRICE_KIND_LABELS[p.kind],
    p.unit,
    Number(p.unitPrice),
    p.currency,
    COUNTRY_LABELS[p.country],
    [p.region, p.city].filter(Boolean).join(", "),
    [p.tradeFamily ? tradeLabel(p.tradeFamily) : null, p.subFamily].filter(Boolean).join(", "),
    PRICE_ORIGIN_LABELS[p.origin],
    p.sourceRef ?? "",
    p.supplierName ?? "",
    p.priceDate,
    VALIDATION_STATUS_LABELS[p.verificationStatus],
  ];
}

export async function libraryMeta(f: LibraryFilters, count: number): Promise<DocMeta> {
  const identity = await readSetting("identite_documentaire");
  const scope = [f.country ? COUNTRY_LABELS[f.country] : null, f.kind ? PRICE_KIND_LABELS[f.kind] : null, f.status ? VALIDATION_STATUS_LABELS[f.status].toLowerCase() : null].filter(Boolean).join(", ");
  return {
    kind: "bibliotheque",
    typeLabel: "Bibliothèque de prix",
    shortLabel: "Prix",
    title: `Bibliothèque de prix${scope ? `, ${scope}` : ""}`,
    project: { reference: "Talab Solutions", name: `${count} prix`, location: f.country ? COUNTRY_LABELS[f.country] : "Maroc et France", phase: null },
    client: null,
    lot: null,
    version: null,
    date: new Date(),
    status: "Extraction de la bibliothèque",
    company: null,
    footerText: identity.footerText,
    orientation: "landscape",
    toc: false,
    disclaimer: "Chaque prix garde sa provenance, sa date et son statut. Un prix « à vérifier » ou ancien n’est pas un prix de marché confirmé.",
  };
}

export async function libraryModel(prices: Price[], f: LibraryFilters): Promise<DocModel> {
  return {
    meta: await libraryMeta(f, prices.length),
    blocks: [
      {
        type: "table",
        dense: true,
        columns: [
          { label: "Désignation", width: "*" },
          { label: "Nature", width: 9 },
          { label: "Unité", width: 6, align: "center" },
          { label: "Prix HT", width: 11, align: "right" },
          { label: "Zone", width: 11 },
          { label: "Provenance et source", width: 19 },
          { label: "Date", width: 8 },
          { label: "Statut", width: 8 },
        ],
        rows: prices.map((p) => ({
          cells: [
            [p.designation, p.code].filter(Boolean).join("\n"),
            PRICE_KIND_LABELS[p.kind],
            p.unit,
            { text: money(p.unitPrice, p.currency), align: "right" },
            [p.city ?? p.region, COUNTRY_LABELS[p.country]].filter(Boolean).join(", "),
            [PRICE_ORIGIN_LABELS[p.origin], p.sourceRef, p.supplierName].filter(Boolean).join("\n"),
            p.priceDate.split("-").reverse().join("/"),
            { text: VALIDATION_STATUS_LABELS[p.verificationStatus], tone: p.verificationStatus === "verifie" ? undefined : "primary" },
          ],
        })),
      },
    ],
  };
}

export async function libraryWorkbook(prices: Price[], f: LibraryFilters, theme: DocTheme): Promise<Buffer> {
  const meta = await libraryMeta(f, prices.length);
  const pal = palette(theme, await readSetting("identite_documentaire"));
  const workbook = newWorkbook(meta);
  const target = brandedSheet(workbook, "Prix", {
    meta,
    pal,
    landscape: true,
    info: [["Extraction", `${prices.length} prix, le ${meta.date.toLocaleDateString("fr-FR")}`]],
    columns: [
      { header: HEADERS[0]!, width: 12 },
      { header: HEADERS[1]!, width: 48 },
      { header: HEADERS[2]!, width: 14 },
      { header: HEADERS[3]!, width: 8, align: "center" },
      { header: HEADERS[4]!, width: 16, align: "right" },
      { header: HEADERS[5]!, width: 8, align: "center" },
      { header: HEADERS[6]!, width: 9 },
      { header: HEADERS[7]!, width: 18 },
      { header: HEADERS[8]!, width: 24 },
      { header: HEADERS[9]!, width: 20 },
      { header: HEADERS[10]!, width: 30 },
      { header: HEADERS[11]!, width: 20 },
      { header: HEADERS[12]!, width: 12 },
      { header: HEADERS[13]!, width: 11 },
    ],
  });
  prices.forEach((p, i) => {
    const r = target.sheet.getRow(target.firstRow + i);
    r.values = row(p);
    styleRow(r, HEADERS.length, "item", pal);
    r.getCell(5).numFmt = moneyFormat(p.currency);
    r.getCell(2).alignment = { wrapText: true, vertical: "top" };
  });
  autoFilter(target, target.firstRow + prices.length - 1);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** CSV à la française : point-virgule, virgule décimale, encodage UTF-8 avec marque d'ordre. */
export function libraryCsv(prices: Price[]): Buffer {
  const quote = (v: string | number) => {
    const s = typeof v === "number" ? String(v).replace(".", ",") : v;
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [HEADERS.join(";"), ...prices.map((p) => row(p).map(quote).join(";"))];
  return Buffer.from(`﻿${lines.join("\r\n")}\r\n`, "utf8");
}
