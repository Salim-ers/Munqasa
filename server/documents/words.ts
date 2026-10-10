/**
 * Montants en toutes lettres (bordereau des prix) : orthographe traditionnelle française.
 * « vingt » et « cent » prennent un s quand ils sont multipliés et terminent le nombre (quatre-vingts,
 * deux cents), « mille » est invariable, « et » relie un aux dizaines de vingt à soixante-dix.
 */

const UNITS = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"];
const TENS = ["", "dix", "vingt", "trente", "quarante", "cinquante", "soixante"];

/** 0 à 99. */
function belowHundred(n: number, final: boolean): string {
  if (n <= 16) return UNITS[n]!;
  if (n < 20) return `dix-${UNITS[n - 10]}`;
  const ten = Math.floor(n / 10);
  const unit = n % 10;
  if (ten === 7) return n === 71 ? "soixante et onze" : `soixante-${belowHundred(n - 60, final)}`;
  if (ten === 9) return `quatre-vingt-${belowHundred(n - 80, final)}`;
  if (ten === 8) return unit === 0 ? (final ? "quatre-vingts" : "quatre-vingt") : `quatre-vingt-${UNITS[unit]}`;
  if (unit === 0) return TENS[ten]!;
  if (unit === 1) return `${TENS[ten]} et un`;
  return `${TENS[ten]}-${UNITS[unit]}`;
}

/** 0 à 999. */
function belowThousand(n: number, final: boolean): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds === 1) parts.push("cent");
  else if (hundreds > 1) parts.push(`${UNITS[hundreds]} ${rest === 0 && final ? "cents" : "cent"}`);
  if (rest > 0 || hundreds === 0) parts.push(belowHundred(rest, final));
  return parts.join(" ");
}

export function integerInWords(value: number): string {
  if (!Number.isFinite(value) || value < 0) throw new Error("Montant invalide.");
  const n = Math.floor(value);
  if (n === 0) return "zéro";
  const scales: Array<[number, string, string]> = [
    [1_000_000_000, "milliard", "milliards"],
    [1_000_000, "million", "millions"],
  ];
  let rest = n;
  const parts: string[] = [];
  for (const [size, one, many] of scales) {
    const count = Math.floor(rest / size);
    if (count > 0) {
      parts.push(`${belowThousand(count, true)} ${count > 1 ? many : one}`);
      rest %= size;
    }
  }
  const thousands = Math.floor(rest / 1000);
  if (thousands > 0) {
    parts.push(thousands === 1 ? "mille" : `${belowThousand(thousands, false)} mille`);
    rest %= 1000;
  }
  if (rest > 0) parts.push(belowThousand(rest, true));
  return parts.join(" ");
}

const CURRENCY_WORDS: Record<string, { one: string; many: string; cents: string }> = {
  MAD: { one: "dirham", many: "dirhams", cents: "centimes" },
  EUR: { one: "euro", many: "euros", cents: "centimes" },
};

/** « 1250.50 » en MAD : « mille deux cent cinquante dirhams et cinquante centimes ». */
export function amountInWords(amount: string | number, currency: string): string {
  const [intPart, decPart = ""] = String(amount).split(".");
  const units = Number(intPart);
  const cents = Number(`${decPart}00`.slice(0, 2));
  const words = CURRENCY_WORDS[currency] ?? { one: currency, many: currency, cents: "centimes" };
  // « un million d'euros » : la préposition « de » s'élide devant un million ou un milliard rond.
  const roundScale = units >= 1_000_000 && units % 1_000_000 === 0;
  const unitWord = units > 1 ? words.many : words.one;
  const preposition = /^[aeiouyé]/i.test(unitWord) ? "d’" : "de ";
  const main = `${integerInWords(units)} ${roundScale ? `${preposition}${unitWord}` : unitWord}`;
  if (!cents) return main;
  return `${main} et ${integerInWords(cents)} ${cents > 1 ? words.cents : words.cents.replace(/s$/, "")}`;
}
