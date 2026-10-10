/**
 * Chaîne technique et économique d'une affaire :
 * ouvrage (work_item) ← métré (measurement) ← plan ; ouvrage → prescription CCTP → ligne DPGF → sous-détail.
 */
import { type AnyPgColumn, boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { AuditSummary } from "../../../shared/dossier.js";
import type { MeasureDeduction, MeasureInputSource } from "../../../shared/metre.js";
import { createdAt, fine, id, money, percent, qty, updatedAt } from "./columns.js";
import { componentCategoryEnum, countryEnum, currencyEnum, designPhaseEnum, documentStatusEnum, documentTypeEnum, dpgfLineKindEnum, lineStatusEnum, marginModeEnum, measureConfidenceEnum, measureMethodEnum, measureSourceEnum, rateBaseEnum, sectionStatusEnum, validationStatusEnum } from "./enums.js";
import { priceItem, supplier } from "./library.js";
import { project, projectLot } from "./projects.js";
import { drawing } from "./sources.js";

/** Ouvrage : l'unité commune au CCTP, au métré, à la DPGF et au sous-détail. */
export const workItem = pgTable(
  "work_item",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    lotId: uuid("lot_id").references(() => projectLot.id, { onDelete: "set null" }),
    code: text("code"),
    designation: text("designation").notNull(),
    description: text("description"),
    unit: text("unit"),
    location: text("location"),
    /** Caractéristiques retenues (matériau, épaisseur…) avec leur source : jamais inventées. */
    attributes: jsonb("attributes").$type<Array<{ name: string; value: string; source: string }>>().notNull().default([]),
    /** « proposition_ia » (lecture des plans) ou « saisie » : une nouvelle analyse ne remplace que les propositions non validées. */
    origin: text("origin").notNull().default("saisie"),
    /** Traitement qui a proposé l'ouvrage (traçabilité). */
    jobId: uuid("job_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("work_item_project_idx").on(t.projectId), index("work_item_lot_idx").on(t.lotId)],
);

/**
 * Métré : chaque quantité garde sa valeur, son unité, sa méthode, sa formule, son plan et sa zone
 * d'origine, sa date et son statut. Une mesure non vérifiée n'est jamais présentée comme certaine.
 */
export const measurement = pgTable(
  "measurement",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    lotId: uuid("lot_id").references(() => projectLot.id, { onDelete: "set null" }),
    workItemId: uuid("work_item_id").references(() => workItem.id, { onDelete: "set null" }),
    drawingId: uuid("drawing_id").references(() => drawing.id, { onDelete: "set null" }),
    zoneRef: text("zone_ref"),
    label: text("label").notNull(),
    method: measureMethodEnum("method").notNull(),
    /** Formule déterministe et ses entrées (calculées côté serveur, vérifiables). */
    formula: text("formula"),
    inputs: jsonb("inputs").$type<Record<string, string>>().notNull().default({}),
    quantity: qty("quantity"),
    unit: text("unit").notNull(),
    source: measureSourceEnum("source").notNull(),
    status: validationStatusEnum("status").notNull().default("a_verifier"),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    notes: text("notes"),
    /** Confiance déterministe d'une mesure proposée (voir shared/metre.ts) ; absente pour une saisie. */
    confidence: measureConfidenceEnum("confidence"),
    /** Origine de chaque entrée : cotes relevées citées, contrôle dans le texte vectoriel, dérivation. */
    inputSources: jsonb("input_sources").$type<MeasureInputSource[]>().notNull().default([]),
    /** Déductions explicites (vides, trémies), soustraites de la quantité brute. */
    deductions: jsonb("deductions").$type<MeasureDeduction[]>().notNull().default([]),
    grossQuantity: qty("gross_quantity"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("measurement_project_idx").on(t.projectId), index("measurement_work_item_idx").on(t.workItemId)],
);

export const cctpDocument = pgTable(
  "cctp_document",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    lotId: uuid("lot_id").references(() => projectLot.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    country: countryEnum("country").notNull(),
    phase: designPhaseEnum("phase").notNull(),
    detailLevel: text("detail_level").notNull().default("standard"),
    /** Références du référentiel retenues pour la rédaction : les seules que le document peut citer. */
    referenceIds: jsonb("reference_ids").$type<string[]>().notNull().default([]),
    status: documentStatusEnum("status").notNull().default("brouillon"),
    currentVersion: integer("current_version").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("cctp_document_project_idx").on(t.projectId)],
);

/** Section du CCTP (chapitre ou article). Le contenu est structuré (blocs), pas du texte mis en forme. */
export const cctpSection = pgTable(
  "cctp_section",
  {
    id: id(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => cctpDocument.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => cctpSection.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    number: text("number").notNull(),
    title: text("title").notNull(),
    kind: text("kind").notNull().default("article"),
    /** Objet de l'article, fixé par le plan : guide sa rédaction et sa relecture. */
    intent: text("intent"),
    content: jsonb("content").$type<unknown[]>().notNull().default([]),
    /** Références techniques citées (identifiants de technical_reference). */
    referenceIds: jsonb("reference_ids").$type<string[]>().notNull().default([]),
    workItemId: uuid("work_item_id").references(() => workItem.id, { onDelete: "set null" }),
    status: sectionStatusEnum("status").notNull().default("a_rediger"),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("cctp_section_document_idx").on(t.documentId, t.position)],
);

export const dpgf = pgTable(
  "dpgf",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    lotId: uuid("lot_id").references(() => projectLot.id, { onDelete: "set null" }),
    cctpDocumentId: uuid("cctp_document_id").references(() => cctpDocument.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    currency: currencyEnum("currency").notNull(),
    /** Taux de taxe applicable selon le régime de l'affaire, saisi : jamais supposé. */
    vatRate: percent("vat_rate"),
    status: documentStatusEnum("status").notNull().default("brouillon"),
    currentVersion: integer("current_version").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("dpgf_project_idx").on(t.projectId)],
);

/** Ligne de DPGF. Montant = quantité × prix unitaire (decimal.js), conservé pour les versions figées. */
export const dpgfLine = pgTable(
  "dpgf_line",
  {
    id: id(),
    dpgfId: uuid("dpgf_id")
      .notNull()
      .references(() => dpgf.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => dpgfLine.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    kind: dpgfLineKindEnum("kind").notNull(),
    code: text("code"),
    lotNumber: text("lot_number"),
    cctpRef: text("cctp_ref"),
    cctpSectionId: uuid("cctp_section_id").references(() => cctpSection.id, { onDelete: "set null" }),
    workItemId: uuid("work_item_id").references(() => workItem.id, { onDelete: "set null" }),
    designation: text("designation").notNull(),
    description: text("description"),
    unit: text("unit"),
    quantity: qty("quantity"),
    unitPrice: qty("unit_price"),
    amount: money("amount"),
    measurementId: uuid("measurement_id").references(() => measurement.id, { onDelete: "set null" }),
    quantitySource: text("quantity_source"),
    priceItemId: uuid("price_item_id").references(() => priceItem.id, { onDelete: "set null" }),
    priceSource: text("price_source"),
    status: lineStatusEnum("status").notNull().default("non_chiffre"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("dpgf_line_dpgf_idx").on(t.dpgfId, t.position), index("dpgf_line_work_item_idx").on(t.workItemId)],
);

/**
 * Sous-détail de prix. Assiettes explicites : frais généraux, aléas et marge déclarent chacun
 * leur base (déboursé sec, déboursé total ou prix de revient) pour ne rien compter deux fois.
 */
export const priceBreakdown = pgTable(
  "price_breakdown",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    dpgfLineId: uuid("dpgf_line_id").references(() => dpgfLine.id, { onDelete: "set null" }),
    workItemId: uuid("work_item_id").references(() => workItem.id, { onDelete: "set null" }),
    designation: text("designation").notNull(),
    unit: text("unit").notNull(),
    currency: currencyEnum("currency").notNull(),
    overheadRate: percent("overhead_rate"),
    overheadBase: rateBaseEnum("overhead_base").notNull().default("debourse_total"),
    contingencyRate: percent("contingency_rate"),
    contingencyBase: rateBaseEnum("contingency_base").notNull().default("debourse_total"),
    marginRate: percent("margin_rate"),
    marginMode: marginModeEnum("margin_mode").notNull().default("taux_de_marge"),
    /** Prix de vente unitaire calculé, recopié dans la DPGF après validation. */
    computedUnitPrice: qty("computed_unit_price"),
    locked: boolean("locked").notNull().default(false),
    status: documentStatusEnum("status").notNull().default("brouillon"),
    currentVersion: integer("current_version").notNull().default(0),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("price_breakdown_project_idx").on(t.projectId), index("price_breakdown_line_idx").on(t.dpgfLineId)],
);

export const priceBreakdownComponent = pgTable(
  "price_breakdown_component",
  {
    id: id(),
    breakdownId: uuid("breakdown_id")
      .notNull()
      .references(() => priceBreakdown.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    category: componentCategoryEnum("category").notNull(),
    designation: text("designation").notNull(),
    unit: text("unit").notNull(),
    /** Consommation par unité d'ouvrage (ou temps unitaire pour la main-d'œuvre). */
    quantity: fine("quantity").notNull(),
    unitCost: qty("unit_cost"),
    lossRate: percent("loss_rate"),
    /** Rendement, effectif, durée… : chacun avec sa source ou marqué comme hypothèse. */
    details: jsonb("details").$type<Record<string, string>>().notNull().default({}),
    isHypothesis: boolean("is_hypothesis").notNull().default(true),
    priceItemId: uuid("price_item_id").references(() => priceItem.id, { onDelete: "set null" }),
    supplierId: uuid("supplier_id").references(() => supplier.id, { onDelete: "set null" }),
    sourceNote: text("source_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("price_breakdown_component_breakdown_idx").on(t.breakdownId, t.position)],
);

/** Version figée d'un document : instantané complet, jamais modifié après création. */
export const documentVersion = pgTable(
  "document_version",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    documentType: documentTypeEnum("document_type").notNull(),
    documentId: uuid("document_id").notNull(),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    note: text("note"),
    validated: boolean("validated").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("document_version_unique_idx").on(t.documentType, t.documentId, t.version), index("document_version_project_idx").on(t.projectId)],
);

/** Contrôle indépendant d'un dossier : corrections appliquées aux erreurs calculables, anomalies restantes. */
export const dossierAudit = pgTable(
  "dossier_audit",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    jobId: uuid("job_id"),
    summary: jsonb("summary").$type<AuditSummary>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("dossier_audit_project_idx").on(t.projectId, t.createdAt)],
);

/**
 * Déclaration de validation d'un dossier par un professionnel : nom, qualité, texte de la déclaration et
 * versions des documents validés. La plateforme ne certifie pas la qualification du signataire.
 */
export const dossierValidation = pgTable(
  "dossier_validation",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    signedBy: text("signed_by").notNull(),
    qualification: text("qualification").notNull(),
    statement: text("statement").notNull(),
    documents: jsonb("documents").$type<Array<{ type: string; id: string; title: string; version: number }>>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index("dossier_validation_project_idx").on(t.projectId, t.createdAt)],
);
