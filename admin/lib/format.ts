/** Formatage français des nombres, montants et dates. Les montants arrivent en chaînes (precision numeric). */

export type Currency = "MAD" | "EUR";

const numberFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

export function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? numberFmt.format(n) : "—";
}

/** Montant dans sa devise d'origine (jamais converti silencieusement). */
export function formatMoney(value: number | string | null | undefined, currency: Currency): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
}

/** Montant abrégé pour les indicateurs (1,2 M MAD). */
export function formatMoneyCompact(value: number | string, currency: Currency): string {
  const n = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(n);
}

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const relative = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" });

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return dateFmt.format(new Date(value));
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return dateTimeFmt.format(new Date(value));
}

/** « dans 3 jours », « hier »… */
export function formatRelative(value: string | Date | null | undefined, now = Date.now()): string {
  if (!value) return "—";
  const diff = new Date(value).getTime() - now;
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (abs < hour) return relative.format(Math.round(diff / minute), "minute");
  if (abs < day) return relative.format(Math.round(diff / hour), "hour");
  if (abs < 30 * day) return relative.format(Math.round(diff / day), "day");
  return formatDate(value);
}

/** Adresse IP lisible : IPv6 compressée, poste local nommé. */
export function formatIp(ip: string | null | undefined): string {
  if (!ip) return "Adresse inconnue";
  if (/^[0:]+$/.test(ip) || ip === "::1" || ip === "127.0.0.1" || /^0{4}(:0{4}){6}:0{3}1$/.test(ip)) return "Poste local";
  if (!ip.includes(":")) return ip;
  const groups = ip.split(":").map((g) => g.replace(/^0+(?=.)/, ""));
  const compressed = groups.join(":").replace(/(^|:)0(:0)+(:|$)/, "::");
  return compressed.replace(/:{3,}/, "::");
}

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  brouillon: "Brouillon",
  analyse: "Analyse en cours",
  etude_technique: "Étude technique",
  chiffrage: "Chiffrage",
  controle_qualite: "Contrôle qualité",
  pret_a_remettre: "Prêt à remettre",
  archive: "Archivé",
};

export const COUNTRY_LABELS: Record<string, string> = { MA: "Maroc", FR: "France" };
