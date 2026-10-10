/** Fichiers sources (stockés dans le compartiment privé), plans et annotations. */
import { bigint, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./columns.js";
import { drawingKindEnum, fileKindEnum, fileStatusEnum, validationStatusEnum } from "./enums.js";
import { project } from "./projects.js";

/**
 * Fichier déposé. Les octets vivent dans le stockage objet (clé `storageKey`), jamais dans `public/`.
 * `projectId` nul : document de bibliothèque (bordereau de prix, catalogue…).
 */
export const sourceFile = pgTable(
  "source_file",
  {
    id: id(),
    projectId: uuid("project_id").references(() => project.id, { onDelete: "cascade" }),
    kind: fileKindEnum("kind").notNull(),
    originalName: text("original_name").notNull(),
    /** Type MIME vérifié sur la signature binaire, pas celui annoncé par le navigateur. */
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: text("sha256"),
    storageKey: text("storage_key").notNull().unique(),
    status: fileStatusEnum("status").notNull().default("en_attente"),
    pageCount: integer("page_count"),
    /** Texte extrait (PDF vectoriel, DOCX…), pour la recherche et les agents. */
    extractedText: text("extracted_text"),
    error: text("error"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("source_file_project_idx").on(t.projectId), index("source_file_sha_idx").on(t.sha256)],
);

/** Planche ou page de plan, avec son étalonnage et ce qui en a été extrait. */
export const drawing = pgTable(
  "drawing",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    sourceFileId: uuid("source_file_id")
      .notNull()
      .references(() => sourceFile.id, { onDelete: "cascade" }),
    pageNumber: integer("page_number").notNull().default(1),
    sheetNumber: text("sheet_number"),
    title: text("title"),
    kind: drawingKindEnum("kind").notNull().default("autre"),
    level: text("level"),
    /** Échelle telle qu'écrite sur le plan (ex. « 1/100 »). */
    scaleText: text("scale_text"),
    /** Indice ou révision du plan, tel qu'écrit dans le cartouche. */
    revision: text("revision"),
    /** Couche texte vectorielle de la page : nombre de textes, de nombres, échelles lues. */
    textLayer: jsonb("text_layer").$type<{ items: number; numbers: number; scales: number[] } | null>(),
    /** Échelle numérique, seulement si lue ou confirmée (100 pour 1/100). */
    scaleRatio: numeric("scale_ratio", { precision: 12, scale: 4 }),
    /** Étalonnage : correspondance pixels / mètres établie sur une cote connue. */
    calibration: jsonb("calibration").$type<{ pixelsPerMeter: string; reference: string } | null>(),
    /** Résultat structuré de l'extraction (cartouche, cotes, légendes…), validé par schéma. */
    extraction: jsonb("extraction"),
    status: validationStatusEnum("status").notNull().default("a_verifier"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("drawing_page_idx").on(t.sourceFileId, t.pageNumber), index("drawing_project_idx").on(t.projectId)],
);

/** Zone, mesure ou note posée sur un plan. Géométrie en coordonnées de la page. */
export const drawingAnnotation = pgTable(
  "drawing_annotation",
  {
    id: id(),
    drawingId: uuid("drawing_id")
      .notNull()
      .references(() => drawing.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    label: text("label"),
    geometry: jsonb("geometry").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("drawing_annotation_drawing_idx").on(t.drawingId)],
);
