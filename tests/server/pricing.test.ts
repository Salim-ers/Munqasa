/** Calcul des sous-détails : déboursé, frais sur chaque assiette (y compris circulaire), marge, marque, coefficient. */
import { describe, expect, it } from "vitest";
import { computeBreakdown, lossesAlreadyIncluded, type PricedComponent, PricingError, type PricingRates } from "../../server/services/pricing.js";

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

describe("pertes : appliquées une seule fois", () => {
  const noRates: PricingRates = { overheadRate: null, overheadBase: "debourse_total", contingencyRate: null, contingencyBase: "debourse_total", marginRate: null, marginMode: "taux_de_marge" };

  it("consommation nette : quantité brute = nette × (1 + pertes)", () => {
    const [f] = computeBreakdown([{ category: "materiau", quantity: "1", unitCost: "809.2673", lossRate: "3" }], noRates).figures;
    expect(f).toEqual({ netQuantity: "1.000000", lossRate: "3", lossMode: "appliquee", grossQuantity: "1.030000", unitCost: "809.2673", amount: "833.5453" });
  });

  it("consommation qui comprend déjà les pertes : jamais majorée une seconde fois (cas du béton des bandeaux de TAL-2026-0003)", () => {
    const included = computeBreakdown([{ category: "materiau", quantity: "1.03", unitCost: "809.2673", lossRate: "3", lossMode: "incluse" }], noRates);
    // 1,03 × 809,2673 = 833,5453, et non 1,03 × 809,2673 × 1,03 = 858,5517.
    expect(included.figures[0]).toMatchObject({ netQuantity: "1.000000", grossQuantity: "1.030000", amount: "833.5453" });
    expect(included.prixDeVente).toBe("833.55");
    const double = computeBreakdown([{ category: "materiau", quantity: "1.03", unitCost: "809.2673", lossRate: "3" }], noRates);
    expect(double.figures[0]!.amount).toBe("858.5517");
  });

  it("main-d'œuvre, matériel, transport sans pertes ; frais de chantier hors déboursé sec", () => {
    const r = computeBreakdown(
      [
        { category: "main_oeuvre", quantity: "2.5", unitCost: "65", lossRate: null },
        { category: "materiel", quantity: "0.08", unitCost: "450", lossRate: null },
        { category: "transport", quantity: "0.175", unitCost: "120", lossRate: "0" },
        { category: "frais_chantier", quantity: "1.4", unitCost: "5", lossRate: null },
      ],
      noRates,
    );
    // 162,5 + 36 + 21 = 219,5 ; frais de chantier 7 ; déboursé total 226,5.
    expect(r.figures.map((f) => f.grossQuantity)).toEqual(["2.500000", "0.080000", "0.175000", "1.400000"]);
    expect(r).toMatchObject({ debourseSec: "219.5000", fraisChantier: "7.0000", debourseTotal: "226.5000", prixDeVente: "226.50", state: "complet" });
  });

  it("frais, aléas et marge appliqués chacun une fois, sur leur assiette", () => {
    const rates: PricingRates = { overheadRate: "10", overheadBase: "debourse_sec", contingencyRate: "3", contingencyBase: "debourse_total", marginRate: "15", marginMode: "taux_de_marge" };
    const r = computeBreakdown(
      [
        { category: "materiau", quantity: "1", unitCost: "100", lossRate: "5" },
        { category: "frais_chantier", quantity: "1", unitCost: "20", lossRate: null },
      ],
      rates,
    );
    // DS 105, FC 20, DT 125 ; frais généraux 10 % de 105 = 10,5 ; aléas 3 % de 125 = 3,75 ; PR 139,25 ; PV × 1,15 = 160,1375.
    expect(r).toMatchObject({ debourseSec: "105.0000", debourseTotal: "125.0000", overhead: "10.5000", contingency: "3.7500", prixDeRevient: "139.2500", margin: "20.8875", prixDeVente: "160.14" });
  });

  it("arrondi explicite : prix de vente au centime, demi supérieur", () => {
    expect(computeBreakdown([{ category: "materiau", quantity: "1", unitCost: "10.005", lossRate: null }], noRates).prixDeVente).toBe("10.01");
    expect(computeBreakdown([{ category: "materiau", quantity: "3", unitCost: "0.3333", lossRate: null }], noRates).prixDeVente).toBe("1.00");
  });
});

