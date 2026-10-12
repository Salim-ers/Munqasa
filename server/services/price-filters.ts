/**
 * Filtres de la bibliothèque de prix, communs à la liste, aux exports et aux contrôles : les paramètres
 * d'adresse (en français) sont validés un par un, une valeur inconnue est ignorée.
 */
import { and, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import {
  COUNTRIES,
  CURRENCIES,
  type Country,
  type Currency,
  PRICE_KINDS,
  PRICE_SCOPES,
  PRICE_VALUE_STATUSES,
  type PriceKind,
  type PriceScope,
  type PriceValueStatus,
  RELIABILITY_LEVELS,
  type Reliability,
  VALIDATION_STATUSES,
  type ValidationStatus,
} from "../../shared/enums.js";
import { LOT_PRICE_SCOPES } from "../../shared/lots.js";
import { TRADE_KEYS } from "../../shared/trades.js";
import { schema } from "../db/index.js";

export interface PriceFilters {
  q?: string | null;
  country?: Country | null;
  currency?: Currency | null;
  kind?: PriceKind | null;
  status?: ValidationStatus | null;
  archived?: boolean;
  /** Clé d'une source publique, ou « personnel » pour vos propres prix. */
  source?: string | null;
  region?: string | null;
  city?: string | null;
  reliability?: Reliability | null;
  scope?: PriceScope | null;
  valueStatus?: PriceValueStatus | null;
  tradeFamily?: string | null;
  /** Lot de la nomenclature par défaut (« 17 ») : famille et sous-familles de prix qui lui sont rattachées. */
  lot?: string | null;
  minPrice?: string | null;
  maxPrice?: string | null;
  since?: string | null;
  /** Prix historiques à cette date (seuil d'ancienneté des paramètres d'alerte). */
  staleBefore?: string | null;
}

/**
 * Prix historique au seuil donné : date de valeur antérieure ; pour une valeur réglementaire, en vigueur
 * jusqu'à son remplacement, dernière vérification contre sa source antérieure.
 */
export function historicalSql(before: string): SQL {
  const p = schema.priceItem;
  return sql`(case when ${p.regulated} then coalesce((${p.verifiedAt})::date, ${p.priceDate}) < ${before}::date else ${p.priceDate} < ${before}::date end)`;
}

/** Date limite d'ancienneté pour un seuil en mois. */
export function historicalLimit(months: number, today = new Date()): string {
  const limit = new Date(today);
  limit.setMonth(limit.getMonth() - months);
  return limit.toISOString().slice(0, 10);
}

const pick = <T extends string>(value: string | undefined, allowed: readonly T[]): T | null => (value && (allowed as readonly string[]).includes(value) ? (value as T) : null);
const text = (value: string | undefined, max = 120) => value?.trim().slice(0, max) || null;
const amount = (value: string | undefined) => {
  const v = value?.replace(/\s/g, "").replace(",", ".");
  return v && /^\d{1,16}(\.\d{1,4})?$/.test(v) ? v : null;
};
const isoDate = (value: string | undefined) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);

/** Filtres lus dans les paramètres d'adresse ; « anciens » demande le seuil d'ancienneté en mois. */
export function parsePriceFilters(q: Record<string, string | undefined>, staleMonths?: number): PriceFilters {
  const staleBefore = q.anciens === "1" && staleMonths ? historicalLimit(staleMonths) : null;
  return {
    q: text(q.q, 200),
    country: pick(q.pays, COUNTRIES),
    currency: pick(q.devise, CURRENCIES),
    kind: pick(q.nature, PRICE_KINDS),
    status: pick(q.statut, VALIDATION_STATUSES),
    archived: q.archives === "1",
    source: q.source === "personnel" ? "personnel" : text(q.source, 60),
    region: text(q.region),
    city: text(q.ville),
    reliability: pick(q.fiabilite, RELIABILITY_LEVELS),
    scope: pick(q.portee, PRICE_SCOPES),
    valueStatus: pick(q.valeur, PRICE_VALUE_STATUSES),
    tradeFamily: pick(q.famille, TRADE_KEYS),
    lot: q.lot && LOT_PRICE_SCOPES[q.lot] ? q.lot : null,
    minPrice: amount(q.min),
    maxPrice: amount(q.max),
    since: isoDate(q.depuis),
    staleBefore,
  };
}

export function priceWhere(f: PriceFilters): SQL {
  const p = schema.priceItem;
  const where: SQL[] = [f.archived ? isNotNull(p.archivedAt) : isNull(p.archivedAt)];
  if (f.q) {
    const like = `%${f.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    where.push(or(ilike(p.designation, like), ilike(p.code, like), ilike(p.subFamily, like), ilike(p.city, like), ilike(p.region, like))!);
  }
  if (f.country) where.push(eq(p.country, f.country));
  if (f.currency) where.push(eq(p.currency, f.currency));
  if (f.kind) where.push(eq(p.kind, f.kind));
  if (f.status) where.push(eq(p.verificationStatus, f.status));
  if (f.source === "personnel") where.push(isNull(p.sourceId));
  else if (f.source) where.push(sql`${p.sourceId} = (select id from price_source where key = ${f.source})`);
  if (f.region) where.push(sql`lower(${p.region}) = lower(${f.region})`);
  if (f.city) where.push(sql`lower(${p.city}) = lower(${f.city})`);
  if (f.reliability) where.push(eq(p.reliability, f.reliability));
  if (f.scope) where.push(eq(p.priceScope, f.scope));
  if (f.valueStatus) where.push(eq(p.valueStatus, f.valueStatus));
  if (f.tradeFamily) where.push(eq(p.tradeFamily, f.tradeFamily));
  if (f.lot) {
    const scope = LOT_PRICE_SCOPES[f.lot]!;
    where.push(eq(p.tradeFamily, scope.tradeFamily));
    if (scope.subFamilies) where.push(scope.nonClasses ? or(inArray(p.subFamily, scope.subFamilies), isNull(p.subFamily))! : inArray(p.subFamily, scope.subFamilies));
  }
  if (f.minPrice) where.push(gte(p.unitPrice, f.minPrice));
  if (f.maxPrice) where.push(lte(p.unitPrice, f.maxPrice));
  if (f.since) where.push(gte(p.priceDate, f.since));
  if (f.staleBefore) where.push(historicalSql(f.staleBefore));
  return and(...where)!;
}
