/** Formules de métré : calcul exact, erreurs explicites, aucune évaluation de code. */
import { describe, expect, it } from "vitest";
import { evaluateFormula, FormulaError, formulaVariables } from "../../server/services/formula.js";

describe("formules de métré", () => {
  it("calcule en décimal exact", () => {
    expect(evaluateFormula("L * l * h * n", { L: "12,5", l: "0.6", h: "0.4", n: "2" })).toBe("6.0000");
    expect(evaluateFormula("0.1 + 0.2", {})).toBe("0.3000");
    expect(evaluateFormula("(L1 + L2) * e - 2 * 0.9 * 2.1", { L1: "10", L2: "5.5", e: "2.8" })).toBe("39.6200");
    expect(evaluateFormula("-a + 3 × b", { a: "1", b: "2" })).toBe("5.0000");
    expect(evaluateFormula("V / 3", { V: "10" })).toBe("3.3333");
  });

  it("liste les variables d'une formule", () => {
    expect(formulaVariables("L * l * h + L")).toEqual(["L", "l", "h"]);
  });

  it("refuse les formules invalides ou dangereuses", () => {
    for (const [expr, inputs] of [
      ["L *", { L: "1" }],
      ["(L", { L: "1" }],
      ["L L", { L: "1" }],
      ["L / 0", { L: "1" }],
      ["process.exit()", {}],
      ["L; drop", { L: "1" }],
      ["L * h", { L: "1" }],
      ["L", { L: "abc" }],
    ] as const) {
      expect(() => evaluateFormula(expr, inputs as Record<string, string>), expr).toThrow(FormulaError);
    }
  });
});
