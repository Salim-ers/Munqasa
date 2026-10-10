/**
 * « Coûts des travaux de rénovation » (ADEME, data.gouv.fr, Licence Ouverte) : près de 12 000 gestes de
 * rénovation énergétique relevés sur devis et factures du réseau FAIRE entre 2001 et 2018, en euros HT.
 *
 * Méthode : pour chaque type de travaux, prix unitaire de chaque geste (coût total HT divisé par la
 * surface posée, le nombre d'ouvertures ou la puissance), puis médiane et quartiles. Un geste sans
 * quantité exploitable est écarté ; aucune valeur n'est actualisée. Le coût total exclut les travaux
 * induits (finitions, bardage, plâtrerie) que la source compte à part. Seuls les types de travaux
 * observés au moins 20 fois sont publiés.
 */
import { reliabilityFromStats, type SourceRecord } from "../../../shared/prices.js";
import { csvNumber, decimal, frenchDate, medianDate, parseDelimited, slug, summarize } from "./common.js";

export const ADEME_TABLES = ["isolation", "menuiseries", "chauffage", "ecs", "ventilation", "photovoltaique"] as const;
export type AdemeTable = (typeof ADEME_TABLES)[number];

export const ADEME_MIN_SAMPLE = 20;

export interface TextResource {
  url: string;
  title: string;
  text: string;
}

type Row = Record<string, string>;

interface Group {
  table: AdemeTable;
  key: string;
  groupKey: string;
  designation: string;
  unit: string;
  /** Comment le prix unitaire d'un geste est obtenu, pour la méthode affichée. */
  ratio: string;
  tradeFamily: string;
  subFamily: string;
  match: (row: Row) => boolean;
  value: (row: Row) => number | null;
}

/** Champ d'une ligne, quel que soit l'intitulé exact de la colonne (casse, accents). */
function field(row: Row, name: string): string {
  if (name in row) return row[name]!.trim();
  const wanted = slug(name);
  for (const [key, value] of Object.entries(row)) if (slug(key) === wanted) return value.trim();
  return "";
}

const upper = (row: Row, name: string) => field(row, name).toUpperCase();
const total = (row: Row) => {
  const v = csvNumber(field(row, "cout_total_ht"));
  return v !== null && v > 0 ? v : null;
};
const perQuantity = (row: Row, quantityField: string, factor = 1) => {
  const t = total(row);
  const q = csvNumber(field(row, quantityField));
  return t !== null && q !== null && q > 0 ? t / (q * factor) : null;
};

const POSTES: Array<[string, string, string, string]> = [
  ["COMBLES PERDUES", "Isolation des combles perdus", "second_oeuvre", "Isolation intérieure"],
  ["ITE", "Isolation thermique des murs par l’extérieur", "enveloppe", "Isolation thermique par l’extérieur"],
  ["RAMPANTS", "Isolation des rampants de toiture", "second_oeuvre", "Isolation intérieure"],
  ["ITI", "Isolation thermique des murs par l’intérieur", "second_oeuvre", "Isolation intérieure"],
  ["PLANCHER BAS", "Isolation du plancher bas", "second_oeuvre", "Isolation intérieure"],
  ["TOITURE TERRASSE", "Isolation de toiture terrasse", "enveloppe", "Étanchéité"],
  ["SARKING", "Isolation de toiture par l’extérieur, procédé sarking", "enveloppe", "Couverture"],
];
const ISOLANTS: Array<[string, string]> = [
  ["LAINE MINERALE", "en laine minérale"],
  ["LAINE VEGETALE", "en laine végétale"],
  ["PLASTIQUES", "en isolant plastique"],
];

const MENUISERIES: Array<[string, string]> = [
  ["FENETRE", "Fenêtre"],
  ["PORTE-FENETRE", "Porte-fenêtre"],
  ["PORTE", "Porte extérieure"],
  ["FENETRE DE TOIT", "Fenêtre de toit"],
];
const MATERIAUX: Array<[string, string]> = [
  ["PVC", "PVC"],
  ["ALUMINIUM", "aluminium"],
  ["BOIS", "bois"],
  ["MIXTE", "mixte"],
];

