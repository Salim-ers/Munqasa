/**
 * Moteur financier des devis, déterministe : calcul décimal exact, jamais de flottants, arrondi commercial au
 * centime (demi supérieur) aux seuls endroits fixés ci-dessous. Règles d'application :
 *
 * 1. Prix unitaire HT d'une ligne, arrondi au centime : direct (saisi, repris de la bibliothèque, de la DPGF
 *    ou d'un sous-détail), ou décomposé : déboursé sec (fourniture + pose), frais de chantier au taux du devis
 *    sur ce déboursé sec, puis frais généraux, aléas et marge selon les bases et le mode du devis, par le même
 *    moteur que les sous-détails. Les coefficients ne s'appliquent qu'aux lignes décomposées : un prix direct
 *    est déjà un prix de vente, il n'est jamais majoré une seconde fois.
 * 2. Montant brut de la ligne : quantité × prix unitaire, arrondi au centime.
 * 3. Remise de ligne : montant net = brut × (1 − taux), arrondi au centime ; la remise vaut brut − net.
 * 4. Sous-total d'une section : somme des montants nets de ses lignes. Une option n'entre dans aucun total.
 * 5. Total des lignes : somme des montants nets ; la remise globale, au taux du devis, s'applique une seule
 *    fois sur ce total, arrondie au centime ; total HT = total des lignes − remise globale.
 * 6. TVA en régime normal : base de chaque taux = montants nets de ses lignes, la remise globale y étant
 *    répartie au prorata (reste d'arrondi porté par la plus forte base) ; TVA de chaque taux = base × taux,
 *    arrondie au centime ; total TTC = total HT + TVA. Autoliquidation, franchise ou exonération : aucune TVA
 *    facturée, la mention légale correspondante est imprimée.
 * 7. Acompte : taux × total TTC arrondi au centime, ou montant fixe ramené au total TTC s'il le dépasse.
 * 8. Une ligne sans prix ou sans quantité n'a pas de montant : les totaux sont partiels, jamais complétés
 *    par un zéro ; la TVA et le TTC ne sont calculés que si tous les montants et tous les taux sont connus.
 */
import type { MarginMode, RateBase, TaxRegime } from "../../shared/enums.js";
import { Dec } from "./decimal.js";
import { computeBreakdown, PricingError } from "./pricing.js";

export interface QuoteCalcLine {
  id: string;
  kind: "section" | "ligne" | "option";
  parentId: string | null;
  quantity: string | null;
  unitPrice: string | null;
  pricingMode: "direct" | "decompose";
  supplyCost: string | null;
  laborCost: string | null;
  discountRate: string | null;
  vatRate: string | null;
}

export interface QuoteCalcSettings {
  vatRate: string | null;
  discountRate: string | null;
  taxRegime: TaxRegime;
  depositRate: string | null;
  depositAmount: string | null;
  siteCostsRate: string | null;
  overheadRate: string | null;
  overheadBase: RateBase;
  contingencyRate: string | null;
  contingencyBase: RateBase;
  marginRate: string | null;
  marginMode: MarginMode;
}

export interface LineFigures {
  /** Prix unitaire HT retenu, au centime ; null s'il est inconnu. */
  unitPrice: string | null;
  gross: string | null;
  discount: string | null;
  net: string | null;
  /** Taux de TVA applicable (celui de la ligne, sinon celui du devis), en régime normal. */
  vatRate: string | null;
  /** Détail d'une ligne décomposée : déboursé sec, frais de chantier, frais généraux, aléas, marge. */
  decomposition: { debourseSec: string; fraisChantier: string; overhead: string; contingency: string; margin: string } | null;
}

export interface QuoteTotals {
  lines: Record<string, LineFigures>;
  /** Sous-total de chaque section : somme de ses lignes ; « count » à zéro pour une section encore vide. */
  sections: Record<string, { total: string; complete: boolean; count: number }>;
  /** Total des options, hors devis ; null si une option n'a pas de montant. */
  options: string | null;
  linesTotal: string;
  globalDiscount: string;
  totalHt: string;
  vat: Array<{ rate: string; base: string; amount: string }>;
  totalVat: string | null;
  totalTtc: string | null;
  deposit: string | null;
  /** complet : tous les montants et taux connus ; partiel : montants calculés sur une partie des lignes. */
  state: "complet" | "partiel" | "non_renseigne";
  missing: { prices: number; quantities: number; vatRates: number };
}

