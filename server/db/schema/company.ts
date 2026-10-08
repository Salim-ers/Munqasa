/** Entreprise émettrice et réglages applicatifs. */
import { boolean, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createdAt, id, percent, updatedAt } from "./columns.js";
import { countryEnum, currencyEnum } from "./enums.js";

/** Identité de l'entreprise (une ligne par entité émettrice : Maroc, France…). */
export const companyProfile = pgTable(
  "company_profile",
  {
    id: id(),
    /** Nom court affiché dans l'application. */
    label: text("label").notNull(),
    legalName: text("legal_name").notNull(),
    tradeName: text("trade_name"),
    legalForm: text("legal_form"),
    country: countryEnum("country").notNull(),
    address: text("address"),
    city: text("city"),
    postalCode: text("postal_code"),
    email: text("email"),
    phone: text("phone"),
    website: text("website"),
    /** Identifiants légaux selon le pays (ICE, RC, IF, patente / SIREN, SIRET, TVA intracommunautaire…). */
    legalIds: jsonb("legal_ids").$type<Record<string, string>>().notNull().default({}),
    defaultCurrency: currencyEnum("default_currency").notNull(),
    /** Taux de TVA par défaut de l'entité, jamais supposé : saisi par l'administrateur. */
    defaultVatRate: percent("default_vat_rate"),
    /** Mentions légales à faire figurer sur les devis (texte libre, propre à l'entité). */
    quoteLegalMentions: text("quote_legal_mentions"),
    paymentTerms: text("payment_terms"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("company_profile_country_idx").on(t.country)],
);

/** Réglages clé / valeur (identité documentaire, paramètres IA, plafonds…), validés par Zod côté serveur. */
export const appSetting = pgTable("app_setting", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