function groups(): Group[] {
  const list: Group[] = [];
  const isolationRatio = "coût total HT divisé par la surface d’isolant posée";
  for (const [poste, label, tradeFamily, subFamily] of POSTES) {
    const posteKey = slug(poste);
    list.push({
      table: "isolation",
      key: posteKey,
      groupKey: `ademe:isolation:${posteKey}`,
      designation: `${label}, fourniture et pose, tous isolants`,
      unit: "m²",
      ratio: isolationRatio,
      tradeFamily,
      subFamily,
      match: (r) => upper(r, "poste_isolation") === poste,
      value: (r) => perQuantity(r, "surface"),
    });
    for (const [isolant, suffix] of ISOLANTS) {
      list.push({
        table: "isolation",
        key: `${posteKey}-${slug(isolant)}`,
        groupKey: `ademe:isolation:${posteKey}`,
        designation: `${label} ${suffix}, fourniture et pose`,
        unit: "m²",
        ratio: isolationRatio,
        tradeFamily,
        subFamily,
        match: (r) => upper(r, "poste_isolation") === poste && upper(r, "isolant") === isolant,
        value: (r) => perQuantity(r, "surface"),
      });
    }
  }
  const openingRatio = "coût total HT divisé par le nombre d’ouvertures du geste";
  for (const [type, label] of MENUISERIES) {
    const typeKey = slug(type);
    list.push({
      table: "menuiseries",
      key: typeKey,
      groupKey: `ademe:menuiseries:${typeKey}`,
      designation: `${label}, fourniture et pose, tous matériaux, prix par ouverture`,
      unit: "u",
      ratio: openingRatio,
      tradeFamily: "enveloppe",
      subFamily: "Menuiseries extérieures",
      match: (r) => upper(r, "type_menuiserie") === type,
      value: (r) => perQuantity(r, "nb_ouvertures"),
    });
    for (const [material, materialLabel] of MATERIAUX) {
      list.push({
        table: "menuiseries",
        key: `${typeKey}-${slug(material)}`,
        groupKey: `ademe:menuiseries:${typeKey}`,
        designation: `${label} ${materialLabel}, fourniture et pose, prix par ouverture`,
        unit: "u",
        ratio: openingRatio,
        tradeFamily: "enveloppe",
        subFamily: "Menuiseries extérieures",
        match: (r) => upper(r, "type_menuiserie") === type && upper(r, "materiaux") === material,
        value: (r) => perQuantity(r, "nb_ouvertures"),
      });
    }
  }
  const unitRatio = "coût total HT de l’installation";
  const heating: Array<[string, string, (r: Row) => boolean]> = [
    ["poele-bois", "Poêle à bois", (r) => upper(r, "generateur") === "POELE" && upper(r, "energie_chauffage_installee") === "BOIS"],
    ["poele-gaz", "Poêle à gaz", (r) => upper(r, "generateur") === "POELE" && upper(r, "energie_chauffage_installee") === "GAZ"],
    ["insert-bois", "Insert à bois", (r) => upper(r, "generateur") === "INSERT" && upper(r, "energie_chauffage_installee") === "BOIS"],
    ["chaudiere-gaz-condensation", "Chaudière gaz à condensation", (r) => upper(r, "generateur") === "CHAUDIERE" && upper(r, "type_chaudiere") === "A CONDENSATION" && upper(r, "energie_chauffage_installee") === "GAZ"],
    ["chaudiere-fioul-condensation", "Chaudière fioul à condensation", (r) => upper(r, "generateur") === "CHAUDIERE" && upper(r, "type_chaudiere") === "A CONDENSATION" && upper(r, "energie_chauffage_installee") === "FIOUL"],
    ["chaudiere-gaz-hpe", "Chaudière gaz haute performance énergétique", (r) => upper(r, "generateur") === "CHAUDIERE" && upper(r, "type_chaudiere") === "HPE" && upper(r, "energie_chauffage_installee") === "GAZ"],
    ["chaudiere-bois", "Chaudière bois", (r) => upper(r, "generateur") === "CHAUDIERE" && upper(r, "energie_chauffage_installee") === "BOIS"],
    ["pac-air-eau", "Pompe à chaleur air-eau", (r) => upper(r, "generateur") === "PAC" && upper(r, "type_chaudiere") === "AIR-EAU" && upper(r, "energie_chauffage_installee") === "ELECTRICITE"],
    ["pac-air-air", "Pompe à chaleur air-air", (r) => upper(r, "generateur") === "PAC" && upper(r, "type_chaudiere") === "AIR-AIR" && upper(r, "energie_chauffage_installee") === "ELECTRICITE"],
  ];
  for (const [key, label, match] of heating) {
    list.push({ table: "chauffage", key, groupKey: `ademe:chauffage:${key}`, designation: `${label}, fourniture et pose`, unit: "u", ratio: unitRatio, tradeFamily: "lots_techniques", subFamily: "CVC, ventilation, climatisation, chauffage", match, value: total });
  }
  const hotWater: Array<[string, string]> = [
    ["CESI", "Chauffe-eau solaire individuel"],
    ["CETI", "Chauffe-eau thermodynamique individuel"],
    ["SSC", "Système solaire combiné chauffage et eau chaude"],
  ];
  for (const [type, label] of hotWater) {
    const key = slug(type);
    list.push({ table: "ecs", key, groupKey: `ademe:ecs:${key}`, designation: `${label}, fourniture et pose`, unit: "u", ratio: unitRatio, tradeFamily: "lots_techniques", subFamily: "Plomberie et sanitaires", match: (r) => upper(r, "type_ecs") === type, value: total });
  }
  const ventilation: Array<[string, string]> = [
    ["SIMPLE FLUX", "VMC simple flux"],
    ["HYGRO A", "VMC simple flux hygroréglable type A"],
    ["HYGRO B", "VMC simple flux hygroréglable type B"],
    ["DOUBLE FLUX", "VMC double flux"],
  ];
  for (const [type, label] of ventilation) {
    const key = slug(type);
    list.push({ table: "ventilation", key, groupKey: `ademe:ventilation:${key}`, designation: `${label}, fourniture et pose`, unit: "u", ratio: unitRatio, tradeFamily: "lots_techniques", subFamily: "CVC, ventilation, climatisation, chauffage", match: (r) => upper(r, "type_ventilation") === type, value: total });
  }
  list.push({
    table: "photovoltaique",
    key: "installation",
    groupKey: "ademe:photovoltaique:installation",
    designation: "Installation photovoltaïque, fourniture et pose, prix par kilowatt-crête",
    unit: "kWc",
    ratio: "coût total HT divisé par la puissance installée",
    tradeFamily: "lots_techniques",
    subFamily: "Photovoltaïque",
    match: () => true,
    // Puissance publiée en watts-crête.
    value: (r) => perQuantity(r, "puissance_installee", 1 / 1000),
  });
  return list;
}

