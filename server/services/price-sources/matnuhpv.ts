/**
 * « Prix et indices des matériaux de construction », ministère de l'Aménagement du territoire national,
 * de l'Urbanisme, de l'Habitat et de la Politique de la ville (data.gov.ma, licence ODbL).
 *
 * Feuilles « T1 » de chaque classeur : prix moyens de vente TTC en dirhams, par variété de matériau et
 * par année, au niveau national, régional et de l'agglomération. Les feuilles T2 et T3 (indices) ne sont
 * pas reprises. Chaque zone garde sa propre valeur : aucune moyenne n'est recalculée ni extrapolée.
 *
 * Désignations : libellés de la source remis en forme (la classification d'origine est conservée dans
 * les attributs). Une variété nouvelle, absente du catalogue ci-dessous, garde le libellé de la source.
 */
import ExcelJS from "exceljs";
import type { SourceRecord } from "../../../shared/prices.js";
import { decimal, slug } from "./common.js";

/** TVA incluse dans les prix de vente publiés : taux normal marocain, applicable aux matériaux de construction. */
export const MATNUHPV_VAT_RATE = "20";

interface Variety {
  designation: string;
  tradeFamily: string;
  subFamily: string | null;
}

const V = (designation: string, tradeFamily: string, subFamily: string | null = null): Variety => ({ designation, tradeFamily, subFamily });

