/**
 * Salaires minimaux et indemnités de petits déplacements du BTP (France) : accords régionaux et
 * départementaux de la base KALI de Légifrance (DILA, Licence Ouverte), lus dans la copie JSON publiée
 * par la Fabrique numérique des ministères sociaux, et SMIC horaire publié par l'Insee.
 *
 * Conventions lues :
 * - ouvriers du bâtiment des entreprises de plus de 10 salariés (IDCC 1597) : salaires mensuels minimaux
 *   par coefficient, indemnités de repas, de trajet et de transport par zone ;
 * - ouvriers des travaux publics (IDCC 1702) : salaires minima hiérarchiques annuels, mêmes indemnités ;
 * - employés, techniciens et agents de maîtrise du bâtiment (IDCC 2609) : salaires mensuels minimaux par niveau.
 *
 * Pour chaque convention, chaque zone d'accord et chaque nature (salaires ou indemnités), seul le texte le
 * plus récent déjà en vigueur est repris ; un barème à venir figure en note. Un salaire est ramené à
 * l'heure (151,67 heures par mois, 1 820 heures par an) ; inférieur au SMIC horaire en vigueur, il est
 * porté au SMIC, qui s'applique de droit. Ce sont des minima bruts, hors charges sociales et frais : jamais
 * des taux de facturation. Un tableau dont la structure n'est pas reconnue avec certitude est écarté.
 */
import type { SourceRecord } from "../../../shared/prices.js";
import { decimal, slug } from "./common.js";

export type KaliIdcc = "1597" | "1702" | "2609";

export interface KaliResource {
  url: string;
  title: string;
  idcc: KaliIdcc;
  json: unknown;
}

export interface SmicResource {
  url: string;
  title: string;
  xml: string;
}

interface KaliNode {
  type?: string;
  data?: Record<string, unknown>;
  children?: KaliNode[];
}

const MONTH_HOURS = 151.67;
const YEAR_HOURS = 1820;

const CONVENTIONS: Record<KaliIdcc, { worker: string; population: string; short: string }> = {
  "1597": { worker: "ouvrier du bâtiment", population: "ouvriers des entreprises du bâtiment de plus de 10 salariés", short: "ouvriers du bâtiment" },
  "1702": { worker: "ouvrier des travaux publics", population: "ouvriers des entreprises de travaux publics", short: "ouvriers des travaux publics" },
  "2609": { worker: "ETAM du bâtiment", population: "employés, techniciens et agents de maîtrise du bâtiment", short: "ETAM du bâtiment" },
};

/** Classification des ouvriers du bâtiment : coefficient vers niveau et position. */
const BUILDING_WORKERS: Record<number, string> = {
  150: "niveau I position 1, coefficient 150",
  170: "niveau I position 2, coefficient 170",
  185: "niveau II, coefficient 185",
  210: "niveau III position 1, coefficient 210",
  230: "niveau III position 2, coefficient 230",
  250: "niveau IV position 1, coefficient 250",
  270: "niveau IV position 2, coefficient 270",
};

/** Classification des ouvriers des travaux publics : coefficient vers niveau et position. */
const PUBLIC_WORKS_WORKERS: Record<number, string> = {
  100: "niveau I position 1, coefficient 100",
  110: "niveau I position 2, coefficient 110",
  125: "niveau II position 1, coefficient 125",
  140: "niveau II position 2, coefficient 140",
  150: "niveau III position 1, coefficient 150",
  165: "niveau III position 2, coefficient 165",
  180: "niveau IV, coefficient 180",
};

const ETAM_LEVELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

/* ---------- Texte, dates et montants ---------- */

/** Texte comparable : minuscules, sans accents, apostrophes et tirets en espaces. */
export function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/[^a-z0-9,]+/g, " ")
    .trim();
}

function htmlText(fragment: string): string {
  return fragment
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&eacute;/g, "é")
    .replace(/&egrave;/g, "è")
    .replace(/&agrave;/g, "à")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/[\s  ]+/g, " ")
    .trim();
}

/** Montant d'une cellule : « 1 843 € », « 12,30 € », « 4,31 » ; un entier nu n'est lu que sur demande. */
export function money(text: string, integers = false): number | null {
  const t = text.replace(/[  ]/g, " ").trim();
  const m = /^(\d{1,3}(?: \d{3})+|\d+)(?:,(\d{1,3}))?\s*(€|euros?)?\.?$/i.exec(t);
  if (!m) return null;
  if (!m[2] && !m[3] && !integers) return null;
  return Number(m[1]!.replace(/ /g, "") + (m[2] ? `.${m[2]}` : ""));
}

/** Montant placé en tête d'une cellule et suivi d'un commentaire : « 14 € Pour tous les départements ». */
function leadingAmount(text: string): number | null {
  const m = /^(\d+(?:,\d{1,2})?)\s*(?:€|euros?)(?=\s|$)/i.exec(text.replace(/[\u00a0\u202f]/g, " ").trim());
  return m ? Number(m[1]!.replace(",", ".")) : null;
}

const MONTHS: Record<string, number> = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12 };
const MONTH_NAMES = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const DATE_RE = /(1er|\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(\d{4})/g;

function isoDate(day: string, month: string, year: string): string {
  return `${year}-${String(MONTHS[month]).padStart(2, "0")}-${String(day === "1er" ? 1 : Number(day)).padStart(2, "0")}`;
}

/** Dates écrites en toutes lettres dans un texte, dans l'ordre. */
function datesIn(text: string): string[] {
  return [...fold(text).replace(/\b1 er\b/g, "1er").matchAll(DATE_RE)].map((m) => isoDate(m[1]!, m[2]!, m[3]!));
}

export function frenchLongDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d === 1 ? "1er" : d} ${MONTH_NAMES[m! - 1]} ${y}`;
}

const euros = (n: number, digits = 2) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} €`;
/** Décimales d'un taux publié : trois quand l'accord en donne trois (12,197 €), sinon deux. */
const digitsOf = (n: number) => (Math.round(n * 1000) % 10 !== 0 ? 3 : 2);