const TABLE_LABELS: Record<AdemeTable, string> = {
  isolation: "Isolation",
  menuiseries: "Menuiseries",
  chauffage: "Chauffage",
  ecs: "Eau chaude sanitaire",
  ventilation: "Ventilation",
  photovoltaique: "Photovoltaïque",
};

function observationDate(row: Row): string | null {
  const date = frenchDate(field(row, "date_x")) ?? frenchDate(field(row, "date_facture"));
  if (date) return date;
  const year = csvNumber(field(row, "annee_travaux"));
  return year && year >= 1990 && year <= 2030 ? `${Math.trunc(year)}-07-01` : null;
}

/** Références agrégées à partir des tables de la source (une ressource par table). */
export function parseAdeme(resources: Array<TextResource & { table: AdemeTable }>): SourceRecord[] {
  const records: SourceRecord[] = [];
  const rowsByTable = new Map<AdemeTable, { rows: Row[]; url: string }>();
  for (const r of resources) rowsByTable.set(r.table, { rows: parseDelimited(r.text, ";"), url: r.url });
  for (const group of groups()) {
    const table = rowsByTable.get(group.table);
    if (!table) continue;
    const observations: Array<{ value: number; date: string | null }> = [];
    for (const row of table.rows) {
      if (!group.match(row)) continue;
      const value = group.value(row);
      if (value !== null && Number.isFinite(value) && value > 0) observations.push({ value, date: observationDate(row) });
    }
    if (observations.length < ADEME_MIN_SAMPLE) continue;
    const dates = observations.map((o) => o.date).filter((d): d is string => d !== null);
    // Un prix qu'on ne peut pas dater ne peut pas être jugé ancien ou récent : il n'est pas publié.
    const priceDate = medianDate(dates);
    if (!priceDate) continue;
    const stats = summarize(observations.map((o) => o.value));
    const years = dates.map((d) => Number(d.slice(0, 4)));
    const first = Math.min(...years);
    const last = Math.max(...years);
    const period = first === last ? String(first) : `${first} à ${last}`;
    const undated = observations.length - dates.length;
    records.push({
      externalKey: `ademe:${group.table}:${group.key}`,
      groupKey: group.groupKey,
      designation: group.designation,
      description: `Prix constaté sur devis et factures de rénovation énergétique de logements, France, ${period}. Coût des matériaux et de la main-d’œuvre, hors travaux induits tels que finitions, bardage ou plâtrerie, en euros HT de l’époque, sans actualisation.`,
      kind: "ouvrage",
      scope: "fourniture_pose",
      unit: group.unit,
      unitPrice: decimal(stats.median),
      currency: "EUR",
      country: "FR",
      region: null,
      city: null,
      tradeFamily: group.tradeFamily,
      subFamily: group.subFamily,
      taxBasis: "HT",
      vatRate: null,
      valueStatus: "calculee",
      priceDate,
      period,
      priceMin: decimal(stats.q1),
      priceMax: decimal(stats.q3),
      sampleSize: stats.n,
      aggregation: `Médiane de ${stats.n} gestes, prix unitaire de chaque geste égal au ${group.ratio}. Fourchette : premier et troisième quartiles. Date de valeur : date médiane des devis et factures${undated ? `, ${undated} gestes sans date compris dans le calcul` : ""}.`,
      reliability: reliabilityFromStats({ official: false, sampleSize: stats.n, q1: stats.q1, q3: stats.q3 }),
      series: null,
      sourceRef: `Table ${TABLE_LABELS[group.table]}, ${stats.n} gestes retenus sur ${table.rows.length} lignes`,
      sourceUrl: table.url,
      attributes: { table: TABLE_LABELS[group.table] },
    });
  }
  return records;
}