/** Catalogue des variétés relevées, par clé stable (produit et variété). */
const VARIETIES: Record<string, Variety> = {
  "acier-doux-d-6": V("Acier doux diamètre 6", "gros_oeuvre", "Ferraillage"),
  "acier-haute-adherence-d-8-a-10": V("Acier haute adhérence diamètre 8 à 10", "gros_oeuvre", "Ferraillage"),
  "acier-haute-adherence-d-12-a-14": V("Acier haute adhérence diamètre 12 à 14", "gros_oeuvre", "Ferraillage"),
  "agglomeres-15-20-20-40-50": V("Agglomérés 15-20/20/40-50", "gros_oeuvre", "Maçonneries"),
  "agglomeres-7-5-10-20-40-50": V("Agglomérés 7,5-10/20/40-50", "gros_oeuvre", "Maçonneries"),
  "beton-pret-a-l-emploi-bpe": V("Béton prêt à l’emploi", "gros_oeuvre", "Béton armé"),
  "bordures-t3-ou-t4": V("Bordures T3 ou T4", "exterieurs_infrastructures", "Bordures et trottoirs"),
  "buse-en-beton-ou-pvc-d-100-a-150-mm": V("Buse en béton ou PVC diamètre 100 à 150 mm", "exterieurs_infrastructures", "Assainissement"),
  "buse-en-beton-ou-pvc-d-200-a-300-mm": V("Buse en béton ou PVC diamètre 200 à 300 mm", "exterieurs_infrastructures", "Assainissement"),
  "hourdis-12-16-20-52": V("Hourdis 12-16/20/52", "gros_oeuvre", "Planchers et dalles"),
  "hourdis-20-20-52": V("Hourdis 20/20/52", "gros_oeuvre", "Planchers et dalles"),
  "poutres-prefabriquees-12-16-20": V("Poutres préfabriquées 12-16/20", "gros_oeuvre", "Planchers et dalles"),
  "poutres-prefabriquees-20-20": V("Poutres préfabriquées 20/20", "gros_oeuvre", "Planchers et dalles"),
  "ciment-cpj-35-cpj-35": V("Ciment CPJ 35", "gros_oeuvre"),
  "ciment-cpj-45-cpj-45": V("Ciment CPJ 45", "gros_oeuvre"),
  "briques-creuses-6t-7x15x28": V("Briques creuses 6T 7x15x28", "gros_oeuvre", "Maçonneries"),
  "briques-creuses-8t": V("Briques creuses 8T", "gros_oeuvre", "Maçonneries"),
  "tuiles-traditionnel-ou-industriel": V("Tuiles traditionnelles ou industrielles", "enveloppe", "Couverture"),
  "gravettes-5-15-15-25": V("Gravettes 5/15 et 15/25", "gros_oeuvre"),
  "moellons-pierres": V("Moellons de pierre", "gros_oeuvre", "Maçonneries"),
  "sables-mer-oued-ou-concassage": V("Sable de mer, d’oued ou de concassage", "gros_oeuvre"),
  "qualite-economique-nafida-similaires": V("Châssis aluminium qualité économique, gamme Nafida ou similaire", "enveloppe", "Menuiseries extérieures"),
  "qualite-moyenne-aluma-similaires": V("Châssis aluminium qualité moyenne, gamme Aluma ou similaire", "enveloppe", "Menuiseries extérieures"),
  "cedre-2eme-choix": V("Bois de cèdre 2e choix", "second_oeuvre", "Menuiserie intérieure"),
  "contre-plaque-4-mm": V("Contreplaqué 4 mm", "second_oeuvre", "Menuiserie intérieure"),
  "hetre-francais-ou-roumain": V("Bois de hêtre français ou roumain", "second_oeuvre", "Menuiserie intérieure"),
  "sapin-rouge-2eme-choix": V("Sapin rouge 2e choix", "second_oeuvre", "Menuiserie intérieure"),
  "paumelle-standard": V("Paumelle standard", "second_oeuvre", "Serrurerie"),
  "poignet-standard": V("Poignée standard", "second_oeuvre", "Serrurerie"),
  "serrure-standard": V("Serrure standard", "second_oeuvre", "Serrurerie"),
  "vr-aluminium-aluminium": V("Volet roulant aluminium", "enveloppe", "Protections solaires"),
  "vr-pvc-pvc": V("Volet roulant PVC", "enveloppe", "Protections solaires"),
  "chaux-40-kg": V("Chaux, sac de 40 kg", "second_oeuvre", "Plâtrerie"),
  "platre-40-kg": V("Plâtre, sac de 40 kg", "second_oeuvre", "Plâtrerie"),
  "enduit-peinture-ep": V("Enduit de peinture", "second_oeuvre", "Peinture et revêtements muraux"),
  "laque-laque": V("Peinture laquée", "second_oeuvre", "Peinture et revêtements muraux"),
  "peinture-mat": V("Peinture mate", "second_oeuvre", "Peinture et revêtements muraux"),
  "peinture-vinylique": V("Peinture vinylique", "second_oeuvre", "Peinture et revêtements muraux"),
  "vernis-2eme-choix": V("Vernis 2e choix", "second_oeuvre", "Peinture et revêtements muraux"),
  "demi-double-clair-3-4-mm": V("Verre demi-double clair 3 à 4 mm", "second_oeuvre", "Vitrerie"),
  "demi-double-couleur-3-4-mm": V("Verre demi-double de couleur 3 à 4 mm", "second_oeuvre", "Vitrerie"),
  "double-arme-6-8-mm": V("Verre double armé 6 à 8 mm", "second_oeuvre", "Vitrerie"),
  "double-clair-6-mm": V("Verre double clair 6 mm", "second_oeuvre", "Vitrerie"),
  "double-couleur-6-mm": V("Verre double de couleur 6 mm", "second_oeuvre", "Vitrerie"),
  "baignoire-tole-ou-pvc": V("Baignoire en tôle ou PVC", "lots_techniques", "Plomberie et sanitaires"),
  "bidet-standard": V("Bidet standard", "lots_techniques", "Plomberie et sanitaires"),
  "evier-1-compartiment": V("Évier à un compartiment", "lots_techniques", "Plomberie et sanitaires"),
  "lavabo-sur-consol": V("Lavabo sur console", "lots_techniques", "Plomberie et sanitaires"),
  "receveur-douche-standard": V("Receveur de douche standard", "lots_techniques", "Plomberie et sanitaires"),
  "robinetterie-r-d-arret": V("Robinet d’arrêt", "lots_techniques", "Plomberie et sanitaires"),
  "robinetterie-r-de-chasse": V("Robinet de chasse", "lots_techniques", "Plomberie et sanitaires"),
  "robinetterie-r-melangeur": V("Robinet mélangeur", "lots_techniques", "Plomberie et sanitaires"),
  "robinetterie-r-simple": V("Robinet simple", "lots_techniques", "Plomberie et sanitaires"),
  "siege-a-l-anglaise-standard": V("Siège à l’anglaise standard", "lots_techniques", "Plomberie et sanitaires"),
  "siege-a-la-turque-standard": V("Siège à la turque standard", "lots_techniques", "Plomberie et sanitaires"),
  "tuyaux-diam-10-12": V("Tube cuivre 10/12", "lots_techniques", "Réseaux EF / ECS / EU / EV / EP"),
  "tuyaux-diam-12-14": V("Tube cuivre 12/14", "lots_techniques", "Réseaux EF / ECS / EU / EV / EP"),
  "buse-en-pvc-diam-100-a-125": V("Buse PVC diamètre 100 à 125", "lots_techniques", "Réseaux EF / ECS / EU / EV / EP"),
  "buse-en-pvc-diam-32-a-50-mm": V("Buse PVC diamètre 32 à 50 mm", "lots_techniques", "Réseaux EF / ECS / EU / EV / EP"),
  "tube-ppr-diam-16": V("Tube PPR diamètre 16", "lots_techniques", "Réseaux EF / ECS / EU / EV / EP"),
  "tube-ppr-diam-20": V("Tube PPR diamètre 20", "lots_techniques", "Réseaux EF / ECS / EU / EV / EP"),
  "canalisation-en-retube-diam-16-a-20": V("Canalisation en retube diamètre 16 à 20", "lots_techniques", "Réseaux EF / ECS / EU / EV / EP"),
  "carreaux-ciment-20x20": V("Carreaux de ciment 20x20", "second_oeuvre", "Carrelage et faïence"),
  "carreaux-de-faience-15x15-a-20x60": V("Carreaux de faïence 15x15 à 20x60", "second_oeuvre", "Carrelage et faïence"),
  "carreaux-granito-33x33-similraires": V("Carreaux granito 33x33 et similaires", "second_oeuvre", "Carrelage et faïence"),
  "carreaux-gres-33x33-a-50x50": V("Carreaux de grès 33x33 à 50x50", "second_oeuvre", "Carrelage et faïence"),
  "parquet-stratifie-ac3": V("Parquet stratifié AC3", "second_oeuvre", "Parquet"),
  "plinthe-gres": V("Plinthe en grès", "second_oeuvre", "Carrelage et faïence"),
  "granit-importe": V("Granit importé", "second_oeuvre", "Pierre naturelle"),
  "granit-local": V("Granit local", "second_oeuvre", "Pierre naturelle"),
  "marbre-importe-qualite-economique": V("Marbre importé qualité économique", "second_oeuvre", "Pierre naturelle"),
  "marbre-local-qualite-economique": V("Marbre local qualité économique", "second_oeuvre", "Pierre naturelle"),
  "marbre-local-qualite-moyenne": V("Marbre local qualité moyenne", "second_oeuvre", "Pierre naturelle"),
  "filerie-et-cable-sect-1-5-mm": V("Filerie et câble, section 1,5 mm²", "lots_techniques", "Électricité courants forts"),
  "filerie-et-cable-sect-2-5-mm": V("Filerie et câble, section 2,5 mm²", "lots_techniques", "Électricité courants forts"),
  "interrupteur-standard": V("Interrupteur standard", "lots_techniques", "Électricité courants forts"),
  "prise-standard": V("Prise de courant standard", "lots_techniques", "Électricité courants forts"),
  "tableau-plastique-20": V("Tableau électrique plastique 20", "lots_techniques", "Électricité courants forts"),
  "tubage-diam-9": V("Tubage diamètre 9", "lots_techniques", "Électricité courants forts"),
  "tubage-diam-11": V("Tubage diamètre 11", "lots_techniques", "Électricité courants forts"),
  "tubage-diam-13": V("Tubage diamètre 13", "lots_techniques", "Électricité courants forts"),
  "bitume-bitume": V("Bitume", "enveloppe", "Étanchéité"),
  "carton-bitume-27s": V("Carton bitumé 27S", "enveloppe", "Étanchéité"),
  "carton-bitume-36s": V("Carton bitumé 36S", "enveloppe", "Étanchéité"),
};