/* ---------- Tableaux HTML ---------- */

interface HtmlTable {
  /** Texte entre le tableau précédent (ou le début de l'article) et ce tableau. */
  before: string;
  grid: string[][];
}

/** Tableaux d'un article, cellules fusionnées recopiées dans chaque case qu'elles couvrent. */
function tablesOf(html: string): { tables: HtmlTable[]; text: string } {
  const tables: HtmlTable[] = [];
  let cursor = 0;
  const outside: string[] = [];
  for (const match of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const before = htmlText(html.slice(cursor, match.index));
    outside.push(before);
    cursor = match.index! + match[0].length;
    const rows: Array<Array<{ text: string; colspan: number; rowspan: number }>> = [];
    for (const tr of match[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...tr[1]!.matchAll(/<t([hd])([^>]*)>([\s\S]*?)<\/t\1>/gi)].map((c) => ({
        text: htmlText(c[3]!),
        colspan: Number(/colspan="(\d+)"/i.exec(c[2]!)?.[1] ?? 1),
        rowspan: Number(/rowspan="(\d+)"/i.exec(c[2]!)?.[1] ?? 1),
      }));
      rows.push(cells);
    }
    tables.push({ before, grid: toGrid(rows) });
  }
  outside.push(htmlText(html.slice(cursor)));
  return { tables, text: outside.filter(Boolean).join(" ") };
}

function toGrid(rows: Array<Array<{ text: string; colspan: number; rowspan: number }>>): string[][] {
  const carry: Array<{ text: string; left: number } | undefined> = [];
  const grid: string[][] = [];
  for (const row of rows) {
    const out: string[] = [];
    let col = 0;
    const takeCarried = () => {
      while (carry[col] && carry[col]!.left > 0) {
        out[col] = carry[col]!.text;
        carry[col]!.left--;
        col++;
      }
    };
    for (const cell of row) {
      takeCarried();
      for (let k = 0; k < Math.max(1, cell.colspan); k++) {
        out[col] = cell.text;
        carry[col] = cell.rowspan > 1 ? { text: cell.text, left: cell.rowspan - 1 } : undefined;
        col++;
      }
    }
    for (; col < carry.length; col++) {
      if (carry[col] && carry[col]!.left > 0) {
        out[col] = carry[col]!.text;
        carry[col]!.left--;
      }
    }
    grid.push(Array.from(out, (v) => v ?? ""));
  }
  return grid;
}

/* ---------- Zones des accords ---------- */

interface Zone {
  region: string;
  /** Département, ancienne région ou sous-zone couverte par l'accord ; nul pour toute la région. */
  area: string | null;
}

const IDF = "Île-de-France";
const CVL = "Centre-Val de Loire";
const BFC = "Bourgogne-Franche-Comté";
const NOR = "Normandie";
const HDF = "Hauts-de-France";
const GES = "Grand Est";
const PDL = "Pays de la Loire";
const BRE = "Bretagne";
const NAQ = "Nouvelle-Aquitaine";
const OCC = "Occitanie";
const ARA = "Auvergne-Rhône-Alpes";
const PAC = "Provence-Alpes-Côte d’Azur";
const COR = "Corse";

/** Noms de zone des titres d'accords (régions, anciennes régions, départements). */
const ZONES: Record<string, Zone> = {
  "ile de france": { region: IDF, area: null },
  "region parisienne": { region: IDF, area: null },
  "centre val de loire": { region: CVL, area: null },
  centre: { region: CVL, area: null },
  "bourgogne franche comte": { region: BFC, area: null },
  bourgogne: { region: BFC, area: "Bourgogne" },
  "franche comte": { region: BFC, area: "Franche-Comté" },
  normandie: { region: NOR, area: null },
  "haute normandie": { region: NOR, area: "Haute-Normandie" },
  "basse normandie": { region: NOR, area: "Basse-Normandie" },
  "hauts de france": { region: HDF, area: null },
  "nord pas de calais": { region: HDF, area: "Nord-Pas-de-Calais" },
  picardie: { region: HDF, area: "Picardie" },
  "grand est": { region: GES, area: null },
  alsace: { region: GES, area: "Alsace" },
  lorraine: { region: GES, area: "Lorraine" },
  "champagne ardenne": { region: GES, area: "Champagne-Ardenne" },
  "pays de la loire": { region: PDL, area: null },
  bretagne: { region: BRE, area: null },
  "nouvelle aquitaine": { region: NAQ, area: null },
  aquitaine: { region: NAQ, area: "Aquitaine" },
  limousin: { region: NAQ, area: "Limousin" },
  "poitou charentes": { region: NAQ, area: "Poitou-Charentes" },
  occitanie: { region: OCC, area: null },
  "midi pyrenees": { region: OCC, area: "Midi-Pyrénées" },
  "languedoc roussillon": { region: OCC, area: "Languedoc-Roussillon" },
  "auvergne rhone alpes": { region: ARA, area: null },
  auvergne: { region: ARA, area: "Auvergne" },
  "rhone alpes": { region: ARA, area: "Rhône-Alpes" },
  ain: { region: ARA, area: "Ain" },
  isere: { region: ARA, area: "Isère" },
  loire: { region: ARA, area: "Loire" },
  rhone: { region: ARA, area: "Rhône" },
  savoie: { region: ARA, area: "Savoie" },
  "haute savoie": { region: ARA, area: "Haute-Savoie" },
  "drome ardeche": { region: ARA, area: "Drôme et Ardèche" },
  "drome et ardeche": { region: ARA, area: "Drôme et Ardèche" },
  "provence alpes cote d azur": { region: PAC, area: null },
  "provence aples cote d azur": { region: PAC, area: null },
  "provence alpes cotes d azur": { region: PAC, area: null },
  paca: { region: PAC, area: null },
  corse: { region: COR, area: null },
};

