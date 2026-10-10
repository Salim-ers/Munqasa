/**
 * « Coûts et surfaces moyens des logements sociaux financés par la CDC depuis 2018 » (Caisse des Dépôts,
 * data.gouv.fr, Licence Ouverte) : prix de revient médians des opérations de construction et de
 * réhabilitation, au m² de surface utile et par logement, par région et par année de financement, en
 * euros courants.
 *
 * Ce sont des ratios d'opération entière (foncier et honoraires compris selon les opérations) : ils
 * servent à l'estimation globale, jamais au prix d'une ligne de DPGF. Une valeur nulle publiée signifie
 * l'absence de donnée et n'est pas reprise.
 */
import type { SourceRecord } from "../../../shared/prices.js";
import { csvNumber, decimal, parseDelimited, slug } from "./common.js";
import type { TextResource } from "./ademe.js";

/** Régions par code officiel géographique ; la Nouvelle-Calédonie figure dans la source sans code. */
const REGIONS: Record<string, string> = {
  "1": "Guadeloupe",
  "2": "Martinique",
  "3": "Guyane",
  "4": "La Réunion",
  "6": "Mayotte",
  "11": "Île-de-France",
  "24": "Centre-Val de Loire",
  "27": "Bourgogne-Franche-Comté",
  "28": "Normandie",
  "32": "Hauts-de-France",
  "44": "Grand Est",
  "52": "Pays de la Loire",
  "53": "Bretagne",
  "75": "Nouvelle-Aquitaine",
  "76": "Occitanie",
  "84": "Auvergne-Rhône-Alpes",
  "93": "Provence-Alpes-Côte d’Azur",
  "94": "Corse",
};

interface Indicator {
  key: string;
  column: string;
  designation: string;
  unit: string;
  work: string;
}

const INDICATORS: Indicator[] = [
  {
    key: "construction-m2",
    column: "Construction - Prix de revient médian au M² des opérations",
    designation: "Prix de revient médian d’une opération de construction de logements sociaux, au m² de surface utile",
    unit: "m² SU",
    work: "construction",
  },
  {
    key: "construction-logement",
    column: "Construction - Prix de revient médian des opérations au logement",
    designation: "Prix de revient médian d’une opération de construction de logements sociaux, par logement",
    unit: "logement",
    work: "construction",
  },
  {
    key: "rehabilitation-m2",
    column: "Réhabilitation - Prix de revient médian au M² des opérations",
    designation: "Prix de revient médian d’une opération de réhabilitation de logements sociaux, au m² de surface utile",
    unit: "m² SU",
    work: "réhabilitation",
  },
  {
    key: "rehabilitation-logement",
    column: "Réhabilitation - Prix de revient médian des opérations au logement",
    designation: "Prix de revient médian d’une opération de réhabilitation de logements sociaux, par logement",
    unit: "logement",
    work: "réhabilitation",
  },
];

function regionName(code: string, raw: string): string {
  if (REGIONS[code.trim()]) return REGIONS[code.trim()]!;
  if (/cal[ée]donie/i.test(raw)) return "Nouvelle-Calédonie";
  return raw
    .toLowerCase()
    .replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase())
    .trim();
}

export function parseCdc(resource: TextResource): SourceRecord[] {
  const rows = parseDelimited(resource.text, ";");
  const byRegion = new Map<string, { name: string; rows: Array<Record<string, string>> }>();
  for (const row of rows) {
    const name = regionName(row.code_region ?? "", row.region ?? "");
    if (!name) continue;
    const entry = byRegion.get(name) ?? { name, rows: [] };
    entry.rows.push(row);
    byRegion.set(name, entry);
  }
  const records: SourceRecord[] = [];
  for (const { name, rows: regionRows } of byRegion.values()) {
    for (const indicator of INDICATORS) {
      const series: Record<string, number> = {};
      for (const row of regionRows) {
        const year = csvNumber(row.annee_signature);
        const value = csvNumber(row[indicator.column]);
        if (year && value !== null && value > 0) series[String(Math.trunc(year))] = value;
      }
      const years = Object.keys(series).map(Number);
      if (years.length === 0) continue;
      const year = Math.max(...years);
      records.push({
        externalKey: `cdc:${slug(name)}:${indicator.key}`,
        groupKey: `cdc:${indicator.key}`,
        designation: indicator.designation,
        description: `Prix de revient médian des opérations de ${indicator.work} de logements sociaux financées par la Caisse des Dépôts en ${year}, région ${name}, en euros courants. Ratio d’opération entière, à utiliser pour une estimation globale et jamais comme prix d’une ligne de DPGF. Assiette fiscale non précisée par la source.`,
        kind: "ratio",
        scope: "ouvrage_complet",
        unit: indicator.unit,
        unitPrice: decimal(series[String(year)]!),
        currency: "EUR",
        country: "FR",
        region: name,
        city: null,
        tradeFamily: null,
        subFamily: null,
        taxBasis: null,
        vatRate: null,
        valueStatus: "source",
        priceDate: `${year}-07-01`,
        period: String(year),
        priceMin: null,
        priceMax: null,
        sampleSize: null,
        aggregation: "Médiane publiée par la source sur les opérations financées l’année indiquée.",
        reliability: "haute",
        series,
        sourceRef: `Colonne « ${indicator.column} », année de financement ${year}`,
        sourceUrl: resource.url,
        attributes: { indicateur: indicator.column },
      });
    }
  }
  return records;
}