describe("coût inconnu, partiel, estimatif ou nul", () => {
  const noRates: PricingRates = { overheadRate: null, overheadBase: "debourse_total", contingencyRate: null, contingencyBase: "debourse_total", marginRate: null, marginMode: "taux_de_marge" };

  it("aucun composant chiffré : non renseigné, jamais un coût nul", () => {
    const r = computeBreakdown([{ category: "main_oeuvre", quantity: "48", unitCost: null, lossRate: null }], noRates);
    expect(r).toMatchObject({ state: "non_renseigne", priced: 0, count: 1, prixDeVente: null });
    expect(computeBreakdown([], noRates).state).toBe("non_renseigne");
  });

  it("une partie seulement chiffrée : partiel, sans prix de vente", () => {
    const r = computeBreakdown(
      [
        { category: "materiau", quantity: "1.02", unitCost: "809.2673", lossRate: "2", lossMode: "incluse" },
        { category: "transport", quantity: "1.02", unitCost: null, lossRate: null },
      ],
      noRates,
    );
    expect(r).toMatchObject({ state: "partiel", priced: 1, count: 2, complete: false, prixDeVente: null, debourseSec: "825.4526" });
  });

  it("tout chiffré avec des consommations proposées : estimatif ; confirmées : entièrement calculé", () => {
    expect(computeBreakdown([{ category: "materiau", quantity: "1", unitCost: "100", lossRate: null, hypothesis: true }], noRates).state).toBe("estimatif");
    expect(computeBreakdown([{ category: "materiau", quantity: "1", unitCost: "100", lossRate: null, hypothesis: false }], noRates).state).toBe("complet");
  });

  it("coût réellement nul : nul", () => {
    expect(computeBreakdown([{ category: "materiau", quantity: "2", unitCost: "0", lossRate: null }], noRates).state).toBe("nul");
  });

  it("taux non saisis : signalés comme absents, pas comme des montants nuls", () => {
    expect(computeBreakdown([{ category: "materiau", quantity: "1", unitCost: "1", lossRate: null }], noRates).ratesMissing).toEqual({ overhead: true, contingency: true, margin: true });
  });
});

describe("pertes déjà comprises dans une consommation proposée", () => {
  it("reconnaît les justifications de TAL-2026-0003", () => {
    const cases: Array<[string, string, string]> = [
      ["1.03", "3", "Pour 1 m³ net de bandeau, consommation de 1,03 m³ incluant 3 % de pertes de mise en place"],
      ["1.02", "2", "Pour 1 m3 théorique d'ouvrage, consommation de 1,02 m3 intégrant 2 % de pertes de mise en œuvre."],
      ["110", "10", "Hypothèse provisoire de 100 m² à couvrir, majorée de 10 % pour découpes et recouvrements ; majoration déjà comprise dans la quantité."],
      ["1.25", "3", "Par m³ d'ouvrage fini : hypothèse de 1,21 m³ livré en vrac, majorée de 3 % de pertes, soit environ 1,25 m³. Pertes déjà incluses."],
      ["1.22", "2", "Hypothèse de 1,20 m³ en vrac par m³ compacté, majorée de 2 % de pertes, soit environ 1,22 m³. Pertes déjà incluses."],
      ["0.042", "5", "Section de 0,20 × 0,20 m, soit 0,040 m3/ml ; consommation incluant 5 % de pertes."],
      ["0.00315", "5", "Provision de 3 litres de mortier par réservation, augmentée de 5 % de pertes."],
      ["1.03", "3", "Pour 1 kg d'armatures théoriques posé, consommation de 1,03 kg avec 3 % de chutes de coupe."],
    ];
    for (const [q, rate, note] of cases) expect(lossesAlreadyIncluded(q, rate, note), note).toBe(true);
  });

  it("ne confond pas une consommation nette avec une consommation majorée", () => {
    expect(lossesAlreadyIncluded("1", "3", "Consommation nette de 1 m³ par m³ d'ouvrage")).toBe(false);
    expect(lossesAlreadyIncluded("1.03", "3", "Quantité hors pertes, mesurée sur plan")).toBe(false);
    expect(lossesAlreadyIncluded("1.07", "3", "Ratio usuel à confirmer")).toBe(false);
    expect(lossesAlreadyIncluded("6", "3", "Six heures par mètre cube")).toBe(false);
    expect(lossesAlreadyIncluded("1.03", null, "incluant 3 % de pertes")).toBe(false);
    expect(lossesAlreadyIncluded("1.03", "0", "incluant 3 % de pertes")).toBe(false);
    expect(lossesAlreadyIncluded("2.5", "5", "pertes non comprises")).toBe(false);
  });
});
