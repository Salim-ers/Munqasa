/**
 * Sous-détail de prix : calcul exact (décimal) du déboursé, des frais et du prix de vente.
 *
 *   coût d'un composant  = consommation × coût unitaire × (1 + pertes)
 *   déboursé sec (DS)    = matériaux + main-d'œuvre + matériel + sous-traitance + transport
 *   déboursé total (DT)  = DS + frais de chantier
 *   prix de revient (PR) = DT + frais généraux + aléas, chacun sur son assiette (DS, DT ou PR)
 *   prix de vente (PV)   = PR × (1 + marge) | PR ÷ (1 − marque) | PR × coefficient
 *
 * Une assiette « prix de revient » rend le calcul circulaire : il est résolu algébriquement,
 * PR = (DT + frais sur DS ou DT) ÷ (1 − somme des taux sur PR). Sans taux saisi, PV = déboursé.
 */
import { sql } from "drizzle-orm";
import type { ComponentCategory, MarginMode, RateBase } from "../../shared/enums.js";
import type { Database } from "../db/index.js";
import { Dec } from "./decimal.js";

export interface PricedComponent {
  category: ComponentCategory;
  quantity: string;
  unitCost: string | null;
  lossRate: string | null;
}

export interface PricingRates {
  overheadRate: string | null;
  overheadBase: RateBase;
  contingencyRate: string | null;
  contingencyBase: RateBase;
  marginRate: string | null;
  marginMode: MarginMode;
}

export interface BreakdownResult {
  /** Tous les composants ont un coût unitaire : le prix de vente est calculable. */
  complete: boolean;
  componentTotals: Array<string | null>;
  debourseSec: string;
  fraisChantier: string;
  debourseTotal: string;
  overhead: string;
  contingency: string;
  prixDeRevient: string;
  margin: string;
  /** Prix de vente unitaire arrondi au centime, ou null si un coût manque. */
  prixDeVente: string | null;
}

export class PricingError extends Error {}

const rate = (value: string | null) => (value === null || value === "" ? new Dec(0) : new Dec(value).div(100));

export function componentTotal(c: PricedComponent): Dec | null {
  if (c.unitCost === null) return null;
  return new Dec(c.quantity).times(c.unitCost).times(new Dec(1).plus(rate(c.lossRate)));
}

export function computeBreakdown(components: PricedComponent[], rates: PricingRates): BreakdownResult {
  const totals = components.map(componentTotal);
  let ds = new Dec(0);
  let fc = new Dec(0);
  components.forEach((c, i) => {
    const total = totals[i];
    if (!total) return;
    if (c.category === "frais_chantier") fc = fc.plus(total);
    else ds = ds.plus(total);
  });
  const dt = ds.plus(fc);
  const fg = rate(rates.overheadRate);
  const al = rate(rates.contingencyRate);
  const baseValue = (base: RateBase) => (base === "debourse_sec" ? ds : dt);
  const onPr = (rates.overheadBase === "prix_de_revient" ? fg : new Dec(0)).plus(rates.contingencyBase === "prix_de_revient" ? al : new Dec(0));
  if (onPr.gte(1)) throw new PricingError("Les taux appliqués au prix de revient atteignent 100 % : calcul impossible.");
  const known = dt
    .plus(rates.overheadBase === "prix_de_revient" ? 0 : fg.times(baseValue(rates.overheadBase)))
    .plus(rates.contingencyBase === "prix_de_revient" ? 0 : al.times(baseValue(rates.contingencyBase)));
  const pr = known.div(new Dec(1).minus(onPr));
  const overhead = fg.times(rates.overheadBase === "prix_de_revient" ? pr : baseValue(rates.overheadBase));
  const contingency = al.times(rates.contingencyBase === "prix_de_revient" ? pr : baseValue(rates.contingencyBase));

  let pv: Dec;
  const m = rates.marginRate === null || rates.marginRate === "" ? null : new Dec(rates.marginRate);
  if (m === null) pv = pr;
  else if (rates.marginMode === "taux_de_marque") {
    if (m.gte(100)) throw new PricingError("Un taux de marque doit rester inférieur à 100 %.");
    pv = pr.div(new Dec(1).minus(m.div(100)));
  } else if (rates.marginMode === "coefficient") pv = pr.times(m);
  else pv = pr.times(new Dec(1).plus(m.div(100)));

  const complete = components.length > 0 && totals.every((t) => t !== null);
  const fixed = (d: Dec, places = 4) => d.toDecimalPlaces(places).toFixed(places);
  return {
    complete,
    componentTotals: totals.map((t) => (t ? fixed(t) : null)),
    debourseSec: fixed(ds),
    fraisChantier: fixed(fc),
    debourseTotal: fixed(dt),
    overhead: fixed(overhead),
    contingency: fixed(contingency),
    prixDeRevient: fixed(pr),
    margin: fixed(pv.minus(pr)),
    prixDeVente: complete ? fixed(pv, 2) : null,
  };
}

/* ---------- Recherche de prix candidats dans la bibliothèque ---------- */

export interface PriceCandidate {
  id: string;
  designation: string;
  kind: string;
  unit: string;
  unitPrice: string;
  currency: string;
  priceDate: string;
  origin: string;
  verified: boolean;
}

/** Mots utiles d'une désignation (sans articles ni chiffres isolés). */
function keywords(text: string): string[] {
  const stop = new Set(["les", "des", "pour", "avec", "sans", "dans", "sur", "une", "par", "aux", "est", "son", "ses", "compris", "toutes", "tous", "type", "selon"]);
  return [
    ...new Set(
      text
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 3 && !stop.has(w) && !/^\d+$/.test(w)),
    ),
  ].slice(0, 12);
}

/**
 * Prix de la bibliothèque proches d'une désignation : même devise et même pays, non archivés,
 * non rejetés, classés par pertinence (recherche plein texte en français, à défaut par mots).
 */
export async function findCandidates(db: Database, params: { text: string; currency: string; country: string; limit?: number }): Promise<PriceCandidate[]> {
  const words = keywords(params.text);
  if (words.length === 0) return [];
  const limit = params.limit ?? 25;
  const query = words.join(" or ");
  const result = (await db.execute(sql`
    select id, designation, kind, unit, unit_price as "unitPrice", currency, price_date as "priceDate", origin, verification_status = 'verifie' as verified,
      ts_rank(to_tsvector('french', unaccent_text), websearch_to_tsquery('french', ${query})) as rank
    from (
      select *, translate(lower(designation || ' ' || coalesce(sub_family, '') || ' ' || coalesce(trade_family, '')),
        'àâäéèêëîïôöùûüç', 'aaaeeeeiioouuuc') as unaccent_text
      from price_item
      where archived_at is null and verification_status <> 'rejete' and currency = ${params.currency} and country = ${params.country}
    ) candidates
    where to_tsvector('french', unaccent_text) @@ websearch_to_tsquery('french', ${query})
    order by rank desc, price_date desc
    limit ${limit}
  `)) as unknown as { rows: PriceCandidate[] };
  return result.rows.map((r) => ({ ...r, unitPrice: String(r.unitPrice), priceDate: String(r.priceDate).slice(0, 10) }));
}
