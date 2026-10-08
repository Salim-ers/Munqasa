/**
 * Colonnes communes. Montants, quantités et prix unitaires en numeric (précision fixe) :
 * le pilote les rend en chaînes, les calculs passent par decimal.js (server/services/decimal.ts).
 */
import { numeric, timestamp, uuid } from "drizzle-orm/pg-core";

export const id = () => uuid("id").primaryKey().defaultRandom();

export const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** Montant : 2 décimales (monnaie). */
export const money = (name: string) => numeric(name, { precision: 20, scale: 2 });

/** Quantité, consommation, prix unitaire : 4 décimales. */
export const qty = (name: string) => numeric(name, { precision: 20, scale: 4 });

/** Coefficient ou consommation fine : 6 décimales. */
export const fine = (name: string) => numeric(name, { precision: 20, scale: 6 });

/** Taux en pourcentage (ex. 20.0000 pour 20 %). */
export const percent = (name: string) => numeric(name, { precision: 9, scale: 4 });

/** Taux de change. */
export const fxRate = (name: string) => numeric(name, { precision: 20, scale: 10 });
