/**
 * Calcul décimal exact pour les montants, quantités et prix (jamais de flottants).
 * Arrondi commercial (demi supérieur), précision large pour les produits intermédiaires.
 */
import { Decimal } from "decimal.js";

export const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = Decimal;
