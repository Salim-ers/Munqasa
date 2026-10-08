/** Contrôle qualité, journal d'audit, notifications. */
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./columns.js";
import { documentTypeEnum, issueCategoryEnum, issueSeverityEnum, issueStatusEnum, notificationKindEnum } from "./enums.js";
import { project } from "./projects.js";

/** Anomalie relevée par le contrôle qualité. Une anomalie bloquante ouverte empêche l'état « Définitif ». */
export const qualityIssue = pgTable(
  "quality_issue",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    documentType: documentTypeEnum("document_type"),
    documentId: uuid("document_id"),
    severity: issueSeverityEnum("severity").notNull(),
    category: issueCategoryEnum("category").notNull(),
    message: text("message").notNull(),
    /** Éléments concernés (identifiants de lignes, sections, mesures…). */
    targets: jsonb("targets").$type<Array<{ type: string; id: string }>>().notNull().default([]),
    status: issueStatusEnum("status").notNull().default("ouverte"),
    resolutionNote: text("resolution_note"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("quality_issue_project_idx").on(t.projectId, t.status)],
);

/** Journal d'audit : qui, quoi, quand, d'où. Jamais modifié. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    actorUserId: text("actor_user_id"),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    details: jsonb("details").notNull().default({}),
  },
  (t) => [index("audit_log_occurred_idx").on(t.occurredAt), index("audit_log_action_idx").on(t.action)],
);

export const notification = pgTable(
  "notification",
  {
    id: id(),
    kind: notificationKindEnum("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    projectId: uuid("project_id").references(() => project.id, { onDelete: "cascade" }),
    link: text("link"),
    /** Clé d'unicité des notifications automatiques (ex. « remise:<id>:J-3 ») : jamais deux fois le même rappel. */
    dedupeKey: text("dedupe_key"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notification_unread_idx").on(t.readAt, t.createdAt), uniqueIndex("notification_dedupe_idx").on(t.dedupeKey)],
);
