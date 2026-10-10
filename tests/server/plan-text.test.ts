/**
 * Texte vectoriel des plans et traçabilité du métré : nombres écrits, échelles, contrôle des cotes,
 * conversion en mètres, déductions, origine des entrées et confiance déterministe.
 */
import { describe, expect, it } from "vitest";
import { type DimensionRef, measureConfidence } from "../../shared/metre.js";
import { analyseInput, computeMeasure, manualSources } from "../../server/services/metre.js";
import type { TextItem } from "../../server/services/pdf-text.js";
import { checkDimension, normalizeNumber, numberTokens, resolveScale, scalesIn, textExcerpt, toMeters } from "../../server/services/plan-text.js";

const item = (text: string, x = 0, y = 0, angle = 0): TextItem => ({ text, x, y, width: 10, height: 10, angle });

describe("texte vectoriel des plans", () => {
  it("ramène les nombres écrits à une forme canonique", () => {
    expect(normalizeNumber("2,50")).toBe("2.5");
    expect(normalizeNumber("060")).toBe("60");
    expect(normalizeNumber("0.40")).toBe("0.4");
    expect(normalizeNumber("HA10")).toBeNull();
    expect([...numberTokens([item("SF1 60x40"), item("+3,06 NGF"), item("Ø12 e=15")])].sort()).toEqual(["1", "12", "15", "3.06", "40", "60"]);
  });

  it("lit les échelles usuelles et n'en retient qu'une sans ambiguïté", () => {
    expect(scalesIn("PLAN DE MASSE ECH. 1/500 - DÉTAIL 1:20")).toEqual([20, 500]);
    expect(scalesIn("Niveau R+1/2 et cote 1/3")).toEqual([]);
    expect(scalesIn("ref 21/100")).toEqual([]);
    expect(resolveScale([50], null)).toEqual({ ratio: 50, reason: "échelle 1/50 lue dans le texte vectoriel" });
    expect(resolveScale([20, 50], "Ech : 1/50")).toEqual({ ratio: 50, reason: "échelle 1/50 du cartouche, parmi 2 échelles de la page" });
    expect(resolveScale([20, 50], null)).toEqual({ ratio: null, reason: "2 échelles sur la page, aucune retenue" });
    expect(resolveScale([], "1/100")).toEqual({ ratio: 100, reason: "échelle 1/100 lue sur l’image du cartouche" });
    expect(resolveScale([], null).ratio).toBeNull();
  });

  it("contrôle une cote relevée et convertit les longueurs en mètres", () => {
    const numbers = numberTokens([item("42.50"), item("60")]);
    expect(checkDimension("42,5", "cote_lue", numbers)).toBe("couche_texte");
    expect(checkDimension("65", "cote_lue", numbers)).toBe("non_retrouvee");
    expect(checkDimension("65", "cote_lue", null)).toBe("sans_couche_texte");
    expect(checkDimension("2.10", "deduit", numbers)).toBe("deduite");
    expect(toMeters("60", "cm")).toBe("0.6");
    expect(toMeters("2500", "mm")).toBe("2.5");
    expect(toMeters("3", "u")).toBeNull();
  });

  it("présente les nombres écrits puis les textes, dans l'ordre de lecture et sans doublons", () => {
    expect(textExcerpt([item("Mur B", 50, 100), item("Mur A", 10, 100), item("2,50", 10, 10), item("60", 5, 10, 90), item("60", 80, 100), item("Mur A", 90, 100)])).toBe(
      "Nombres écrits seuls : 60 ; 2,50\nTextes : Mur A ; Mur B",
    );
    expect(textExcerpt([item("aaaa"), item("bbbb"), item("cccc")], 12)).toBe("Textes : aaaa ; [suite tronquée]");
  });
});

describe("traçabilité du métré", () => {
  const dim = (id: string, value: string, unit: string, check: DimensionRef["check"] = "couche_texte"): DimensionRef => ({ id, drawingId: "p", element: "SF1", name: id, value, unit, source: "cote_lue", check });
  const index = new Map([dim("1.1.1", "42.50", "m"), dim("1.1.2", "60", "cm"), dim("1.1.3", "40", "cm", "sans_couche_texte"), dim("1.1.4", "3.20", "m", "non_retrouvee")].map((d) => [d.id, d]));

  it("soustrait les déductions de la quantité brute et refuse un résultat négatif", () => {
    expect(computeMeasure("L * l", { L: "10", l: "2.5" }, [{ label: "Porte", formula: "0.9 * 2.1" }])).toEqual({ gross: "25.0000", net: "23.1100", deductions: [{ label: "Porte", formula: "0.9 * 2.1", quantity: "1.8900" }] });
    expect(() => computeMeasure("L", { L: "1" }, [{ label: "Vide", formula: "L * 2" }])).toThrow("Les déductions dépassent la quantité brute.");
    expect(() => computeMeasure("L", { L: "1" }, [{ label: "Vide", formula: "x" }])).toThrow("Déduction « Vide » : Valeur manquante pour x.");
  });

  it("rattache chaque entrée à ses cotes et en déduit une confiance sans appréciation du modèle", () => {
    const exact = analyseInput({ name: "l", value: "0.60", source: "SF1", dimensionIds: ["1.1.2"], derivation: "conversion" }, index);
    expect(exact).toMatchObject({ computed: false, mismatch: null });
    const wrong = analyseInput({ name: "l", value: "0.65", source: "SF1", dimensionIds: ["1.1.2"], derivation: null }, index);
    expect(wrong.mismatch).toBe("0.65 ne correspond pas à la cote 60 cm, soit 0.6 m");
    const half = analyseInput({ name: "e", value: "0.30", source: "SF1", dimensionIds: ["1.1.2"], derivation: "moitié de la largeur" }, index);
    expect(half).toMatchObject({ computed: true, mismatch: null });
    const two = analyseInput({ name: "L", value: "45.70", source: "SF1", dimensionIds: ["1.1.1", "1.1.4"], derivation: null }, index);
    expect(two.mismatch).toBe("valeur tirée de 2 cotes sans calcul indiqué");
    const unknown = analyseInput({ name: "h", value: "0.4", source: "SF1", dimensionIds: ["9.9.9"], derivation: null }, index);
    expect(unknown).toMatchObject({ dimensions: [], note: "SF1 ; identifiant de cote inconnu : 9.9.9" });

    const L = analyseInput({ name: "L", value: "42.5", source: "", dimensionIds: ["1.1.1"], derivation: null }, index);
    const h = analyseInput({ name: "h", value: "0.4", source: "", dimensionIds: ["1.1.3"], derivation: null }, index);
    const H = analyseInput({ name: "H", value: "3.2", source: "", dimensionIds: ["1.1.4"], derivation: null }, index);
    expect(measureConfidence([L, exact])).toBe("elevee");
    expect(measureConfidence([L, half])).toBe("moyenne");
    expect(measureConfidence([L, h])).toBe("moyenne");
    expect(measureConfidence([L, H])).toBe("faible");
    expect(measureConfidence([L, wrong])).toBe("faible");
    expect(measureConfidence([L, unknown])).toBe("faible");
    expect(measureConfidence([])).toBe("faible");
  });

  it("garde l'origine d'une valeur inchangée et marque une valeur corrigée comme saisie", () => {
    const L = analyseInput({ name: "L", value: "42.5", source: "", dimensionIds: ["1.1.1"], derivation: null }, index);
    const after = manualSources({ L: "42.5", l: "0.7" }, [L]);
    expect(after.map((s) => `${s.name}:${s.origin}`)).toEqual(["L:plan", "l:saisie"]);
  });
});
