/**
 * « Prix des carburants en France, flux instantané » (DGCCRF, data.economie.gouv.fr, Licence Ouverte) :
 * prix affichés à la pompe par près de 10 000 stations de France métropolitaine, mis à jour en continu.
 *
 * Seuls les prix mis à jour dans les sept jours précédant le relevé le plus récent du fichier sont retenus,
 * pour ne pas mêler des affichages anciens. Pour le gazole et le sans-plomb 95-E10, carburants des engins et
 * véhicules de chantier, la valeur est la médiane des stations de chaque région et de la France
 * métropolitaine, avec ses quartiles. Prix TTC, TVA de 20 % (13 % en Corse, article 297 du code général
 * des impôts) et accise sur les énergies comprises.
 */
import { reliabilityFromStats, type SourceRecord } from "../../../shared/prices.js";
import { csvNumber, decimal, FR_REGIONS, parseDelimited, slug, summarize } from "./common.js";
import type { TextResource } from "./ademe.js";

const FUELS = [
  { key: "gazole", column: "gazole_prix", updated: "gazole_maj", designation: "Gazole, prix à la pompe", label: "gazole" },
  { key: "e10", column: "e10_prix", updated: "e10_maj", designation: "Sans-plomb 95-E10, prix à la pompe", label: "sans-plomb 95-E10" },
] as const;

/** Fenêtre de fraîcheur des prix retenus, en jours avant le relevé le plus récent. */
const WINDOW_DAYS = 7;
/** Bornes de vraisemblance d'un prix au litre : un affichage hors bornes est une erreur de saisie. */
const MIN_PRICE = 0.5;
const MAX_PRICE = 5;
const MIN_STATIONS = 20;

const day = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export function parseCarburants(resource: TextResource): SourceRecord[] {
  const rows = parseDelimited(resource.text, ";");
  const records: SourceRecord[] = [];
  for (const fuel of FUELS) {
    const prices: Array<{ value: number; updated: string; region: string | null }> = [];
    for (const row of rows) {
      const value = csvNumber(row[fuel.column]);
      const updated = (row[fuel.updated] ?? "").slice(0, 10);
      if (value === null || value < MIN_PRICE || value > MAX_PRICE || !/^\d{4}-\d{2}-\d{2}$/.test(updated)) continue;
      prices.push({ value, updated, region: (FR_REGIONS[(row.code_region ?? "").trim()] as string | undefined) ?? null });
    }
    if (prices.length === 0) continue;
    const latest = prices.reduce((max, p) => (p.updated > max ? p.updated : max), "");
    const start = new Date(`${latest}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - WINDOW_DAYS);
    const from = start.toISOString().slice(0, 10);
    const fresh = prices.filter((p) => p.updated >= from);
    const zones = new Map<string | null, number[]>([[null, fresh.map((p) => p.value)]]);
    for (const p of fresh) if (p.region) zones.set(p.region, [...(zones.get(p.region) ?? []), p.value]);
    for (const [region, values] of zones) {
      if (values.length < MIN_STATIONS) continue;
      const stats = summarize(values);
      const vatRate = region === "Corse" ? "13" : "20";
      const where = region ? `région ${region}` : "France métropolitaine";
      records.push({
        externalKey: `carburants:${fuel.key}:${region ? slug(region) : "national"}`,
        groupKey: `carburants:${fuel.key}`,
        designation: fuel.designation,
        description: `Prix médian du ${fuel.label} affiché à la pompe par ${stats.n} stations, ${where}, relevés du ${day(from)} au ${day(latest)}. Prix TTC, TVA de ${vatRate} % et accise sur les énergies comprises ; le prix hors taxes retire la seule TVA, que l’entreprise récupère selon les règles applicables à ses véhicules et engins.`,
        kind: "materiau",
        scope: "fourniture",
        unit: "l",
        unitPrice: decimal(stats.median),
        currency: "EUR",
        country: "FR",
        region,
        city: null,
        tradeFamily: null,
        subFamily: null,
        taxBasis: "TTC",
        vatRate,
        valueStatus: "calculee",
        priceDate: latest,
        period: `semaine du ${day(from)} au ${day(latest)}`,
        priceMin: decimal(stats.q1),
        priceMax: decimal(stats.q3),
        sampleSize: stats.n,
        aggregation: `Médiane des prix affichés par ${stats.n} stations mis à jour du ${day(from)} au ${day(latest)}. Fourchette : premier et troisième quartiles.`,
        reliability: reliabilityFromStats({ official: false, sampleSize: stats.n, q1: stats.q1, q3: stats.q3 }),
        series: null,
        sourceRef: `Flux instantané, colonne ${fuel.column}`,
        sourceUrl: resource.url,
        attributes: { carburant: fuel.label, stations: String(stats.n) },
      });
    }
  }
  return records;
}