/** Sous-zones nommées dans les colonnes d'un barème (Grand Est). */
const SUB_AREAS: Record<string, string> = { alsace: "Alsace", lorraine: "Lorraine", "champagne ardenne": "Champagne-Ardenne" };

/** Zone d'un accord d'après son titre : nom placé avant « Accord » ou « Avenant », ou entre parenthèses à la fin. */
export function titleZone(title: string): Zone | null {
  const prefix = title.split(/\b(?:Accord|Avenant)\b/)[0]!.replace(/[\s\-–]+$/, "");
  const candidates = [prefix, /\(([^)]+)\)\s*$/.exec(title.trim())?.[1] ?? ""];
  for (const candidate of candidates) {
    const key = fold(candidate);
    if (key && ZONES[key]) return ZONES[key]!;
  }
  return null;
}

/* ---------- Lecture d'un texte ---------- */

interface TextInfo {
  id: string;
  idcc: KaliIdcc;
  title: string;
  extended: boolean;
  zone: Zone;
  zoneKey: string;
  signed: string | null;
  /** Dates d'effet citées par le titre, dans l'ordre. */
  titleDates: string[];
  /** Date d'effet trouvée dans le corps du texte, à défaut du titre. */
  bodyDate: string | null;
  /** Le texte n'entre en vigueur qu'à la publication de l'arrêté d'extension. */
  atExtension: boolean;
  articles: Array<{ html: string; text: string; tables: HtmlTable[] }>;
}

function nodeText(node: KaliNode, key: string): string {
  const v = node.data?.[key];
  return typeof v === "string" ? v : "";
}

function salaryTexts(root: KaliNode): KaliNode[] {
  return (root.children ?? []).find((c) => nodeText(c, "title") === "Textes Salaires")?.children ?? [];
}

function articlesOf(node: KaliNode): KaliNode[] {
  if (node.type === "article") return [node];
  return (node.children ?? []).flatMap(articlesOf);
}

