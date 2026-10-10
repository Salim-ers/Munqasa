/**
 * Export de la bibliothèque de prix : chaque prix avec sa provenance, sa source et sa licence, sa date
 * ou sa période, sa fourchette, sa fiabilité, son assiette fiscale (HT ou TTC) et son statut.
 * Excel (filtrable), CSV (point-virgule et virgule décimale, lisible tel quel par Excel en français) et PDF.
 */
import { asc, eq } from "drizzle-orm";
import {
  COUNTRY_LABELS,
  PRICE_KIND_LABELS,
  PRICE_ORIGIN_LABELS,
  PRICE_SCOPE_LABELS,
  PRICE_VALUE_STATUS_LABELS,
  RELIABILITY_LABELS,
  VALIDATION_STATUS_LABELS,
} from "../../../shared/enums.js";
import { priceExclTax } from "../../../shared/prices.js";
import { tradeLabel } from "../../../shared/trades.js";
import { type Database, schema } from "../../db/index.js";
import { type PriceFilters, priceWhere } from "../../services/price-filters.js";
import { readSetting } from "../../services/settings.js";
import { type DocTheme, palette } from "../brand.js";
import { money } from "../context.js";
import type { DocMeta, DocModel } from "../model.js";
import { autoFilter, brandedSheet, moneyFormat, newWorkbook, styleRow } from "../xlsx.js";

export type LibraryFilters = PriceFilters;

type Price = typeof schema.priceItem.$inferSelect & { supplierName: string | null; sourceName: string | null; sourcePublisher: string | null };

export async function loadPrices(db: Database, f: LibraryFilters): Promise<Price[]> {
  const p = schema.priceItem;
  const rows = await db
    .select({ price: p, supplierName: schema.supplier.name, sourceName: schema.priceSource.name, sourcePublisher: schema.priceSource.publisher })
    .from(p)
    .leftJoin(schema.supplier, eq(schema.supplier.id, p.supplierId))
    .leftJoin(schema.priceSource, eq(schema.priceSource.id, p.sourceId))
    .where(priceWhere(f))
    .orderBy(asc(p.country), asc(p.tradeFamily), asc(p.designation), asc(p.region), asc(p.city))
    .limit(20000);
  return rows.map((r) => ({ ...r.price, supplierName: r.supplierName, sourceName: r.sourceName, sourcePublisher: r.sourcePublisher }));
}

const HEADERS = [
  "Code",
  "Désignation",
  "Nature",
  "Portée",
  "Unité",
  "Prix unitaire",
  "Assiette",
  "TVA incluse %",
  "Prix unitaire HT",
  "Devise",
  "Fourchette basse",
  "Fourchette haute",
  "Pays",
  "Région",
  "Ville",
  "Famille",
  "Provenance",
  "Source",
  "Producteur",
  "Référence dans la source",
  "Adresse de la source",
  "Licence",
  "Période",
  "Date du prix",
  "Observations",
  "Méthode",
  "Nature de la valeur",
  "Fiabilité",
  "Fournisseur",
  "Vérifié le",
  "Statut",
] as const;

const num = (v: string | null) => (v === null ? "" : Number(v));

function htOf(p: Price): number | "" {
  const ht = priceExclTax(p.unitPrice, p.taxBasis, p.vatRate);
  return ht === null ? "" : Math.round(ht * 10_000) / 10_000;
}

function row(p: Price): Array<string | number> {
  return [
    p.code ?? "",
    p.designation,
    PRICE_KIND_LABELS[p.kind],
    p.priceScope ? PRICE_SCOPE_LABELS[p.priceScope] : "",
    p.unit,
    Number(p.unitPrice),
    p.taxBasis ?? "non précisée",
    num(p.vatRate),
    htOf(p),
    p.currency,
    num(p.priceMin),
    num(p.priceMax),
    COUNTRY_LABELS[p.country],
    p.region ?? "",
    p.city ?? "",
    [p.tradeFamily ? tradeLabel(p.tradeFamily) : null, p.subFamily].filter(Boolean).join(", "),
    PRICE_ORIGIN_LABELS[p.origin],
    p.sourceName ?? "",
    p.sourcePublisher ?? "",
    p.sourceRef ?? "",
    p.sourceUrl ?? "",
    p.license ?? "",
    p.period ?? "",
    p.priceDate,
    p.sampleSize ?? "",
    p.aggregation ?? "",
    PRICE_VALUE_STATUS_LABELS[p.valueStatus],
    p.reliability ? RELIABILITY_LABELS[p.reliability] : "non évaluée",
    p.supplierName ?? "",
    p.verifiedAt ? new Date(p.verifiedAt).toISOString().slice(0, 10) : "",
    VALIDATION_STATUS_LABELS[p.verificationStatus],
  ];
}