/** Régions (découpage de 2015), par code de feuille. */
const REGIONS: Record<string, string> = {
  TTAH: "Tanger-Tétouan-Al Hoceïma",
  ORI: "Oriental",
  FM: "Fès-Meknès",
  RSK: "Rabat-Salé-Kénitra",
  BKH: "Béni Mellal-Khénifra",
  CS: "Casablanca-Settat",
  MS: "Marrakech-Safi",
  DT: "Drâa-Tafilalet",
  SM: "Souss-Massa",
  GON: "Guelmim-Oued Noun",
  LSH: "Laâyoune-Sakia El Hamra",
  EOD: "Dakhla-Oued Ed-Dahab",
  DOD: "Dakhla-Oued Ed-Dahab",
};

export interface WorkbookResource {
  url: string;
  title: string;
  data: Buffer | ArrayBuffer | Uint8Array;
}

interface Observation {
  varietyKey: string;
  zoneKey: string;
  zoneLabel: string;
  region: string | null;
  city: string | null;
  regionCode: string | null;
  corps: string;
  activite: string;
  produit: string;
  variete: string;
  unit: string;
  series: Record<string, number>;
  table: string;
  sheet: string;
  url: string;
  /** Classeur national (2005 à 2019) : ses séries régionales sont remplacées par celles des classeurs régionaux, plus récents. */
  national: boolean;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((t) => t.text).join("");
    if ("result" in value) return String(value.result ?? "");
    if ("text" in value) return String(value.text);
    if (value instanceof Date) return value.toISOString();
  }
  return String(value);
}

