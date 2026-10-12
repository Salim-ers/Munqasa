/** Affaires (opérations), lots, échéances, compteurs de références. */
import { type AnyPgColumn, boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { client } from "./crm.js";
import { createdAt, id, money, updatedAt } from "./columns.js";
import { countryEnum, currencyEnum, designPhaseEnum, marketTypeEnum, projectStatusEnum, sectorEnum } from "./enums.js";

export const project = pgTable(
  "project",
  {
    id: id(),
    /** Référence automatique, ex. TAL-2026-0001 (voir reference_counter). */
    reference: text("reference").notNull().unique(),
    name: text("name").notNull(),
    clientId: uuid("client_id").references(() => client.id, { onDelete: "set null" }),
    country: countryEnum("country").notNull(),
    city: text("city"),
    siteAddress: text("site_address"),
    marketType: marketTypeEnum("market_type").notNull(),
    sector: sectorEnum("sector").notNull(),
    worksNature: text("works_nature"),
    designPhase: designPhaseEnum("design_phase").notNull().default("dce"),
    currency: currencyEnum("currency").notNull(),
    status: projectStatusEnum("status").notNull().default("brouillon"),
    /** Date limite de remise des offres. */
    submissionDeadline: timestamp("submission_deadline", { withTimezone: true }),
    startDate: date("start_date", { mode: "string" }),
    description: text("description"),
    hypotheses: text("hypotheses"),
    constraints: text("constraints"),
    /** Référentiels déclarés applicables (identifiants de technical_reference). */
    referenceIds: jsonb("reference_ids").$type<string[]>().notNull().default([]),
    /** Estimation saisie par l'administrateur, distincte des montants calculés des DPGF. */
    manualEstimate: money("manual_estimate"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("project_status_idx").on(t.status),
    index("project_client_idx").on(t.clientId),
    index("project_deadline_idx").on(t.submissionDeadline),
    index("project_country_idx").on(t.country),
  ],
);

/**
 * Nomenclature de lots (catalogue) : modèle modifiable, nomenclature interne indicative, éventuellement propre
 * à un pays ou à un type d'opération (shared/lots.ts). Les affaires en recopient les lots : modifier un
 * catalogue ne change jamais une affaire existante.
 */
export const lotCatalog = pgTable("lot_catalog", {
  id: id(),
  name: text("name").notNull(),
  /** Pays concerné (« FR », « MA ») ou nul pour les deux. */
  country: text("country"),
  /** Type d'opération du modèle (bâtiment, logements, réhabilitation, VRD…), ou nul. */
  projectType: text("project_type"),
  isDefault: boolean("is_default").notNull().default(false),
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Lot ou sous-lot d'une nomenclature : numéro, intitulé, famille de corps d'état, favori. */
export const lotCatalogEntry = pgTable(
  "lot_catalog_entry",
  {
    id: id(),
    catalogId: uuid("catalog_id")
      .notNull()
      .references(() => lotCatalog.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => lotCatalogEntry.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    name: text("name").notNull(),
    tradeFamily: text("trade_family").notNull(),
    favorite: boolean("favorite").notNull().default(false),
    /** Retiré de la nomenclature (fusion, abandon) sans être effacé. */
    archived: boolean("archived").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("lot_catalog_entry_number_idx").on(t.catalogId, t.number), index("lot_catalog_entry_catalog_idx").on(t.catalogId, t.position)],
);

/** Lot d'une affaire, rattaché à une famille de corps d'état (shared/trades.ts). */
export const projectLot = pgTable(
  "project_lot",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    tradeFamily: text("trade_family").notNull(),
    position: integer("position").notNull().default(0),
    /** Sous-lot : lot de l'affaire qui le contient (01.04 dans 01), sinon nul. */
    parentId: uuid("parent_id").references((): AnyPgColumn => projectLot.id, { onDelete: "set null" }),
    /** Entrée de catalogue d'origine (traçabilité) ; ses valeurs ont été recopiées, rien n'est lié. */
    catalogEntryId: uuid("catalog_entry_id").references(() => lotCatalogEntry.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("project_lot_code_idx").on(t.projectId, t.code), index("project_lot_project_idx").on(t.projectId)],
);

/** Échéances (agenda) : remise des offres, visites, questions, jalons internes. */
export const deadline = pgTable(
  "deadline",
  {
    id: id(),
    projectId: uuid("project_id").references(() => project.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: text("kind").notNull().default("jalon"),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    doneAt: timestamp("done_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("deadline_due_idx").on(t.dueAt), index("deadline_project_idx").on(t.projectId)],
);

/** Compteurs atomiques des références (affaires, devis…), par portée : « project:2026 », « quote:2026 ». */
export const referenceCounter = pgTable("reference_counter", {
  scope: text("scope").primaryKey(),
  value: integer("value").notNull().default(0),
});
