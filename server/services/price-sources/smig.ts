/**
 * Salaire minimum légal des activités non agricoles (SMIG, Maroc) : décrets fixant le montant du salaire
 * minimum, lus dans l'édition arabe du Bulletin officiel publiée par le Secrétariat général du
 * Gouvernement. Les textes officiels ne sont pas protégés par le droit d'auteur (loi n° 2-00, article 8).
 *
 * Le montant horaire est repris de l'article qui le fixe « pour l'heure de travail dans les activités non
 * agricoles », avec sa date d'effet ; chaque décret lu ajoute un point à la série. Plancher légal, hors
 * charges sociales, congés et frais : jamais un coût de main-d'œuvre de chantier.
 */
import type { SourceRecord } from "../../../shared/prices.js";
import { readPdfText } from "../pdf-text.js";
import { decimal } from "./common.js";

export interface BulletinResource {
  url: string;
  title: string;
  data: Uint8Array;
}

/** Texte arabe comparable : sans diacritiques, sans allongement, sans alif (les ligatures lam-alif sont extraites dans le désordre). */
export function arabicKey(text: string): string {
  return text
    .replace(/[ـً-ٰٟ]/g, "")
    .replace(/[آأإاٱ]/g, "")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

const MONTHS: Array<[string, number]> = [
  ["يناير", 1],
  ["فبراير", 2],
  ["مارس", 3],
  ["أبريل", 4],
  ["ماي", 5],
  ["يونيو", 6],
  ["يوليوز", 7],
  ["غشت", 8],
  ["شتنبر", 9],
  ["أكتوبر", 10],
  ["نونبر", 11],
  ["دجنبر", 12],
  ["ديسمبر", 12],
  ["نوفمبر", 11],
  ["سبتمبر", 9],
  ["أغسطس", 8],
  ["يوليو", 7],
];
const MONTH_BY_KEY = new Map(MONTHS.map(([name, n]) => [arabicKey(name), n]));

const HOUR_NON_AGRICULTURAL = arabicKey("ساعة الشغل في النشاطات غير الفلاحية");
const FIRST_OF = arabicKey("فاتح");
const DIRHAMS = arabicKey("درهما");
const DECREE = arabicKey("مرسوم رقم");

type PageItems = { width: number; items: Array<{ text: string; x: number; y: number; width: number }> };

/** Lignes d'un ensemble de mots, de haut en bas, chaque ligne lue de droite à gauche. */
function lines(items: PageItems["items"]): string {
  const rows = new Map<number, PageItems["items"]>();
  for (const item of items) {
    const key = [...rows.keys()].find((y) => Math.abs(y - item.y) <= 2) ?? item.y;
    rows.set(key, [...(rows.get(key) ?? []), item]);
  }
  return [...rows.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => row.sort((a, b) => b.x - a.x).map((i) => i.text).join(" "))
    .join(" ");
}

/**
 * Lectures possibles d'une page arabe : sur deux colonnes (droite puis gauche) ou sur toute la largeur.
 * Le Bulletin officiel emploie les deux mises en page selon les textes.
 */
function readings(page: PageItems): string[] {
  const right = page.items.filter((i) => i.x + i.width / 2 >= page.width / 2);
  const left = page.items.filter((i) => i.x + i.width / 2 < page.width / 2);
  return [`${lines(right)} ${lines(left)}`, lines(page.items)];
}

export interface MinimumWage {
  decree: string | null;
  hourly: number;
  since: string;
  bulletin: BulletinResource;
}

/**
 * Montant horaire non agricole et date d'effet dans le texte d'une page lue dans l'ordre arabe : article
 * « à compter du premier <mois> <année>, est fixé à … (17,92 dirhams) le montant du salaire minimum légal
 * versé aux salariés pour l'heure de travail dans les activités non agricoles ».
 */
export function wageInText(page: string, catalogDecree: string | null): Omit<MinimumWage, "bulletin"> | null {
  const text = arabicKey(page);
  const at = text.indexOf(HOUR_NON_AGRICULTURAL);
  if (at < 0) return null;
  const before = text.slice(Math.max(0, at - 400), at);
  const amount = [...before.matchAll(new RegExp(`\\(\\s*(\\d{1,3}[,.]\\d{2})\\s*${DIRHAMS}\\s*\\)`, "g"))].at(-1)?.[1];
  const date = [...before.matchAll(new RegExp(`${FIRST_OF}\\s+(\\S+)\\s+(\\d{4})`, "g"))].at(-1);
  // Numéro du décret : lu dans son intitulé, ou à défaut celui que le catalogue associe au Bulletin (intitulé en caractères ornés illisibles).
  const decree = [...text.slice(0, at).matchAll(new RegExp(`${DECREE}\\s+(\\d\\.\\d{2}\\.\\d{2,4})`, "g"))].at(-1)?.[1] ?? catalogDecree;
  const month = date ? MONTH_BY_KEY.get(date[1]!) : undefined;
  if (!amount || !date || !month) return null;
  const hourly = Number(amount.replace(",", "."));
  // Vraisemblance : le salaire minimum horaire marocain se situe entre 10 et 40 dirhams.
  if (!(hourly >= 10 && hourly <= 40)) return null;
  return { decree, hourly, since: `${date[2]}-${String(month).padStart(2, "0")}-01` };
}

/** Montant horaire non agricole fixé par le décret publié dans un Bulletin officiel, ou null s'il n'y figure pas. */
export async function readMinimumWage(bulletin: BulletinResource): Promise<MinimumWage | null> {
  const pages = await readPdfText(bulletin.data);
  const catalogDecree = /\b(\d\.\d{2}\.\d{2,4})\b/.exec(bulletin.title)?.[1] ?? null;
  for (const text of pages.flatMap((page) => readings(page))) {
    const wage = wageInText(text, catalogDecree);
    if (wage) return { ...wage, bulletin };
  }
  return null;
}

const MONTH_NAMES = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const longDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d === 1 ? "1er" : d} ${MONTH_NAMES[m! - 1]} ${y}`;
};

export async function parseSmig(bulletins: BulletinResource[], options: { today?: string } = {}): Promise<SourceRecord[]> {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const wages = (await Promise.all(bulletins.map(readMinimumWage))).filter((w): w is MinimumWage => w !== null).sort((a, b) => a.since.localeCompare(b.since));
  const current = wages.filter((w) => w.since <= today).at(-1);
  if (!current) return [];
  const series = Object.fromEntries(wages.filter((w) => w.since <= today).map((w) => [w.since.slice(0, 7), w.hourly]));
  const number = /BO_(\d+)/i.exec(current.bulletin.url)?.[1];
  return [
    {
      externalKey: "smig:horaire",
      groupKey: "smig:horaire",
      designation: "Salaire minimum légal horaire, activités non agricoles",
      description: `Salaire minimum interprofessionnel garanti des activités non agricoles, fixé par ${current.decree ? `le décret n° ${current.decree}` : "décret"} à compter du ${longDate(current.since)}, Bulletin officiel${number ? ` n° ${number}` : ""}. Plancher légal de toute rémunération horaire, hors charges sociales, congés payés et frais : ce n’est pas un coût de main-d’œuvre de chantier.`,
      kind: "main_oeuvre",
      scope: null,
      unit: "h",
      unitPrice: decimal(current.hourly),
      currency: "MAD",
      country: "MA",
      region: null,
      city: null,
      tradeFamily: null,
      subFamily: null,
      taxBasis: null,
      vatRate: null,
      valueStatus: "source",
      priceDate: current.since,
      period: longDate(current.since),
      priceMin: null,
      priceMax: null,
      sampleSize: null,
      aggregation: "Montant fixé par décret.",
      reliability: "haute",
      series,
      sourceRef: `${current.decree ? `Décret n° ${current.decree}, article premier` : "Décret, article premier"}${number ? `, Bulletin officiel n° ${number}` : ""}`,
      sourceUrl: current.bulletin.url,
      attributes: { ...(current.decree ? { decret: current.decree } : {}), ...(number ? { bulletin: number } : {}) },
      regulated: true,
    },
  ];
}
