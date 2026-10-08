/** Devis, événements commerciaux et taux de change. */
import { type AnyPgColumn, date, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { client } from "./crm.js";
import { createdAt, fxRate, id, percent, qty, updatedAt } from "./columns.js";
import { currencyEnum, quoteEventKindEnum, quoteLineKindEnum, quoteStatusEnum, rateKindEnum } from "./enums.js";
import { dpgfLine, priceBreakdown } from "./documents.js";
import { companyProfile } from "./company.js";
import { project } from "./projects.js";

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
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("quote_line_quote_idx").on(t.quoteId, t.position)],
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