function readText(node: KaliNode, idcc: KaliIdcc): TextInfo | null {
  const title = nodeText(node, "title");
  const state = nodeText(node, "etat");
  if (!state.startsWith("VIGUEUR")) return null;
  const zone = titleZone(title);
  if (!zone) return null;
  const all = datesIn(title);
  const signedMatch = /\b(?:accord|avenant)\b[^0-9]*?\bdu\s+(1er|\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(\d{4})/.exec(fold(title).replace(/\b1 er\b/g, "1er"));
  const signed = signedMatch ? isoDate(signedMatch[1]!, signedMatch[2]!, signedMatch[3]!) : null;
  const titleDates = all.filter((d, i) => !(d === signed && i === all.indexOf(signed!)));
  const year = /\bpour\s+(?:l\s+annee\s+)?(20\d{2})\b/.exec(fold(title))?.[1];
  if (titleDates.length === 0 && year) titleDates.push(`${year}-01-01`);
  const articles = articlesOf(node).map((a) => {
    const html = nodeText(a, "content");
    const { tables, text } = tablesOf(html);
    return { html, text, tables };
  });
  const body = articles.map((a) => a.text).join(" ");
  // Date d'effet du corps : la première annoncée comme telle, jamais antérieure à l'année de signature.
  const floor = signed ? `${signed.slice(0, 4)}-01-01` : "2023-01-01";
  const bodyDate =
    [...fold(body).replace(/\b1 er\b/g, "1er").matchAll(/(?:a compter du|a partir du|entrera en vigueur le|applicables? au|au)\s+(1er|\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(20\d{2})/g)]
      .map((m) => isoDate(m[1]!, m[2]!, m[3]!))
      .find((d) => d >= floor) ?? null;
  // Accord régional limité à quelques départements (indemnités d'Auvergne-Rhône-Alpes hors départements dotés de leur propre accord).
  const limited =
    zone.region === ARA && !zone.area && /indemnit/i.test(title) && /\ballier\b/.test(fold(body)) && /\bpuy de dome\b/.test(fold(body)) ? { region: ARA, area: "Allier, Cantal, Haute-Loire et Puy-de-Dôme" } : null;
  const effectiveZone = limited ?? zone;
  return {
    id: nodeText(node, "id"),
    idcc,
    title: title.replace(/\s+/g, " ").trim(),
    extended: state === "VIGUEUR_ETEN",
    zone: effectiveZone,
    zoneKey: `${effectiveZone.region}|${effectiveZone.area ?? ""}`,
    signed,
    titleDates,
    bodyDate,
    atExtension: /publication de l arrete (?:relatif a son|d) extension|date de publication de l arrete/.test(fold(body)),
    articles,
  };
}

/* ---------- Barèmes de salaires ---------- */

interface SalaryRow {
  key: string;
  label: string;
  order: number;
  /** Montant fixé par l'accord et sa base : mensuel (151,67 h) ou annuel (1 820 h). */
  amount: number;
  basis: "mensuel" | "annuel";
  /** Taux horaire publié par l'accord, s'il figure au tableau. */
  hourly: number | null;
}

/** Barème de salaires d'un tableau, lu ligne par ligne ou, à défaut, colonne par colonne (coefficients en tête de colonne). */
function salaryTable(grid: string[][], idcc: KaliIdcc): SalaryRow[] | null {
  const width = Math.max(0, ...grid.map((r) => r.length));
  const transposed = Array.from({ length: width }, (_, c) => grid.map((r) => r[c] ?? ""));
  return salaryRows(grid, idcc) ?? salaryRows(transposed, idcc);
}

function salaryRows(grid: string[][], idcc: KaliIdcc): SalaryRow[] | null {
  const rows: SalaryRow[] = [];
  for (const cells of grid) {
    if (idcc === "2609") {
      const level = /^(?:niveau\s+)?([A-H])$/i.exec(cells[0]?.trim() ?? "")?.[1]?.toUpperCase();
      if (!level) continue;
      const amount = cells
        .slice(1)
        .map((c) => money(c, true))
        .find((v) => v !== null && v >= 1000 && v <= 8000);
      if (amount === undefined || amount === null) continue;
      rows.push({ key: `niveau-${level.toLowerCase()}`, label: `niveau ${level}`, order: ETAM_LEVELS.indexOf(level), amount, basis: "mensuel", hourly: null });
      continue;
    }
    const scale = idcc === "1597" ? BUILDING_WORKERS : PUBLIC_WORKS_WORKERS;
    const at = cells.findIndex((c) => /^\d{3}$/.test(c.trim()) && scale[Number(c.trim())] !== undefined);
    if (at < 0) continue;
    const coefficient = Number(cells[at]!.trim());
    const values = cells.slice(at + 1).map((c) => money(c, true));
    const monthly = values.find((v) => v !== null && v >= 1000 && v <= 6000) ?? null;
    const annual = values.find((v) => v !== null && v >= 12_000 && v <= 90_000) ?? null;
    const hourly = values.find((v) => v !== null && v >= 8 && v <= 60) ?? null;
    if (monthly === null && annual === null) continue;
    rows.push({
      key: `coef-${coefficient}`,
      label: scale[coefficient]!,
      order: coefficient,
      amount: (monthly ?? annual)!,
      basis: monthly !== null ? "mensuel" : "annuel",
      hourly: monthly !== null ? hourly : null,
    });
  }
  if (rows.length === 0) return null;
  const expected = idcc === "1597" ? 7 : idcc === "1702" ? 7 : 8;
  const keys = new Set(rows.map((r) => r.key));
  if (keys.size !== rows.length || keys.size < expected) return null;
  const sorted = [...rows].sort((a, b) => a.order - b.order);
  if (sorted.some((r, i) => i > 0 && r.amount < sorted[i - 1]!.amount)) return null;
  if (new Set(sorted.map((r) => r.basis)).size > 1) return null;
  return sorted;
}

/* ---------- Barèmes d'indemnités de petits déplacements ---------- */

type Allowance = "repas" | "trajet" | "transport";

interface AllowanceFact {
  type: Allowance;
  area: string | null;
  zone: string | null;
  km: string | null;
  value: number;
}

function allowanceType(text: string): Allowance | null {
  const t = fold(text);
  const hits = (["repas", "trajet", "transport"] as const).filter((k) => (k === "repas" ? /repas|dejeuner/.test(t) : t.includes(k)));
  return hits.length === 1 ? hits[0]! : null;
}

const ROMAN: Record<string, string> = { i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7" };

/** Zone d'une cellule : « Zone 1a », « 1 A », « Sous-zone 1 B », « I b », « 2 (10 à 20 km) », « 1-A 0 à 5 km ». */
export function zoneLabel(text: string): { zone: string; km: string | null } | null {
  if (money(text, true) !== null && !/^\d$/.test(text.trim())) return null;
  const t = fold(text);
  const m = /^(?:sous zone |zones? )?(vii|vi|iv|v|iii|ii|i|[1-7])(?: ?([ab]))?(?=$| |\b)/.exec(t);
  if (!m) return null;
  const rest = t.slice(m[0].length);
  if (/^\s*,\d/.test(rest)) return null;
  const zone = `${ROMAN[m[1]!] ?? m[1]}${m[2] ? m[2].toUpperCase() : ""}`;
  return { zone, km: distance(text) };
}

/** Distance d'une zone : « De 0 à 4 km », « (0/10 km) », « 10 à 20 km », « Jusqu'à 3 kms ». */
function distance(text: string): string | null {
  const t = text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const range = /(?:de\s*)?(\d+)\s*(?:a|-|\/)\s*(\d+)\s*kms?\b/.exec(t);
  if (range) return `de ${range[1]} à ${range[2]} km`;
  const upTo = /jusqu.\s*a\s*(\d+)\s*kms?\b/.exec(t);
  if (upTo) return `de 0 à ${upTo[1]} km`;
  const beyond = /(?:>|plus de|au-?dela de)\s*(\d+)\s*kms?\b/.exec(t);
  return beyond ? `au-delà de ${beyond[1]} km` : null;
}

const zoneRank = (zone: string) => Number.parseInt(zone, 10) + (zone.endsWith("B") ? 0.5 : 0);

/** Faits d'un tableau d'indemnités, ou null si sa structure n'est pas reconnue. */
function allowanceTable(table: HtmlTable): AllowanceFact[] | null {
  const { grid } = table;
  if (grid.length < 2) return null;
  const captionType = allowanceType(table.before.slice(-160));
  const facts: AllowanceFact[] = [];
  const headerRows = (until: number) => grid.slice(0, until);
  const columnType = (headers: string[][], c: number): Allowance | null => {
    for (let h = headers.length - 1; h >= 0; h--) {
      const type = allowanceType(headers[h]![c] ?? "");
      if (type) return type;
    }
    return null;
  };
  const columnArea = (headers: string[][], c: number): string | null => {
    for (const row of headers) {
      const area = SUB_AREAS[fold(row[c] ?? "")];
      if (area) return area;
    }
    return null;
  };

  // Zones en colonnes : une ligne d'en-tête porte au moins trois libellés de zone.
  const zoneRowIndex = grid.findIndex((row) => new Set(row.map((c) => (money(c) === null ? zoneLabel(c)?.zone : undefined)).filter(Boolean)).size >= 3 && !row.some((c) => money(c) !== null));
  if (zoneRowIndex >= 0) {
    const headers = headerRows(zoneRowIndex);
    for (let r = zoneRowIndex + 1; r < grid.length; r++) {
      const row = grid[r]!;
      const rowType = allowanceType(row[0] ?? "");
      for (let c = 0; c < row.length; c++) {
        const value = money(row[c] ?? "");
        if (value === null) continue;
        const zone = zoneLabel(grid[zoneRowIndex]![c] ?? "");
        const type = rowType ?? columnType(headers, c) ?? captionType;
        if (!zone || !type) return null;
        facts.push({ type, area: null, zone: type === "repas" ? null : zone.zone, km: zone.km, value });
      }
    }
    return facts.length ? facts : null;
  }

  // Zones en lignes : la première colonne porte la zone, les colonnes suivantes les montants.
  const firstData = grid.findIndex((row) => row.some((c) => money(c) !== null));
  if (firstData < 0) return null;
  const headers = headerRows(firstData);
  // Colonnes de montants : une valeur au moins y est écrite avec ses décimales ou son symbole.
  const amountColumns = new Set<number>();
  for (const row of grid.slice(firstData)) row.forEach((c, i) => i > 0 && (money(c) !== null || leadingAmount(c) !== null) && amountColumns.add(i));
  for (let r = firstData; r < grid.length; r++) {
    const row = grid[r]!;
    const label = zoneLabel(row[0] ?? "");
    const km = label ? (label.km ?? distance(row[1] ?? "")) : null;
    const rowType = label ? null : allowanceType(row[0] ?? "");
    for (let c = 1; c < row.length; c++) {
      const value = amountColumns.has(c) ? (money(row[c] ?? "", true) ?? leadingAmount(row[c] ?? "")) : null;
      if (value === null) continue;
      const type = rowType ?? columnType(headers, c) ?? captionType;
      if (!type) return null;
      if (type !== "repas" && !label) return null;
      facts.push({ type, area: columnArea(headers, c), zone: type === "repas" ? null : label!.zone, km: type === "repas" ? null : km, value });
    }
  }
  return facts.length ? facts : null;
}

/** Barème de trajet ou de transport écrit en phrases dans un article : « Zone 1 (0 à 10 km) 2,05 €. Zone 2 (10 à 20 km) 3,25 €. » */
function allowancesInText(text: string): AllowanceFact[] {
  const clean = text.replace(/[\u00a0\u202f]/g, " ");
  const first = clean.search(/\bzone\s+\d/i);
  if (first < 0) return [];
  const type = allowanceType(clean.slice(Math.max(0, first - 200), first));
  if (!type || type === "repas") return [];
  const facts: AllowanceFact[] = [];
  for (const m of clean.matchAll(/\bzone\s+(\d)\s*([ab])?\s*\(([^)]*)\)\s*:?\s*(\d+(?:,\d{1,2})?)\s*(?:€|euros?)/gi)) {
    facts.push({ type, area: null, zone: `${m[1]}${m[2] ? m[2].toUpperCase() : ""}`, km: distance(m[3]!), value: Number(m[4]!.replace(",", ".")) });
  }
  return facts.length >= 4 ? facts : [];
}

/** Indemnité de repas écrite dans le corps d'un article (« l'indemnité de repas est portée à : 12 € »). */
function mealInText(text: string): number | null {
  const sentences = text.split(/(?<=[.;])\s+/);
  const article = fold(text);
  for (const sentence of sentences) {
    const s = fold(sentence);
    const amount = /(\d+(?:,\d{1,2})?) ?(?:€|euros?)/.exec(sentence.replace(/[  ]/g, " "))?.[1];
    if (!amount) continue;
    const aboutMeal = /indemnite (?:minimale )?de repas|indemnites de repas/.test(s) || (/^elle est fixee/.test(s) && /dejeuner|repas/.test(article) && !/trajet|transport/.test(article));
    if (!aboutMeal || /trajet|transport/.test(s)) continue;
    const value = Number(amount.replace(",", "."));
    if (value >= 7 && value <= 25) return value;
  }
  return null;
}

/** Contrôle d'un barème d'indemnités : zones uniques, montants croissants avec la distance, repas unique. */
function validAllowances(facts: AllowanceFact[]): AllowanceFact[] | null {
  const out: AllowanceFact[] = [];
  const groups = new Map<string, AllowanceFact[]>();
  for (const f of facts) groups.set(`${f.type}|${f.area ?? ""}`, [...(groups.get(`${f.type}|${f.area ?? ""}`) ?? []), f]);
  for (const [key, list] of groups) {
    if (key.startsWith("repas")) {
      const values = [...new Set(list.map((f) => f.value))];
      if (values.length !== 1 || values[0]! < 7 || values[0]! > 25) return null;
      out.push({ ...list[0]!, zone: null, km: null });
      continue;
    }
    const byZone = new Map<string, AllowanceFact>();
    for (const f of list) {
      const seen = byZone.get(f.zone!);
      if (seen && seen.value !== f.value) return null;
      byZone.set(f.zone!, f);
    }
    const sorted = [...byZone.values()].sort((a, b) => zoneRank(a.zone!) - zoneRank(b.zone!));
    if (sorted.length < 4) return null;
    if (sorted.some((f, i) => f.value < 0.2 || f.value > 60 || (i > 0 && f.value < sorted[i - 1]!.value))) return null;
    out.push(...sorted);
  }
  return out;
}

/* ---------- Dates d'effet des tableaux ---------- */

interface Dated<T> {
  date: string;
  facts: T;
}

/**
 * Date d'effet de chaque tableau d'un même barème : autant de dates au titre que de tableaux, dans l'ordre ;
 * sinon la date annoncée juste avant le tableau ; sinon la date d'effet du texte.
 */
function dateTables<T>(info: TextInfo, tables: Array<{ table: HtmlTable; facts: T }>): Array<Dated<T>> {
  const fallback = info.titleDates[0] ?? info.bodyDate ?? info.signed;
  if (!fallback) return [];
  const distinct = [...new Set(info.titleDates)].sort();
  if (tables.length > 1 && distinct.length === tables.length) return tables.map((t, i) => ({ date: distinct[i]!, facts: t.facts }));
  const floor = info.signed ? `${info.signed.slice(0, 4)}-01-01` : "2023-01-01";
  return tables.map((t) => {
    const near = datesIn(t.table.before.slice(-120)).filter((d) => d >= floor);
    return { date: near.length === 1 ? near[0]! : fallback, facts: t.facts };
  });
}

/* ---------- SMIC ---------- */

export interface Smic {
  value: number;
  since: string;
  series: Record<string, number>;
}

/** SMIC horaire brut (série Insee 000822484) : valeur en vigueur, date de la dernière revalorisation, revalorisations depuis 2020. */
export function parseSmic(xml: string): Smic | null {
  const observations = [...xml.matchAll(/<Obs\b[^>]*\bTIME_PERIOD="(\d{4})-(\d{2})"[^>]*\bOBS_VALUE="([\d.]+)"/g)]
    .map((m) => ({ month: `${m[1]}-${m[2]}`, value: Number(m[3]) }))
    .filter((o) => Number.isFinite(o.value) && o.value > 0)
    .sort((a, b) => a.month.localeCompare(b.month));
  if (observations.length === 0) return null;
  const series: Record<string, number> = {};
  let previous: number | null = null;
  let since = observations[0]!.month;
  for (const o of observations) {
    if (o.value !== previous) {
      since = o.month;
      if (o.month >= "2020-01") series[o.month] = o.value;
      previous = o.value;
    }
  }
  return { value: observations.at(-1)!.value, since: `${since}-01`, series };
}

/* ---------- Références ---------- */

const legifrance = (id: string) => `https://www.legifrance.gouv.fr/conv_coll/id/${id}`;

function zoneSuffix(area: string | null): string {
  return area ? `, ${area}` : "";
}

function zoneText(zone: Zone, area: string | null): string {
  const where = area ?? zone.area;
  return where ? `${where}, région ${zone.region}` : `région ${zone.region}`;
}

function textNote(info: TextInfo): string {
  const kind = info.title.match(/\b(Accord|Avenant)\b/)?.[1]?.toLowerCase() ?? "accord";
  return `${kind} du ${info.signed ? frenchLongDate(info.signed) : "texte"}`;
}

function base(info: TextInfo, date: string): Pick<SourceRecord, "currency" | "country" | "city" | "tradeFamily" | "subFamily" | "taxBasis" | "vatRate" | "reliability" | "series" | "sourceUrl" | "priceMin" | "priceMax" | "sampleSize"> & { priceDate: string; period: string } {
  return {
    currency: "EUR",
    country: "FR",
    city: null,
    tradeFamily: null,
    subFamily: null,
    taxBasis: null,
    vatRate: null,
    priceDate: date,
    period: frenchLongDate(date),
    priceMin: null,
    priceMax: null,
    sampleSize: null,
    reliability: "haute",
    series: null,
    sourceUrl: legifrance(info.id),
  };
}

/** Anciennes régions, couvertes ensemble par la région actuelle. */
const FORMER_REGIONS = new Set(["Bourgogne", "Franche-Comté", "Haute-Normandie", "Basse-Normandie", "Nord-Pas-de-Calais", "Picardie", "Alsace", "Lorraine", "Champagne-Ardenne", "Aquitaine", "Limousin", "Poitou-Charentes", "Midi-Pyrénées", "Languedoc-Roussillon", "Auvergne", "Rhône-Alpes"]);

/**
 * Quand une région a, pour une même nature, un accord régional et des accords de ses anciennes régions, seul
 * l'ensemble le plus récent est repris : l'autre a été remplacé.
 */
function supersede<T>(selections: Map<string, Selected<T>>): Map<string, Selected<T>> {
  const out = new Map(selections);
  const regions = new Set([...selections.values()].map((s) => s.info.zone.region));
  for (const region of regions) {
    const whole = out.get(`${region}|`);
    const former = [...out.entries()].filter(([, s]) => s.info.zone.region === region && s.info.zone.area && FORMER_REGIONS.has(s.info.zone.area));
    if (!whole || former.length === 0) continue;
    const latestFormer = former.reduce((max, [, s]) => (s.current.date > max ? s.current.date : max), "");
    if (latestFormer > whole.current.date) out.delete(`${region}|`);
    else for (const [key, s] of former) if (s.current.date < whole.current.date) out.delete(key);
  }
  return out;
}

interface Selected<T> {
  info: TextInfo;
  current: Dated<T>;
  next: Dated<T> | null;
}

/** Texte le plus récent déjà en vigueur de chaque zone ; un barème à venir du même texte ou d'un texte plus récent est gardé en note. */
function latestInForce<T>(candidates: Array<{ info: TextInfo; dated: Array<Dated<T>> }>, today: string): Selected<T> | null {
  const flat = candidates.flatMap((c) => c.dated.map((d) => ({ info: c.info, dated: d })));
  const inForce = flat.filter((x) => x.dated.date <= today).sort((a, b) => b.dated.date.localeCompare(a.dated.date) || (b.info.signed ?? "").localeCompare(a.info.signed ?? ""));
  const best = inForce[0];
  if (!best) return null;
  const upcoming = flat.filter((x) => x.dated.date > today).sort((a, b) => a.dated.date.localeCompare(b.dated.date))[0];
  return { info: best.info, current: best.dated, next: upcoming?.dated ?? null };
}

export function parseKali(resources: KaliResource[], smicResource: SmicResource | null, options: { today?: string } = {}): SourceRecord[] {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const smic = smicResource ? parseSmic(smicResource.xml) : null;
  const records: SourceRecord[] = [];

  if (smic && smicResource) {
    records.push({
      externalKey: "smic:horaire",
      groupKey: "smic:horaire",
      designation: "SMIC horaire brut",
      description: `Salaire minimum interprofessionnel de croissance, montant horaire brut en vigueur depuis le ${frenchLongDate(smic.since)}, publié par l’Insee. Plancher légal de toute rémunération, hors charges patronales, congés payés et frais : ce n’est pas un taux de facturation.`,
      kind: "main_oeuvre",
      scope: null,
      unit: "h",
      unitPrice: decimal(smic.value),
      currency: "EUR",
      country: "FR",
      region: null,
      city: null,
      tradeFamily: null,
      subFamily: null,
      taxBasis: null,
      vatRate: null,
      valueStatus: "source",
      priceDate: smic.since,
      period: frenchLongDate(smic.since),
      priceMin: null,
      priceMax: null,
      sampleSize: null,
      aggregation: "Montant fixé par décret, repris de la série mensuelle de l’Insee.",
      reliability: "haute",
      series: smic.series,
      sourceRef: "Insee, série 000822484, montant du SMIC brut horaire",
      sourceUrl: smicResource.url,
      attributes: { serie: "000822484" },
      regulated: true,
    });
  }

  for (const resource of resources) {
    const texts = salaryTexts(resource.json as KaliNode)
      .map((node) => readText(node, resource.idcc))
      .filter((t): t is TextInfo => t !== null && (t.signed ?? t.titleDates[0] ?? "") >= "2023-01-01");
    const convention = CONVENTIONS[resource.idcc];

    // Salaires : un barème par texte (ou un par date d'effet), puis le plus récent en vigueur par zone.
    const salaryCandidates = new Map<string, Array<{ info: TextInfo; dated: Array<Dated<SalaryRow[]>> }>>();
    for (const info of texts) {
      const tables = info.articles.flatMap((a) => a.tables.map((table) => ({ table, facts: salaryTable(table.grid, resource.idcc) }))).filter((t): t is { table: HtmlTable; facts: SalaryRow[] } => t.facts !== null);
      if (tables.length === 0) continue;
      const dated = dateTables(info, tables);
      salaryCandidates.set(info.zoneKey, [...(salaryCandidates.get(info.zoneKey) ?? []), { info, dated }]);
    }
    const salaries = new Map<string, Selected<SalaryRow[]>>();
    for (const [key, candidates] of salaryCandidates) {
      const selected = latestInForce(candidates, today);
      if (selected) salaries.set(key, selected);
    }
    for (const selected of supersede(salaries).values()) {
      const { info, current, next } = selected;
      for (const row of current.facts) {
        const hours = row.basis === "mensuel" ? MONTH_HOURS : YEAR_HOURS;
        const computed = row.hourly ?? row.amount / hours;
        const floor = smic && smic.value > computed && smic.since <= today ? smic : null;
        const value = floor ? floor.value : computed;
        const upcoming = next?.facts.find((r) => r.key === row.key);
        const amountText = row.basis === "mensuel" ? `${euros(row.amount, row.amount % 1 ? 2 : 0)} par mois pour 35 heures hebdomadaires` : `${euros(row.amount, 0)} par an pour 35 heures hebdomadaires`;
        const hourlyText = row.hourly !== null ? `, soit ${euros(row.hourly, digitsOf(row.hourly))} de l’heure selon l’accord` : `, soit ${euros(computed, 2)} de l’heure sur ${row.basis === "mensuel" ? "151,67 heures par mois" : "1 820 heures par an"}`;
        records.push({
          externalKey: `kali:${resource.idcc}:salaire:${slug(info.zone.region)}:${slug(info.zone.area ?? "")}:${row.key}`,
          groupKey: `kali:${resource.idcc}:salaire:${row.key}`,
          designation: `Salaire horaire minimal, ${convention.worker}, ${row.label}${zoneSuffix(info.zone.area)}`,
          description: [
            `Salaire minimal des ${convention.population}, ${zoneText(info.zone, null)}, fixé par l’${textNote(info)} à compter du ${frenchLongDate(current.date)} : ${amountText}${hourlyText}.`,
            floor ? `Inférieur au SMIC horaire en vigueur depuis le ${frenchLongDate(floor.since)}, ${euros(floor.value)} : le SMIC s’applique et il est retenu.` : null,
            info.extended ? null : "Accord non étendu à la date de lecture : il s’impose aux entreprises adhérentes des organisations signataires.",
            info.atExtension && !info.titleDates.length ? "Entrée en vigueur à la publication de l’arrêté d’extension." : null,
            upcoming ? `À compter du ${frenchLongDate(next!.date)} : ${euros(upcoming.amount, upcoming.amount % 1 ? 2 : 0)} ${upcoming.basis === "mensuel" ? "par mois" : "par an"}.` : null,
            "Salaire brut, hors charges patronales, congés payés, indemnités et frais de chantier : ce n’est pas un taux de facturation.",
          ]
            .filter(Boolean)
            .join(" "),
          kind: "main_oeuvre",
          scope: null,
          unit: "h",
          unitPrice: decimal(value),
          region: info.zone.region,
          valueStatus: row.hourly !== null && !floor ? "source" : "calculee",
          aggregation: floor ? "SMIC horaire retenu, le minimum conventionnel lui étant inférieur." : row.hourly !== null ? "Taux horaire fixé par l’accord." : `Salaire ${row.basis} de l’accord divisé par ${row.basis === "mensuel" ? "151,67 heures" : "1 820 heures"}.`,
          sourceRef: `IDCC ${resource.idcc}, ${info.title}`.slice(0, 300),
          attributes: {
            idcc: resource.idcc,
            texte: info.id,
            etat: info.extended ? "étendu" : "non étendu",
            [row.basis === "mensuel" ? "salaireMensuel" : "salaireAnnuel"]: euros(row.amount),
            ...(row.hourly !== null ? { tauxHoraireAccord: euros(row.hourly, digitsOf(row.hourly)) } : {}),
            ...(floor ? { smic: euros(floor.value) } : {}),
            ...(upcoming ? { prochainBareme: `${frenchLongDate(next!.date)} : ${euros(upcoming.amount)}` } : {}),
          },
          regulated: true,
          ...base(info, floor && floor.since > current.date ? floor.since : current.date),
        });
      }
    }

    // Indemnités de petits déplacements (ouvriers seulement).
    if (resource.idcc === "2609") continue;
    const allowanceCandidates = new Map<string, Array<{ info: TextInfo; dated: Array<Dated<AllowanceFact[]>> }>>();
    for (const info of texts) {
      const tables: Array<{ table: HtmlTable; facts: AllowanceFact[] }> = [];
      const written: AllowanceFact[] = [];
      for (const article of info.articles) {
        if (article.tables.length === 0) written.push(...allowancesInText(article.text));
        for (const table of article.tables) {
          if (salaryTable(table.grid, resource.idcc)) continue;
          const raw = allowanceTable(table);
          if (!raw) continue;
          const caption = fold(table.before.slice(-260));
          const lyon = /metropole de lyon/.test(caption) ? (/ne sont pas situes|hors/.test(caption) ? "Rhône hors métropole de Lyon" : "Rhône, métropole de Lyon") : null;
          tables.push({ table, facts: raw.map((f) => ({ ...f, area: f.area ?? lyon })) });
        }
      }
      if (tables.length === 0 && written.length) tables.push({ table: { before: "", grid: [] }, facts: written });
      if (tables.length === 0) continue;
      // Indemnité de repas écrite dans le texte quand aucun tableau ne la donne.
      const tableMeal = tables.some((t) => t.facts.some((f) => f.type === "repas"));
      const meal = tableMeal ? null : (info.articles.map((a) => mealInText(a.text)).find((v) => v !== null) ?? null);
      const dated = dateTables(info, tables)
        .map((d) => {
          const facts = meal === null ? d.facts : [...d.facts, { type: "repas" as const, area: null, zone: null, km: null, value: meal }];
          const valid = validAllowances(facts);
          return valid ? { date: d.date, facts: valid } : null;
        })
        .filter((d): d is Dated<AllowanceFact[]> => d !== null);
      if (dated.length === 0) continue;
      // Deux tableaux de même date (métropole de Lyon et reste du Rhône) forment un seul barème.
      const merged = new Map<string, AllowanceFact[]>();
      for (const d of dated) merged.set(d.date, [...(merged.get(d.date) ?? []), ...d.facts]);
      allowanceCandidates.set(info.zoneKey, [...(allowanceCandidates.get(info.zoneKey) ?? []), { info, dated: [...merged].map(([date, facts]) => ({ date, facts })) }]);
    }
    const allowances = new Map<string, Selected<AllowanceFact[]>>();
    for (const [key, candidates] of allowanceCandidates) {
      const selected = latestInForce(candidates, today);
      if (selected) allowances.set(key, selected);
    }
    for (const selected of supersede(allowances).values()) {
      const { info, current, next } = selected;
      const seen = new Set<string>();
      for (const fact of current.facts) {
        const area = fact.area ?? info.zone.area;
        const item = fact.type === "repas" ? "repas" : `${fact.type}-zone-${fact.zone!.toLowerCase()}`;
        const externalKey = `kali:${resource.idcc}:indemnite:${slug(info.zone.region)}:${slug(area ?? "")}:${item}`;
        if (seen.has(externalKey)) continue;
        seen.add(externalKey);
        const upcoming = next?.facts.find((f) => f.type === fact.type && f.zone === fact.zone && (f.area ?? info.zone.area) === area);
        const what = fact.type === "repas" ? "Indemnité de repas" : `Indemnité de ${fact.type}, zone ${fact.zone}${fact.km ? ` ${fact.km}` : ""}`;
        records.push({
          externalKey,
          groupKey: `kali:${resource.idcc}:indemnite:${item}`,
          designation: `${what}, ${convention.worker}${zoneSuffix(area)}`,
          description: [
            `${what}, due par jour de travail aux ${convention.short} non sédentaires, ${zoneText(info.zone, area)}, fixée par l’${textNote(info)} à compter du ${frenchLongDate(current.date)}.`,
            fact.type === "repas" ? "Elle indemnise le supplément de frais du repas pris hors de la résidence habituelle." : fact.type === "trajet" ? "Elle indemnise la sujétion du trajet quotidien entre le point de départ et le chantier." : "Elle indemnise les frais de transport quotidiens entre le point de départ et le chantier.",
            info.extended ? null : "Accord non étendu à la date de lecture : il s’impose aux entreprises adhérentes des organisations signataires.",
            upcoming && upcoming.value !== fact.value ? `À compter du ${frenchLongDate(next!.date)} : ${euros(upcoming.value)}.` : null,
          ]
            .filter(Boolean)
            .join(" "),
          kind: "main_oeuvre",
          scope: null,
          unit: "jour",
          unitPrice: decimal(fact.value),
          region: info.zone.region,
          valueStatus: "source",
          aggregation: "Montant fixé par l’accord.",
          sourceRef: `IDCC ${resource.idcc}, ${info.title}`.slice(0, 300),
          attributes: {
            idcc: resource.idcc,
            texte: info.id,
            etat: info.extended ? "étendu" : "non étendu",
            ...(fact.zone ? { zone: fact.zone } : {}),
            ...(fact.km ? { distance: fact.km } : {}),
            ...(upcoming && upcoming.value !== fact.value ? { prochainBareme: `${frenchLongDate(next!.date)} : ${euros(upcoming.value)}` } : {}),
          },
          regulated: true,
          ...base(info, current.date),
        });
      }
    }
  }
  return records;
}
