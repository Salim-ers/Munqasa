/** Référentiels techniques, fournisseurs, matériaux et bibliothèque de prix. */
import { date, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, qty, updatedAt } from "./columns.js";
import { countryEnum, currencyEnum, priceKindEnum, priceOriginEnum, referenceKindEnum, referenceScopeEnum, validationStatusEnum } from "./enums.js";
import { sourceFile } from "./sources.js";

/**
 * Registre des références réglementaires et normatives. Une référence n'est citée dans un document
 * que si elle figure ici ; son statut dit si elle a été vérifiée. Le contenu des normes payantes
 * n'est jamais reproduit : seuls l'identifiant, l'intitulé et la source sont conservés.
 */
export const technicalReference = pgTable(
  "technical_reference",
  {
    id: id(),
    scope: referenceScopeEnum("scope").notNull(),
    kind: referenceKindEnum("kind").notNull(),
    code: text("code").notNull(),
    title: text("title").notNull(),
    version: text("version"),
    publishedOn: date("published_on", { mode: "string" }),
    domain: text("domain"),
    sourceUrl: text("source_url"),
    verificationStatus: validationStatusEnum("verification_status").notNull().default("a_verifier"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("technical_reference_code_idx").on(t.code), index("technical_reference_scope_idx").on(t.scope, t.kind)],
);

export const supplier = pgTable(
  "supplier",
  {
    id: id(),
    name: text("name").notNull(),
    country: countryEnum("country").notNull(),
    city: text("city"),
    contactName: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("supplier_name_idx").on(t.name)],
);

export const material = pgTable(
  "material",
  {
    id: id(),
    name: text("name").notNull(),
    unit: text("unit").notNull(),
    family: text("family"),
    supplierId: uuid("supplier_id").references(() => supplier.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("material_name_idx").on(t.name)],
);

/** Prix de bibliothèque : toujours avec sa provenance, sa date et sa zone. Aucune valeur inventée. */
export const priceItem = pgTable(
  "price_item",
  {
    id: id(),
    code: text("code"),
    designation: text("designation").notNull(),
    kind: priceKindEnum("kind").notNull(),
    unit: text("unit").notNull(),
    unitPrice: qty("unit_price").notNull(),
    currency: currencyEnum("currency").notNull(),
    country: countryEnum("country").notNull(),
    region: text("region"),
    city: text("city"),
    tradeFamily: text("trade_family"),
    subFamily: text("sub_family"),
    origin: priceOriginEnum("origin").notNull(),
    supplierId: uuid("supplier_id").references(() => supplier.id, { onDelete: "set null" }),
    sourceFileId: uuid("source_file_id").references(() => sourceFile.id, { onDelete: "set null" }),
    /** Référence dans la source (n° de ligne, page, n° de devis…). */
    sourceRef: text("source_ref"),
    priceDate: date("price_date", { mode: "string" }).notNull(),
    verificationStatus: validationStatusEnum("verification_status").notNull().default("a_verifier"),
    commercialConditions: text("commercial_conditions"),
    attributes: jsonb("attributes").$type<Record<string, string>>().notNull().default({}),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("price_item_trade_idx").on(t.tradeFamily, t.country),
    index("price_item_designation_idx").on(t.designation),
    index("price_item_code_idx").on(t.code),
    index("price_item_date_idx").on(t.priceDate),
  ],
);

/** Historique des valeurs d'un prix : rien n'est écrasé sans trace. */
export const priceHistory = pgTable(
  "price_history",
  {
    id: id(),
    priceItemId: uuid("price_item_id")
      .notNull()
      .references(() => priceItem.id, { onDelete: "cascade" }),
    unitPrice: qty("unit_price").notNull(),
    currency: currencyEnum("currency").notNull(),
    priceDate: date("price_date", { mode: "string" }).notNull(),
    origin: priceOriginEnum("origin").notNull(),
    sourceFileId: uuid("source_file_id").references(() => sourceFile.id, { onDelete: "set null" }),
    note: text("note"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("price_history_item_idx").on(t.priceItemId)],
);
