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
import { type SQL, sql } from "drizzle-orm";
import type { ComponentCategory, MarginMode, PriceScope, RateBase, Reliability, TaxBasis } from "../../shared/enums.js";
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

/** Prix hors taxes exact (4 décimales) ; null pour un prix TTC dont le taux de TVA n'est pas connu. */
export function exclTax(unitPrice: string, taxBasis: TaxBasis | null, vatRate: string | null): string | null {
  if (taxBasis !== "TTC") return new Dec(unitPrice).toDecimalPlaces(4).toFixed(4);
  if (vatRate === null || vatRate === "") return null;
  return new Dec(unitPrice).div(new Dec(1).plus(new Dec(vatRate).div(100))).toDecimalPlaces(4).toFixed(4);
}

export interface PriceCandidate {
  id: string;
  designation: string;
  kind: string;
  unit: string;
  /** Prix tel que publié par sa source (HT ou TTC). */
  unitPrice: string;
  /** Prix hors taxes : égal au prix publié, ou prix TTC ramené HT avec le taux de TVA qu'il inclut. */
  unitPriceHt: string;
  taxBasis: TaxBasis | null;
  vatRate: string | null;
  currency: string;
  priceDate: string;
  period: string | null;
  origin: string;
  scope: PriceScope | null;
  reliability: Reliability | null;
  zone: string | null;
  sourceName: string | null;
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

const ACCENTS = "àâäéèêëîïôöùûüçœ";
const PLAIN = "aaaeeeeiioouuuco";
/** Texte comparable en SQL : minuscules, sans accents. */
const fold = (expr: SQL) => sql`translate(lower(${expr}), ${ACCENTS}, ${PLAIN})`;

/** Ligne de DPGF : seuls les prix d'ouvrage (fourniture et pose, ouvrage complet) s'appliquent tels quels. */
const lineScope = sql`(price_scope in ('fourniture_pose', 'ouvrage_complet') or (price_scope is null and kind in ('ouvrage', 'sous_traitance')))`;

/**
 * Prix de la bibliothèque proches d'une désignation : même devise et même pays, non archivés, non rejetés,
 * jamais un ratio d'opération. Classement par pertinence (recherche plein texte en français), puis par
 * proximité : ville de l'affaire, sa région, niveau national, autres zones. Une seule déclinaison par
 * référence (la plus proche, puis la plus récente). Un prix TTC sans taux de TVA connu est écarté.
 */
export async function findCandidates(
  db: Database,
  params: { text: string; currency: string; country: string; city?: string | null; limit?: number; purpose?: "sous_detail" | "ligne" },
): Promise<PriceCandidate[]> {
  const words = keywords(params.text);
  if (words.length === 0) return [];
  const limit = params.limit ?? 25;
  const query = words.join(" or ");
  const city = (params.city ?? "").trim();
  let region = "";
  if (city) {
    const found = (await db.execute(sql`
      select region from price_item
      where country = ${params.country} and region is not null and city is not null
        and (${fold(sql`city`)} = ${fold(sql`${city}::text`)} or ${fold(sql`city`)} like '% ' || ${fold(sql`${city}::text`)})
      limit 1
    `)) as unknown as { rows: Array<{ region: string }> };
    region = found.rows[0]?.region ?? "";
  }
  const locality = sql`case
      when ${city}::text <> '' and city is not null and (${fold(sql`city`)} = ${fold(sql`${city}::text`)} or ${fold(sql`city`)} like '% ' || ${fold(sql`${city}::text`)}) then 0
      when ${region}::text <> '' and city is null and region = ${region}::text then 1
      when region is null and city is null then 2
      else 3 end`;
  const result = (await db.execute(sql`
    with candidates as (
      select *, translate(lower(designation || ' ' || coalesce(sub_family, '') || ' ' || coalesce(trade_family, '')), ${ACCENTS}, ${PLAIN}) as unaccent_text, ${locality} as locality
      from price_item
      where archived_at is null and verification_status <> 'rejete' and kind <> 'ratio'
        and currency = ${params.currency} and country = ${params.country}
        and (tax_basis is distinct from 'TTC' or vat_rate is not null)
        ${params.purpose === "ligne" ? sql`and ${lineScope}` : sql``}
    ), ranked as (
      select c.*, ts_rank(to_tsvector('french', unaccent_text), websearch_to_tsquery('french', ${query})) as rank,
        row_number() over (partition by coalesce(c.group_key, c.id::text) order by c.locality, c.price_date desc) as rn
      from candidates c
      where to_tsvector('french', unaccent_text) @@ websearch_to_tsquery('french', ${query})
    )
    select r.id, r.designation, r.kind, r.unit, r.unit_price as "unitPrice", r.tax_basis as "taxBasis", r.vat_rate as "vatRate", r.currency,
      r.price_date as "priceDate", r.period, r.origin, r.price_scope as scope, r.reliability, coalesce(r.city, r.region) as zone,
      ps.name as "sourceName", r.verification_status = 'verifie' as verified
    from ranked r left join price_source ps on ps.id = r.source_id
    where r.rn = 1
    order by r.rank desc, r.locality, r.price_date desc
    limit ${limit}
  `)) as unknown as { rows: Array<Omit<PriceCandidate, "unitPriceHt">> };
  return result.rows.map((r) => {
    const vatRate = r.vatRate === null ? null : String(r.vatRate);
    return {
      ...r,
      unitPrice: String(r.unitPrice),
      vatRate,
      // Les prix TTC sans taux sont écartés par la requête : le prix HT est toujours calculable.
      unitPriceHt: exclTax(String(r.unitPrice), r.taxBasis, vatRate)!,
      priceDate: String(r.priceDate).slice(0, 10),
    };
  });
}

/** Mention de provenance d'un coût tiré de la bibliothèque, conversion TTC comprise. */
export function candidateNote(c: Pick<PriceCandidate, "designation" | "zone" | "period" | "priceDate" | "taxBasis" | "vatRate">): string {
  const when = c.period ? `valeur ${c.period}` : `relevé le ${c.priceDate.split("-").reverse().join("/")}`;
  const tax = c.taxBasis === "TTC" && c.vatRate ? `, prix TTC ramené HT avec la TVA de ${Number(c.vatRate)} % qu’il inclut` : "";
  return `Prix : ${c.designation}${c.zone ? `, ${c.zone}` : ""}, ${when}${tax}`;
}