export class QuoteCalcError extends Error {}

const blank = (v: string | null | undefined) => v === null || v === undefined || v === "";
const cents = (d: Dec) => d.toDecimalPlaces(2);
const fixed2 = (d: Dec) => cents(d).toFixed(2);

/** Prix unitaire d'une ligne décomposée : fourniture et pose, frais de chantier, puis frais généraux, aléas et marge. */
export function decomposedPrice(line: Pick<QuoteCalcLine, "supplyCost" | "laborCost">, s: QuoteCalcSettings): LineFigures["decomposition"] & { unitPrice: string | null } {
  if (blank(line.supplyCost) || blank(line.laborCost)) return { unitPrice: null, debourseSec: "0.0000", fraisChantier: "0.0000", overhead: "0.0000", contingency: "0.0000", margin: "0.0000" };
  const ds = new Dec(line.supplyCost!).plus(line.laborCost!);
  const fc = blank(s.siteCostsRate) ? new Dec(0) : ds.times(new Dec(s.siteCostsRate!).div(100));
  try {
    const result = computeBreakdown(
      [
        { category: "materiau", quantity: "1", unitCost: line.supplyCost!, lossRate: null },
        { category: "main_oeuvre", quantity: "1", unitCost: line.laborCost!, lossRate: null },
        { category: "frais_chantier", quantity: "1", unitCost: fc.toFixed(), lossRate: null },
      ],
      { overheadRate: s.overheadRate, overheadBase: s.overheadBase, contingencyRate: s.contingencyRate, contingencyBase: s.contingencyBase, marginRate: s.marginRate, marginMode: s.marginMode },
    );
    return { unitPrice: result.prixDeVente, debourseSec: result.debourseSec, fraisChantier: result.fraisChantier, overhead: result.overhead, contingency: result.contingency, margin: result.margin };
  } catch (error) {
    if (error instanceof PricingError) throw new QuoteCalcError(error.message);
    throw error;
  }
}

