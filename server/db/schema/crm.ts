/** Clients et prospects. */
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./columns.js";
import { countryEnum, prospectStatusEnum, sectorEnum } from "./enums.js";

export const client = pgTable(
  "client",
  {
    id: id(),
    name: text("name").notNull(),
    sector: sectorEnum("sector").notNull(),
    legalForm: text("legal_form"),
    country: countryEnum("country").notNull(),
    city: text("city"),
    address: text("address"),
    contactName: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    legalIds: jsonb("legal_ids").$type<Record<string, string>>().notNull().default({}),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("client_name_idx").on(t.name), index("client_country_idx").on(t.country)],
);

export const prospect = pgTable(
  "prospect",
  {
    id: id(),
    name: text("name").notNull(),
    company: text("company"),
    country: countryEnum("country").notNull(),
    city: text("city"),
    email: text("email"),
    phone: text("phone"),
    source: text("source"),
    status: prospectStatusEnum("status").notNull().default("nouveau"),
    notes: text("notes"),
    convertedClientId: uuid("converted_client_id").references(() => client.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("prospect_status_idx").on(t.status)],
);
