/** Devis, événements commerciaux et taux de change. */
import { type AnyPgColumn, boolean, date, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { QuotePricingMode, QuoteSource, QuoteStatus, TaxRegime } from "../../../shared/enums.js";
import { client } from "./crm.js";
import { createdAt, fxRate, id, percent, qty, updatedAt } from "./columns.js";
import { currencyEnum, quoteEventKindEnum, quoteLineKindEnum, quoteStatusEnum, rateKindEnum } from "./enums.js";
import { dpgf, dpgfLine, priceBreakdown, workItem } from "./documents.js";
import { companyProfile } from "./company.js";
import { priceItem } from "./library.js";
import { project, projectLot } from "./projects.js";

/** Copie figée d'un prix de bibliothèque au moment où il entre dans le devis : la bibliothèque peut changer ensuite. */
export interface QuotePriceSnapshot {
  designation: string;
  unitPrice: string;
  unitPriceHt: string;
  taxBasis: string | null;
  currency: string;
  priceDate: string;
  period: string | null;
  sourceName: string | null;
  reliability: string | null;
  verificationStatus: string;
  historical: boolean;
  regulated: boolean;
}

export const quote = pgTable(
  "quote",
  {
    id: id(),
    /** Numéro automatique, ex. DEV-2026-0001. */
    number: text("number").notNull().unique(),
    projectId: uuid("project_id").references(() => project.id, { onDelete: "set null" }),
    clientId: uuid("client_id").references(() => client.id, { onDelete: "set null" }),
    companyProfileId: uuid("company_profile_id").references(() => companyProfile.id, { onDelete: "set null" }),
    /** Copie figée de l'entité émettrice au moment de l'émission. */
    issuerSnapshot: jsonb("issuer_snapshot"),
    title: text("title").notNull(),
    siteAddress: text("site_address"),
    issueDate: date("issue_date", { mode: "string" }),
    validityDays: integer("validity_days"),
    currency: currencyEnum("currency").notNull(),
    discountRate: percent("discount_rate"),
    vatRate: percent("vat_rate"),
    status: quoteStatusEnum("status").notNull().default("brouillon"),
    paymentTerms: text("payment_terms"),
    notes: text("notes"),
    legalMentions: text("legal_mentions"),
    currentVersion: integer("current_version").notNull().default(0),
    /** Un devis émis est verrouillé : toute modification passe par une nouvelle version. */
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    /** Origine du devis (vierge, affaire, DPGF, métré, bibliothèque, IA). */
    source: text("source").$type<QuoteSource>().notNull().default("vierge"),
    dpgfId: uuid("dpgf_id").references(() => dpgf.id, { onDelete: "set null" }),
    /** Lots de l'affaire couverts par le devis. */
    lotIds: jsonb("lot_ids").$type<string[]>().notNull().default([]),
    /** Copie figée du client au moment de l'envoi. */
    clientSnapshot: jsonb("client_snapshot"),
    siteName: text("site_name"),
    taxRegime: text("tax_regime").$type<TaxRegime>().notNull().default("normal"),
    /** Fondement légal d'une exonération de TVA, saisi : jamais supposé. */
    taxExemptionBasis: text("tax_exemption_basis"),
    /** Acompte : taux du total TTC ou montant fixe, l'un ou l'autre. */
    depositRate: percent("deposit_rate"),
    depositAmount: qty("deposit_amount"),
    /** Coefficients appliqués aux lignes décomposées (fourniture et pose) : frais de chantier, frais généraux, aléas, marge. */
    siteCostsRate: percent("site_costs_rate"),
    overheadRate: percent("overhead_rate"),
    overheadBase: text("overhead_base").notNull().default("debourse_total"),
    contingencyRate: percent("contingency_rate"),
    contingencyBase: text("contingency_base").notNull().default("debourse_total"),
    marginRate: percent("margin_rate"),
    marginMode: text("margin_mode").notNull().default("taux_de_marge"),
    /** Totaux recalculés à chaque modification ; nuls tant qu'un prix manque (état « partiel »). */
    totalHt: qty("total_ht"),
    totalVat: qty("total_vat"),
    totalTtc: qty("total_ttc"),
    totalsState: text("totals_state").notNull().default("non_renseigne"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    generationJobId: uuid("generation_job_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("quote_status_idx").on(t.status), index("quote_project_idx").on(t.projectId)],
);

export const quoteLine = pgTable(
  "quote_line",
  {
    id: id(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quote.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => quoteLine.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    kind: quoteLineKindEnum("kind").notNull(),
    designation: text("designation").notNull(),
    description: text("description"),
    unit: text("unit"),
    quantity: qty("quantity"),
    unitPrice: qty("unit_price"),
    discountRate: percent("discount_rate"),
    vatRate: percent("vat_rate"),
    dpgfLineId: uuid("dpgf_line_id").references(() => dpgfLine.id, { onDelete: "set null" }),
    priceBreakdownId: uuid("price_breakdown_id").references(() => priceBreakdown.id, { onDelete: "set null" }),
    /** Lot de l'affaire (numéro et intitulé recopiés : une section de lot garde son libellé). */
    lotId: uuid("lot_id").references(() => projectLot.id, { onDelete: "set null" }),
    lotLabel: text("lot_label"),
    workItemId: uuid("work_item_id").references(() => workItem.id, { onDelete: "set null" }),
    priceItemId: uuid("price_item_id").references(() => priceItem.id, { onDelete: "set null" }),
    /** Provenance du prix (« Bibliothèque : … », « DPGF », « Sous-détail validé », « Saisie »). */
    priceOrigin: text("price_origin"),
    priceSnapshot: jsonb("price_snapshot").$type<QuotePriceSnapshot>(),
    /** Prix incertain (historique, à vérifier, fiabilité faible) confirmé explicitement par l'utilisateur. */
    priceConfirmed: boolean("price_confirmed").notNull().default(false),
    pricingMode: text("pricing_mode").$type<QuotePricingMode>().notNull().default("direct"),
    /** Déboursé sec unitaire d'une ligne décomposée : fourniture et pose. */
    supplyCost: qty("supply_cost"),
    laborCost: qty("labor_cost"),
    /** Provenance de la quantité (métré vérifié ou non, DPGF, description, saisie). */
    quantitySource: text("quantity_source"),
    /** Montant net HT recalculé (quantité × prix unitaire, remise de ligne déduite). */
    amountHt: qty("amount_ht"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("quote_line_quote_idx").on(t.quoteId, t.position)],
);

/** Versions conservées d'un devis : chaque envoi et chaque nouvelle version figent le devis tel qu'il était. */
export const quoteVersion = pgTable(
  "quote_version",
  {
    id: id(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quote.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: text("status").$type<QuoteStatus>().notNull(),
    label: text("label").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("quote_version_quote_idx").on(t.quoteId, t.version)],
);

export const quoteEvent = pgTable(
  "quote_event",
  {
    id: id(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quote.id, { onDelete: "cascade" }),
    kind: quoteEventKindEnum("kind").notNull(),
    note: text("note"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("quote_event_quote_idx").on(t.quoteId)],
);

/** Taux de change : jamais inventé ni silencieusement périmé ; source, nature et horodatage conservés. */
export const currencyRate = pgTable(
  "currency_rate",
  {
    id: id(),
    baseCurrency: currencyEnum("base_currency").notNull(),
    quoteCurrency: currencyEnum("quote_currency").notNull(),
    /** 1 unité de base = `rate` unités de la devise cotée. */
    rate: fxRate("rate").notNull(),
    kind: rateKindEnum("kind").notNull(),
    source: text("source").notNull(),
    sourceRef: text("source_ref"),
    /** Date et heure de valeur du taux (pas celle de l'enregistrement). */
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("currency_rate_pair_idx").on(t.baseCurrency, t.quoteCurrency, t.observedAt)],
);

/** Conversion figée sur un document : montant d'origine, taux, source, date, nature, mode. */
export type ConversionRecord = {
  amount: string;
  fromCurrency: "MAD" | "EUR";
  convertedAmount: string;
  toCurrency: "MAD" | "EUR";
  rate: string;
  rateSource: string;
  rateObservedAt: string;
  rateKind: "reference" | "achat" | "vente" | "contractuel";
  mode: "actualise" | "historique" | "contractuel";
};