export function computeQuote(lines: QuoteCalcLine[], s: QuoteCalcSettings): QuoteTotals {
  const figures: Record<string, LineFigures> = {};
  const missing = { prices: 0, quantities: 0, vatRates: 0 };
  let priced = 0;
  let countable = 0;
  for (const line of lines) {
    if (line.kind === "section") continue;
    const decomposition = line.pricingMode === "decompose" ? decomposedPrice(line, s) : null;
    const rawPrice = decomposition ? decomposition.unitPrice : line.unitPrice;
    const unitPrice = blank(rawPrice) ? null : cents(new Dec(rawPrice!));
    const quantity = blank(line.quantity) ? null : new Dec(line.quantity!);
    const vatRate = s.taxRegime === "normal" ? (blank(line.vatRate) ? (blank(s.vatRate) ? null : s.vatRate) : line.vatRate) : null;
    let gross: Dec | null = null;
    let net: Dec | null = null;
    if (unitPrice && quantity) {
      gross = cents(quantity.times(unitPrice));
      net = blank(line.discountRate) ? gross : cents(gross.times(new Dec(1).minus(new Dec(line.discountRate!).div(100))));
    }
    if (line.kind === "ligne") {
      countable++;
      if (!unitPrice) missing.prices++;
      if (!quantity) missing.quantities++;
      if (net) priced++;
      if (net && s.taxRegime === "normal" && vatRate === null) missing.vatRates++;
    }
    figures[line.id] = {
      unitPrice: unitPrice ? unitPrice.toFixed(2) : null,
      gross: gross ? gross.toFixed(2) : null,
      discount: gross && net ? gross.minus(net).toFixed(2) : null,
      net: net ? net.toFixed(2) : null,
      vatRate,
      decomposition: decomposition ? { debourseSec: decomposition.debourseSec, fraisChantier: decomposition.fraisChantier, overhead: decomposition.overhead, contingency: decomposition.contingency, margin: decomposition.margin } : null,
    };
  }

  // Sections : sous-total des lignes qu'elles contiennent (directement ou dans une sous-section).
  const parentOf = new Map(lines.map((l) => [l.id, l.parentId]));
  const sections: QuoteTotals["sections"] = {};
  for (const section of lines.filter((l) => l.kind === "section")) {
    let total = new Dec(0);
    let complete = true;
    let count = 0;
    for (const line of lines.filter((l) => l.kind === "ligne")) {
      let parent = line.parentId;
      while (parent && parent !== section.id) parent = parentOf.get(parent) ?? null;
      if (parent !== section.id) continue;
      count++;
      const net = figures[line.id]!.net;
      if (net === null) complete = false;
      else total = total.plus(net);
    }
    sections[section.id] = { total: total.toFixed(2), complete, count };
  }

  const options = lines.filter((l) => l.kind === "option");
  const optionsTotal = options.length && options.every((o) => figures[o.id]!.net !== null) ? options.reduce((sum, o) => sum.plus(figures[o.id]!.net!), new Dec(0)).toFixed(2) : options.length ? null : "0.00";

  const rated = lines.filter((l) => l.kind === "ligne" && figures[l.id]!.net !== null);
  const linesTotal = rated.reduce((sum, l) => sum.plus(figures[l.id]!.net!), new Dec(0));
  const globalDiscount = blank(s.discountRate) ? new Dec(0) : cents(linesTotal.times(new Dec(s.discountRate!).div(100)));
  const totalHt = linesTotal.minus(globalDiscount);

  // Bases de TVA par taux, remise globale répartie au prorata, reste d'arrondi sur la plus forte base.
  const vat: QuoteTotals["vat"] = [];
  let totalVat: Dec | null = null;
  if (s.taxRegime === "normal" && missing.vatRates === 0 && rated.length) {
    const bases = new Map<string, Dec>();
    for (const l of rated) {
      const rate = new Dec(figures[l.id]!.vatRate!).toFixed();
      bases.set(rate, (bases.get(rate) ?? new Dec(0)).plus(figures[l.id]!.net!));
    }
    const entries = [...bases.entries()].sort((a, b) => b[1].comparedTo(a[1]) || Number(b[0]) - Number(a[0]));
    let allocated = new Dec(0);
    const shares = entries.map(([rate, base], i) => {
      const share = i === 0 ? null : linesTotal.isZero() ? new Dec(0) : cents(globalDiscount.times(base).div(linesTotal));
      if (share) allocated = allocated.plus(share);
      return { rate, base, share };
    });
    shares[0]!.share = globalDiscount.minus(allocated);
    totalVat = new Dec(0);
    for (const { rate, base, share } of shares.sort((a, b) => Number(a.rate) - Number(b.rate))) {
      const discounted = base.minus(share!);
      const amount = cents(discounted.times(new Dec(rate).div(100)));
      totalVat = totalVat.plus(amount);
      vat.push({ rate, base: discounted.toFixed(2), amount: amount.toFixed(2) });
    }
  } else if (s.taxRegime !== "normal") totalVat = new Dec(0);

  const complete = countable > 0 && priced === countable && missing.vatRates === 0;
  const totalTtc = complete && totalVat !== null ? totalHt.plus(totalVat) : null;
  let deposit: Dec | null = null;
  if (totalTtc) {
    if (!blank(s.depositRate)) deposit = cents(totalTtc.times(new Dec(s.depositRate!).div(100)));
    else if (!blank(s.depositAmount)) deposit = Dec.min(new Dec(s.depositAmount!), totalTtc);
  }
  return {
    lines: figures,
    sections,
    options: optionsTotal,
    linesTotal: linesTotal.toFixed(2),
    globalDiscount: globalDiscount.toFixed(2),
    totalHt: totalHt.toFixed(2),
    vat,
    totalVat: complete && totalVat ? totalVat.toFixed(2) : null,
    totalTtc: totalTtc ? fixed2(totalTtc) : null,
    deposit: deposit ? fixed2(deposit) : null,
    state: complete ? "complet" : priced > 0 ? "partiel" : "non_renseigne",
    missing,
  };
}
