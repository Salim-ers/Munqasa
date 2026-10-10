/**
 * Formules de métré : expressions arithmétiques simples (+ - * / parenthèses) sur des variables nommées,
 * évaluées en décimal exact. Aucune évaluation de code : une grammaire fermée, analysée ici.
 * Partagé : l'interface affiche un aperçu, le serveur recalcule toujours la valeur enregistrée.
 *
 *   evaluateFormula("L * l * h * n", { L: "12.5", l: "0.6", h: "0.4", n: "2" })  →  "6.0000"
 */
import { Decimal } from "decimal.js";

/** Calcul exact, arrondi commercial : le même dans l'interface (aperçu) et sur le serveur (valeur retenue). */
const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
type Dec = Decimal;

export class FormulaError extends Error {}

type Token = { type: "number"; value: string } | { type: "name"; value: string } | { type: "op"; value: "+" | "-" | "*" | "/" } | { type: "paren"; value: "(" | ")" };

const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,30}$/;

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expression.length) {
    const ch = expression[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.,]/.test(ch)) {
      let j = i;
      while (j < expression.length && /[0-9.,]/.test(expression[j]!)) j++;
      const raw = expression.slice(i, j).replace(",", ".");
      if (!/^\d+(\.\d+)?$|^\.\d+$/.test(raw)) throw new FormulaError(`Nombre invalide : « ${expression.slice(i, j)} ».`);
      tokens.push({ type: "number", value: raw });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < expression.length && /[A-Za-z0-9_]/.test(expression[j]!)) j++;
      tokens.push({ type: "name", value: expression.slice(i, j) });
      i = j;
      continue;
    }
    if (ch === "×") {
      tokens.push({ type: "op", value: "*" });
      i++;
      continue;
    }
    if ("+-*/".includes(ch)) {
      tokens.push({ type: "op", value: ch as "+" | "-" | "*" | "/" });
      i++;
      continue;
    }
    if (ch === "(" || ch === ")") {
      tokens.push({ type: "paren", value: ch });
      i++;
      continue;
    }
    throw new FormulaError(`Caractère non autorisé dans la formule : « ${ch} ».`);
  }
  return tokens;
}

const PRECEDENCE = { "+": 1, "-": 1, "*": 2, "/": 2, neg: 3 } as const;
type RpnItem = Token | { type: "neg" };

/** Notation polonaise inverse (algorithme de Dijkstra), avec le moins unaire. */
function toRpn(tokens: Token[]): RpnItem[] {
  const out: RpnItem[] = [];
  const stack: Array<Token | { type: "neg" }> = [];
  let expectOperand = true;
  for (const token of tokens) {
    if (token.type === "number" || token.type === "name") {
      if (!expectOperand) throw new FormulaError("Opérateur manquant entre deux valeurs.");
      out.push(token);
      expectOperand = false;
    } else if (token.type === "op") {
      if (expectOperand) {
        if (token.value === "-") stack.push({ type: "neg" });
        else if (token.value !== "+") throw new FormulaError("Opérateur mal placé.");
        continue;
      }
      while (stack.length) {
        const top = stack[stack.length - 1]!;
        const topPrecedence = top.type === "neg" ? PRECEDENCE.neg : top.type === "op" ? PRECEDENCE[top.value] : 0;
        if (topPrecedence >= PRECEDENCE[token.value]) out.push(stack.pop()!);
        else break;
      }
      stack.push(token);
      expectOperand = true;
    } else if (token.value === "(") {
      if (!expectOperand) throw new FormulaError("Opérateur manquant avant une parenthèse.");
      stack.push(token);
    } else {
      if (expectOperand) throw new FormulaError("Parenthèse vide ou valeur manquante.");
      for (;;) {
        const top = stack.pop();
        if (!top) throw new FormulaError("Parenthèse fermante sans ouvrante.");
        if (top.type === "paren") break;
        out.push(top);
      }
    }
  }
  if (expectOperand) throw new FormulaError("La formule se termine par un opérateur.");
  while (stack.length) {
    const top = stack.pop()!;
    if (top.type === "paren") throw new FormulaError("Parenthèse ouvrante non fermée.");
    out.push(top);
  }
  return out;
}

/** Variables utilisées par une formule (pour vérifier que chaque entrée est renseignée). */
export function formulaVariables(expression: string): string[] {
  return [...new Set(tokenize(expression).filter((t) => t.type === "name").map((t) => t.value))];
}

/** Évalue la formule ; le résultat est arrondi à 4 décimales (précision des quantités). */
export function evaluateFormula(expression: string, inputs: Record<string, string>): string {
  if (!expression.trim()) throw new FormulaError("Formule vide.");
  if (expression.length > 300) throw new FormulaError("Formule trop longue.");
  const values = new Map<string, Dec>();
  for (const [name, raw] of Object.entries(inputs)) {
    if (!NAME.test(name)) throw new FormulaError(`Nom de variable invalide : « ${name} ».`);
    const normalized = String(raw).trim().replace(/\s/g, "").replace(",", ".");
    if (!/^-?\d+(\.\d+)?$/.test(normalized)) throw new FormulaError(`Valeur invalide pour ${name} : « ${raw} ».`);
    values.set(name, new Dec(normalized));
  }
  const stack: Dec[] = [];
  for (const item of toRpn(tokenize(expression))) {
    if (item.type === "number") stack.push(new Dec(item.value));
    else if (item.type === "name") {
      const value = values.get(item.value);
      if (!value) throw new FormulaError(`Valeur manquante pour ${item.value}.`);
      stack.push(value);
    } else if (item.type === "neg") {
      const a = stack.pop();
      if (!a) throw new FormulaError("Formule invalide.");
      stack.push(a.neg());
    } else if (item.type === "op") {
      const b = stack.pop();
      const a = stack.pop();
      if (!a || !b) throw new FormulaError("Formule invalide.");
      if (item.value === "/" && b.isZero()) throw new FormulaError("Division par zéro.");
      stack.push(item.value === "+" ? a.plus(b) : item.value === "-" ? a.minus(b) : item.value === "*" ? a.times(b) : a.div(b));
    }
  }
  if (stack.length !== 1) throw new FormulaError("Formule invalide.");
  return stack[0]!.toDecimalPlaces(4).toFixed(4);
}

/**
 * Même formule écrite pour Excel, valeurs en clair (« 42.5*0.6*0.4 ») : le tableur recalcule la quantité
 * et chacun voit le détail du calcul. Grammaire fermée : seuls nombres, opérateurs et parenthèses sortent.
 * Renvoie null si la formule ou une valeur est invalide (la cellule garde alors la quantité calculée).
 */
export function formulaToExcel(expression: string, inputs: Record<string, string>): string | null {
  try {
    evaluateFormula(expression, inputs);
    return tokenize(expression)
      .map((t) => {
        if (t.type === "name") return `(${String(inputs[t.value]).trim().replace(/\s/g, "").replace(",", ".")})`;
        return t.value;
      })
      .join("");
  } catch {
    return null;
  }
}