function scopeLabel(f: LibraryFilters): string {
  return [
    f.country ? COUNTRY_LABELS[f.country] : null,
    f.region,
    f.city,
    f.kind ? PRICE_KIND_LABELS[f.kind] : null,
    f.tradeFamily ? tradeLabel(f.tradeFamily) : null,
    f.status ? VALIDATION_STATUS_LABELS[f.status].toLowerCase() : null,
    f.source === "personnel" ? "vos prix" : null,
  ]
    .filter(Boolean)
    .join(", ");
}

export async function libraryMeta(f: LibraryFilters, count: number): Promise<DocMeta> {
  const identity = await readSetting("identite_documentaire");
  const scope = scopeLabel(f);
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
    disclaimer:
      "Chaque prix garde sa provenance, sa source, sa date et son statut. Un prix TTC est indiqué comme tel ; un prix « à vérifier », ancien ou de fiabilité faible n’est pas un prix de marché confirmé. Les prix de matériaux servent aux sous-détails et ne s’appliquent pas tels quels à une ligne de DPGF.",
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
          { label: "Désignation et zone", width: "*" },
          { label: "Unité", width: 6, align: "center" },
          { label: "Prix", width: 12, align: "right" },
          { label: "Fourchette", width: 12, align: "right" },
          { label: "Période", width: 8 },
          { label: "Source", width: 19 },
          { label: "Fiabilité", width: 7 },
          { label: "Statut", width: 8 },
        ],
        rows: prices.map((p) => ({
          cells: [
            [p.designation, [p.city, p.region, COUNTRY_LABELS[p.country]].filter(Boolean).join(", ")].join("\n"),
            p.unit,
            { text: `${money(p.unitPrice, p.currency)}${p.taxBasis ? ` ${p.taxBasis}` : ""}`, align: "right" },
            { text: p.priceMin && p.priceMax ? `${money(p.priceMin, p.currency)}\n${money(p.priceMax, p.currency)}` : "", align: "right" },
            p.period ?? p.priceDate.split("-").reverse().join("/"),
            [p.sourceName ?? PRICE_ORIGIN_LABELS[p.origin], p.sourceRef, p.supplierName].filter(Boolean).join("\n"),
            p.reliability ? RELIABILITY_LABELS[p.reliability] : "",
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
  const widths: Record<string, number> = { Désignation: 48, Méthode: 50, "Adresse de la source": 40, "Référence dans la source": 30, Producteur: 30, Source: 30, Famille: 24 };
  const align: Record<string, "center" | "right"> = { Unité: "center", Devise: "center", Assiette: "center", "Prix unitaire": "right", "Prix unitaire HT": "right", "Fourchette basse": "right", "Fourchette haute": "right" };
  const target = brandedSheet(workbook, "Prix", {
    meta,
    pal,
    landscape: true,
    info: [["Extraction", `${prices.length} prix, le ${meta.date.toLocaleDateString("fr-FR")}`]],
    columns: HEADERS.map((header) => ({ header, width: widths[header] ?? 14, ...(align[header] ? { align: align[header] } : {}) })),
  });
  const moneyColumns = [6, 9, 11, 12];
  prices.forEach((p, i) => {
    const r = target.sheet.getRow(target.firstRow + i);
    r.values = row(p);
    styleRow(r, HEADERS.length, "item", pal);
    for (const c of moneyColumns) r.getCell(c).numFmt = moneyFormat(p.currency);
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
