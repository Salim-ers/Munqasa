/** Libellés communs des prix de la bibliothèque : zone, période, ton de la fiabilité. */
import { COUNTRY_LABELS } from "../../shared/enums";
import { formatDate } from "./format";
import type { PriceItem } from "./types";

export const reliabilityTone = { haute: "success", moyenne: "accent", faible: "warning" } as const;

/** Zone d'un prix : ville, région, sinon niveau national. */
export function zoneLabel(p: Pick<PriceItem, "city" | "region" | "country">): string {
  if (p.city) return p.region ? `${p.city}, ${p.region}` : p.city;
  if (p.region) return `Région ${p.region}`;
  return `${COUNTRY_LABELS[p.country]}, niveau national`;
}

/** Période ou date du prix ; la méthode (moyenne, médiane) figure dans la fiche du prix. */
export function whenLabel(p: Pick<PriceItem, "period" | "priceDate">): string {
  return p.period ? (/^\d{4}$/.test(p.period) ? `Année ${p.period}` : p.period) : formatDate(p.priceDate);
}
