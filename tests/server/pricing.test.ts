/** Calcul des sous-détails : déboursé, frais sur chaque assiette (y compris circulaire), marge, marque, coefficient. */
import { describe, expect, it } from "vitest";
import { computeBreakdown, type PricedComponent, PricingError, type PricingRates } from "../../server/services/pricing.js";

const components: PricedComponent[] = [
  { category: "materiau", quantity: "1", unitCost: "1000", lossRate: "5" },
  { category: "main_oeuvre", quantity: "2", unitCost: "50", lossRate: null },
  { category: "frais_chantier", quantity: "1", unitCost: "30", lossRate: null },
];
const base: PricingRates = { overheadRate: "10", overheadBase: "debourse_total", contingencyRate: "2", contingencyBase: "debourse_total", marginRate: "8", marginMode: "taux_de_marge" };

describe("sous-détail de prix", () => {
  it("calcule déboursé, frais et prix de vente avec un taux de marge", () => {
    const r = computeBreakdown(components, base);
    // DS = 1050 + 100 = 1150 ; FC = 30 ; DT = 1180 ; FG = 118 ; aléas = 23,6 ; PR = 1321,6 ; PV = 1321,6 × 1,08 = 1427,328.
    expect(r).toMatchObject({ complete: true, debourseSec: "1150.0000", fraisChantier: "30.0000", debourseTotal: "1180.0000", overhead: "118.0000", contingency: "23.6000", prixDeRevient: "1321.6000", prixDeVente: "1427.33" });
    expect(r.componentTotals).toEqual(["1050.0000", "100.0000", "30.0000"]);
  });

  it("résout algébriquement des frais calculés sur le prix de revient", () => {
    const r = computeBreakdown(components, { ...base, overheadBase: "prix_de_revient", marginRate: null });
    // PR = (1180 + 23,6) ÷ 0,9 = 1337,3333… ; FG = 133,7333… ; PV = PR.
    expect(r.prixDeRevient).toBe("1337.3333");
    expect(r.overhead).toBe("133.7333");
    expect(r.prixDeVente).toBe("1337.33");
  });

  it("applique un taux de marque ou un coefficient", () => {
    expect(computeBreakdown(components, { ...base, marginMode: "taux_de_marque", marginRate: "20" }).prixDeVente).toBe("1652.00");
    expect(computeBreakdown(components, { ...base, marginMode: "coefficient", marginRate: "1.15" }).prixDeVente).toBe("1519.84");
  });

  it("sans taux saisi, le prix de vente est le déboursé", () => {
    const r = computeBreakdown(components, { ...base, overheadRate: "", contingencyRate: null, marginRate: "" });
    expect(r.prixDeVente).toBe("1180.00");
  });

  it("n'avance aucun prix quand un coût manque", () => {
    const r = computeBreakdown([...components, { category: "materiel", quantity: "0.5", unitCost: null, lossRate: null }], base);
    expect(r.complete).toBe(false);
    expect(r.prixDeVente).toBeNull();
    expect(r.componentTotals[3]).toBeNull();
  });

  it("refuse des taux impossibles", () => {
    expect(() => computeBreakdown(components, { ...base, overheadBase: "prix_de_revient", overheadRate: "60", contingencyBase: "prix_de_revient", contingencyRate: "40" })).toThrow(PricingError);
    expect(() => computeBreakdown(components, { ...base, marginMode: "taux_de_marque", marginRate: "100" })).toThrow(PricingError);
  });
});
