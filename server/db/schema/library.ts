/** Référentiels techniques, fournisseurs, matériaux et bibliothèque de prix. */
import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { BatchStats, PreviousValue, SourceRecord, SourceResource } from "../../../shared/prices.js";
import { createdAt, id, percent, qty, updatedAt } from "./columns.js";
import {
  countryEnum,
  currencyEnum,
  priceBatchStatusEnum,
  priceKindEnum,
  priceOriginEnum,
  priceRowDecisionEnum,
  priceScopeEnum,
  priceValueStatusEnum,
  referenceKindEnum,
  referenceScopeEnum,
  reliabilityEnum,
  taxBasisEnum,
  validationStatusEnum,
} from "./enums.js";
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

/**
 * Sources publiques de prix : licence, ressources suivies avec leur empreinte, règles de publication
 * (publication automatique des valeurs saines, seuil de variation au-delà duquel une valeur part en quarantaine).
 */
export const priceSource = pgTable("price_source", {
  id: id(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  publisher: text("publisher").notNull(),
  country: countryEnum("country").notNull(),
  homepage: text("homepage").notNull(),
  license: text("license").notNull(),
  licenseUrl: text("license_url"),
  description: text("description"),
  method: text("method"),
  coverage: text("coverage"),
  resources: jsonb("resources").$type<SourceResource[]>().notNull().default([]),
  autoPublish: boolean("auto_publish").notNull().default(true),
  maxVariation: percent("max_variation").notNull().default("30"),
  refreshDays: integer("refresh_days").notNull().default(30),
  enabled: boolean("enabled").notNull().default(true),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastChangedAt: timestamp("last_changed_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Lot d'import (instantané, actualisation ou fichier) : analysé, publié, réversible. */
export const priceImportBatch = pgTable(
  "price_import_batch",
  {
    id: id(),
    sourceId: uuid("source_id").references(() => priceSource.id, { onDelete: "set null" }),
    label: text("label").notNull(),
    trigger: text("trigger").notNull(),
    status: priceBatchStatusEnum("status").notNull().default("en_cours"),
    stats: jsonb("stats").$type<BatchStats>().notNull().default({}),
    resources: jsonb("resources").$type<SourceResource[]>().notNull().default([]),
    message: text("message"),
    jobId: uuid("job_id"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    revertedAt: timestamp("reverted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("price_import_batch_source_idx").on(t.sourceId, t.createdAt)],
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
    description: text("description"),
    priceScope: priceScopeEnum("price_scope"),
    taxBasis: taxBasisEnum("tax_basis"),
    /** Taux de TVA inclus dans un prix TTC, pour le ramener hors taxes. */
    vatRate: percent("vat_rate"),
    valueStatus: priceValueStatusEnum("value_status").notNull().default("source"),
    reliability: reliabilityEnum("reliability"),
    sourceId: uuid("source_id").references(() => priceSource.id, { onDelete: "set null" }),
    externalKey: text("external_key"),
    groupKey: text("group_key"),
    sourceUrl: text("source_url"),
    license: text("license"),
    /** Période couverte par la valeur (« 2022 », « 2014 à 2018 »). */
    period: text("period"),
    priceMin: qty("price_min"),
    priceMax: qty("price_max"),
    sampleSize: integer("sample_size"),
    /** Méthode d'obtention de la valeur (moyenne publiée, médiane de n observations…). */
    aggregation: text("aggregation"),
    /** Série publiée par la source, par année. */
    series: jsonb("series").$type<Record<string, number>>(),
    /** Dernier contrôle de la valeur, contre la source ou par le professionnel. */
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    importBatchId: uuid("import_batch_id").references(() => priceImportBatch.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("price_item_trade_idx").on(t.tradeFamily, t.country),
    index("price_item_designation_idx").on(t.designation),
    index("price_item_code_idx").on(t.code),
    index("price_item_date_idx").on(t.priceDate),
    uniqueIndex("price_item_source_key_idx").on(t.sourceId, t.externalKey),
    index("price_item_group_idx").on(t.groupKey),
    index("price_item_zone_idx").on(t.country, t.region, t.city),
  ],
);

/** Valeurs proposées par un lot : publiées, en quarantaine (anomalie) ou rejetées, avec la valeur remplacée. */
export const priceImportRow = pgTable(
  "price_import_row",
  {
    id: id(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => priceImportBatch.id, { onDelete: "cascade" }),
    externalKey: text("external_key").notNull(),
    action: text("action").notNull(),
    decision: priceRowDecisionEnum("decision").notNull(),
    reason: text("reason"),
    payload: jsonb("payload").$type<SourceRecord>().notNull(),
    previous: jsonb("previous").$type<PreviousValue>(),
    priceItemId: uuid("price_item_id").references(() => priceItem.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("price_import_row_batch_idx").on(t.batchId, t.decision)],
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
    batchId: uuid("batch_id").references(() => priceImportBatch.id, { onDelete: "set null" }),
    note: text("note"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("price_history_item_idx").on(t.priceItemId)],
);