function cellNumber(value: ExcelJS.CellValue): number | null {
  const raw = typeof value === "object" && value !== null && "result" in value ? value.result : value;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const clean = (text: string) => text.replace(/\s+/g, " ").trim();

/** Zone décrite par le titre du tableau (« au niveau national », « de la région de… », « de l'agglomération de… »). */
function zoneOf(title: string): { kind: "national" | "region" | "agglo"; name: string } | null {
  const t = clean(title);
  if (/au niveau national/i.test(t)) return { kind: "national", name: "National" };
  const agglo = /agglom[ée]ration\s+(?:de\s+l['’]|de\s+|d['’]|du\s+)?(.+)$/i.exec(t);
  if (agglo) return { kind: "agglo", name: clean(agglo[1]!) };
  const region = /r[ée]gion\s+(?:de\s+l['’]|de\s+|d['’])?(.+)$/i.exec(t);
  if (region) return { kind: "region", name: clean(region[1]!) };
  return null;
}

function varietyKey(produit: string, variete: string): string {
  const p = /^bpe$/i.test(produit.trim()) || /^b[ée]ton pr[êe]t/i.test(produit.trim()) ? "Béton prêt à l'emploi" : produit;
  return slug(`${p} ${variete}`);
}

/** Lecture d'un classeur : une observation par zone et par variété. */
async function readWorkbook(resource: WorkbookResource): Promise<Observation[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(resource.data as ArrayBuffer);
  const sheets = wb.worksheets.filter((ws) => /^\s*T1\b/i.test(ws.name));
  // Code de la région du classeur : celui de sa première feuille T1 (classeurs régionaux).
  const firstCode = sheets[0]?.name.replace(/^\s*T1\s*/i, "").replace(/\s*PNM\s*$/i, "").trim().toUpperCase() ?? "";
  const national = sheets.some((ws) => /NATIONAL/i.test(ws.name));
  const out: Observation[] = [];
  for (const ws of sheets) {
    const title = cellText(ws.getCell(1, 1).value);
    const zone = zoneOf(title);
    if (!zone) continue;
    const code = ws.name.replace(/^\s*T1\s*/i, "").replace(/\s*PNM\s*$/i, "").trim().toUpperCase();
    // Ligne des années : la première ligne dont la colonne E porte une année.
    let yearRow = 0;
    for (let r = 2; r <= 6 && !yearRow; r++) {
      const y = cellNumber(ws.getCell(r, 5).value);
      if (y && y >= 2000 && y <= 2100) yearRow = r;
    }
    if (!yearRow) continue;
    const years: Array<{ col: number; year: number }> = [];
    for (let col = 5; col <= ws.columnCount; col++) {
      const y = cellNumber(ws.getCell(yearRow, col).value);
      if (y && y >= 2000 && y <= 2100) years.push({ col, year: y });
    }
    const regionCode = zone.kind === "region" ? code : zone.kind === "agglo" ? (national ? null : firstCode) : null;
    const region = regionCode ? (REGIONS[regionCode] ?? (zone.kind === "region" ? zone.name : null)) : null;
    const zoneKey = zone.kind === "national" ? "national" : zone.kind === "region" ? `region-${slug(region ?? zone.name)}` : `agglo-${slug(zone.name)}`;
    const zoneLabel = zone.kind === "national" ? "Maroc, niveau national" : zone.kind === "region" ? `Région ${region ?? zone.name}` : `Agglomération ${zone.name}`;
    const table = clean(title.split(":")[0] ?? "");
    let corps = "";
    let activite = "";
    let produit = "";
    for (let r = yearRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const c = clean(cellText(row.getCell(1).value));
      const a = clean(cellText(row.getCell(2).value));
      const p = clean(cellText(row.getCell(3).value));
      const v = clean(cellText(row.getCell(4).value));
      if (c) corps = c;
      if (a) activite = a;
      if (p) produit = p;
      if (!v || !produit) continue;
      const unitMatch = /\(([^()]+)\)\s*$/.exec(v);
      if (!unitMatch) continue;
      const unit = unitMatch[1]!.trim();
      const variete = clean(v.slice(0, unitMatch.index));
      const series: Record<string, number> = {};
      for (const { col, year } of years) {
        const value = cellNumber(row.getCell(col).value);
        // Une cellule vide ou nulle n'est pas un prix : elle reste absente de la série.
        if (value !== null && value > 0) series[String(year)] = Math.round(value * 10_000) / 10_000;
      }
      if (Object.keys(series).length === 0) continue;
      out.push({
        varietyKey: varietyKey(produit, variete),
        zoneKey,
        zoneLabel,
        region: zone.kind === "national" ? null : region,
        city: zone.kind === "agglo" ? zone.name : null,
        regionCode,
        corps,
        activite,
        produit,
        variete,
        unit,
        series,
        table,
        sheet: ws.name.trim(),
        url: resource.url,
        national,
      });
    }
  }
  return out;
}

const normalizeUnit = (unit: string) => {
  const u = unit.trim();
  if (/^kg$/i.test(u)) return "kg";
  if (/^sac$/i.test(u)) return "sac";
  if (/^m3$/i.test(u)) return "m3";
  return u;
};

const lastYear = (series: Record<string, number>) => Math.max(...Object.keys(series).map(Number));

/** Références de la bibliothèque, une par zone et par variété, avec la série complète publiée. */
export async function parseMatnuhpv(resources: WorkbookResource[]): Promise<SourceRecord[]> {
  const observations: Observation[] = [];
  for (const resource of resources) observations.push(...(await readWorkbook(resource)));

  // Une zone et une variété : la série du classeur régional (publication la plus récente) l'emporte sur
  // celle du classeur national, qui ne sert que pour le niveau national.
  const byKey = new Map<string, Observation>();
  for (const o of observations) {
    const key = `${o.zoneKey}:${o.varietyKey}`;
    const current = byKey.get(key);
    if (!current || (current.national && !o.national) || (current.national === o.national && lastYear(o.series) > lastYear(current.series))) byKey.set(key, o);
  }
  const kept = [...byKey.values()];

  const byVariety = new Map<string, Observation[]>();
  for (const o of kept) byVariety.set(o.varietyKey, [...(byVariety.get(o.varietyKey) ?? []), o]);

  // Fourchette des niveaux national et régional : moyennes des zones inférieures, même année.
  const rangeOf = (o: Observation, year: number): { min: number; max: number; count: number } | null => {
    const children = (byVariety.get(o.varietyKey) ?? []).filter((c) => c !== o && (o.zoneKey === "national" ? c.zoneKey.startsWith("region-") : o.zoneKey.startsWith("region-") && c.city !== null && c.region === o.region));
    const values = children.map((c) => c.series[String(year)]).filter((v): v is number => typeof v === "number");
    if (values.length < 2) return null;
    return { min: Math.min(...values), max: Math.max(...values), count: values.length };
  };

  return kept.map((o) => {
    const year = lastYear(o.series);
    const value = o.series[String(year)]!;
    const known = VARIETIES[o.varietyKey];
    const designation = known?.designation ?? clean(`${o.produit} ${o.variete === o.produit ? "" : o.variete}`);
    const range = o.city ? null : rangeOf(o, year);
    const unit = normalizeUnit(o.unit);
    const scopeLabel = o.zoneKey === "national" ? "régions" : "agglomérations de la région";
    return {
      externalKey: `${o.zoneKey}:${o.varietyKey}`,
      groupKey: `matnuhpv:${o.varietyKey}`,
      designation,
      description: `Prix moyen de vente TTC en dirhams relevé par le ministère, moyenne annuelle ${year}. Zone : ${o.zoneLabel}. Classement de la source : ${[o.corps, o.activite, o.produit, o.variete].filter(Boolean).join(", ")}, unité ${o.unit}.`,
      kind: "materiau",
      scope: "fourniture",
      unit,
      unitPrice: decimal(value),
      currency: "MAD",
      country: "MA",
      region: o.region,
      city: o.city,
      tradeFamily: known?.tradeFamily ?? null,
      subFamily: known?.subFamily ?? null,
      taxBasis: "TTC",
      vatRate: MATNUHPV_VAT_RATE,
      valueStatus: "source",
      priceDate: `${year}-07-01`,
      period: String(year),
      priceMin: range ? decimal(range.min) : null,
      priceMax: range ? decimal(range.max) : null,
      sampleSize: null,
      aggregation: range
        ? `Moyenne annuelle publiée par la source. Fourchette : plus basse et plus haute des moyennes des ${range.count} ${scopeLabel}, même année.`
        : "Moyenne annuelle publiée par la source.",
      reliability: "haute",
      series: o.series,
      sourceRef: `${o.table}, feuille ${o.sheet}`,
      sourceUrl: o.url,
      attributes: { corps: o.corps, activite: o.activite, produit: o.produit, variete: o.variete, uniteSource: o.unit, zone: o.zoneLabel },
    } satisfies SourceRecord;
  });
}
