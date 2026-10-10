/**
 * Bibliothèque de prix : règles partagées par le serveur, les exports et l'interface.
 *
 * Fiabilité (indépendante de l'ancienneté, signalée à part) :
 * - haute : moyenne ou médiane publiée par un organisme public, ou médiane calculée sur au moins
 *   100 observations dont l'écart interquartile reste resserré (troisième quartile au plus le double du premier) ;
 * - moyenne : médiane calculée sur au moins 30 observations, quartiles dans un rapport de 3 au plus ;
 * - faible : moins de 30 observations ou dispersion plus forte.
 * Prix saisis ou importés par l'utilisateur : fiabilité par défaut selon la provenance, modifiable.
 */
import type { Country, Currency, PriceKind, PriceOrigin, PriceScope, PriceValueStatus, Reliability, TaxBasis } from "./enums.js";

/** Référence normalisée produite par le lecteur d'une source publique. */
export interface SourceRecord {
  /** Clé stable dans la source : une même clé désigne toujours la même référence. */
  externalKey: string;
  /** Regroupe les déclinaisons d'une même référence (zones, années) pour les comparer. */
  groupKey: string;
  designation: string;
  description: string;
  kind: PriceKind;
  scope: PriceScope;
  unit: string;
  unitPrice: string;
  currency: Currency;
  country: Country;
  region: string | null;
  city: string | null;
  tradeFamily: string | null;
  subFamily: string | null;
  taxBasis: TaxBasis | null;
  vatRate: string | null;
  valueStatus: PriceValueStatus;
  priceDate: string;
  period: string;
  priceMin: string | null;
  priceMax: string | null;
  sampleSize: number | null;
  aggregation: string;
  reliability: Reliability;
  series: Record<string, number> | null;
  sourceRef: string;
  sourceUrl: string;
  attributes: Record<string, string>;
}

/** Ressource suivie d'une source : adresse, empreinte et date de lecture. */
export interface SourceResource {
  url: string;
  title: string;
  sha256: string | null;
  size: number | null;
  fetchedAt: string | null;
}

export interface BatchStats {
  lues?: number;
  nouvelles?: number;
  modifiees?: number;
  inchangees?: number;
  quarantaine?: number;
  rejetees?: number;
  absentes?: number;
  publiees?: number;
}

/** Valeur publiée remplacée par un lot : de quoi la rétablir à l'identique. */
export interface PreviousValue {
  unitPrice: string;
  unit: string;
  priceDate: string;
  period: string | null;
  priceMin: string | null;
  priceMax: string | null;
  sampleSize: number | null;
  series: Record<string, number> | null;
  archivedAt: string | null;
}

export function reliabilityFromStats(params: { official: boolean; sampleSize: number | null; q1?: number | null; q3?: number | null }): Reliability {
  if (params.official) return "haute";
  const n = params.sampleSize ?? 0;
  const spread = params.q1 && params.q3 && params.q1 > 0 ? params.q3 / params.q1 : Number.POSITIVE_INFINITY;
  if (n >= 100 && spread <= 2) return "haute";
  if (n >= 30 && spread <= 3) return "moyenne";
  return "faible";
}

/** Fiabilité proposée pour un prix saisi ou importé, selon sa provenance. */
export function defaultReliability(origin: PriceOrigin): Reliability {
  if (origin === "devis_fournisseur" || origin === "facture_fournisseur" || origin === "base_sous_licence") return "haute";
  if (origin === "dpgf_historique" || origin === "bordereau_historique" || origin === "catalogue" || origin === "donnees_publiques") return "moyenne";
  return "faible";
}

/** Prix hors taxes : un prix TTC est ramené HT avec le taux de TVA qu'il inclut, jamais deviné. */
export function priceExclTax(unitPrice: string | number, taxBasis: TaxBasis | null, vatRate: string | number | null): number | null {
  const value = Number(unitPrice);
  if (!Number.isFinite(value)) return null;
  if (taxBasis !== "TTC") return value;
  const rate = vatRate === null || vatRate === "" ? Number.NaN : Number(vatRate);
  if (!Number.isFinite(rate)) return null;
  return value / (1 + rate / 100);
}

/** Un prix plus ancien que le seuil (en mois) est signalé comme ancien. */
export function isStalePrice(priceDate: string, months: number | null | undefined, today = new Date()): boolean {
  if (!months) return false;
  const limit = new Date(today);
  limit.setMonth(limit.getMonth() - months);
  return priceDate < limit.toISOString().slice(0, 10);
}

/** Seuls ces prix peuvent chiffrer directement une ligne de DPGF ; les autres servent aux sous-détails. */
export function appliesToDpgfLine(price: { kind: PriceKind; priceScope: PriceScope | null }): boolean {
  // Un ratio d'opération (coût au m² d'un programme entier) sert à l'estimation, jamais à une ligne.
  if (price.kind === "ratio") return false;
  if (price.priceScope) return price.priceScope === "fourniture_pose" || price.priceScope === "ouvrage_complet";
  return price.kind === "ouvrage" || price.kind === "sous_traitance";
}
