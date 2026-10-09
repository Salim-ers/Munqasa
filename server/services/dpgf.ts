/**
 * DPGF : numérotation hiérarchique (1, 1.1, 1.1.1), montants exacts (quantité × prix unitaire,
 * arrondis au centime), sous-totaux et totaux, quantités reprises du métré avec leur source.
 */
import { and, eq, ne } from "drizzle-orm";
import { type Database, schema } from "../db/index.js";
import { Dec } from "./decimal.js";
import { sameUnit } from "./units.js";

export type LineRow = typeof schema.dpgfLine.$inferSelect;

/** Montant d'un poste, ou null tant que la quantité ou le prix manque. */
export function lineAmount(quantity: string | null, unitPrice: string | null): string | null {
  if (quantity === null || unitPrice === null) return null;
  return new Dec(quantity).times(unitPrice).toDecimalPlaces(2).toFixed(2);
}

/** Arborescence dans l'ordre de lecture, avec la numérotation hiérarchique. */
export function orderTree(lines: LineRow[]): Array<{ line: LineRow; depth: number; code: string }> {
  const children = new Map<string | null, LineRow[]>();
  for (const line of lines) children.set(line.parentId ?? null, [...(children.get(line.parentId ?? null) ?? []), line]);
  for (const list of children.values()) list.sort((a, b) => a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime());
  const ordered: Array<{ line: LineRow; depth: number; code: string }> = [];
  const walk = (parent: string | null, prefix: string, depth: number) => {
    (children.get(parent) ?? []).forEach((line, index) => {
      const code = prefix ? `${prefix}.${index + 1}` : String(index + 1);
      ordered.push({ line, depth, code });
      walk(line.id, code, depth + 1);
    });
  };
  walk(null, "", 0);
  return ordered;
}

/** Positions et codes recalculés après un ajout, une suppression ou un déplacement. */
export async function renumber(db: Database, dpgfId: string): Promise<void> {
  const lines = await db.select().from(schema.dpgfLine).where(eq(schema.dpgfLine.dpgfId, dpgfId));
  for (const [index, { line, code }] of orderTree(lines).entries()) {
    if (line.position !== index || line.code !== code) await db.update(schema.dpgfLine).set({ position: index, code }).where(eq(schema.dpgfLine.id, line.id));
  }
}

export interface DpgfTotals {
  subtotals: Record<string, string>;
  totalHt: string;
  vat: string | null;
  totalTtc: string | null;
  postes: number;
  priced: number;
}

/** Sous-totaux par chapitre et sous-chapitre, total hors taxes, taxe et total toutes taxes si le taux est saisi. */
export function computeTotals(lines: LineRow[], vatRate: string | null): DpgfTotals {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const subtotals = new Map<string, Dec>();
  let total = new Dec(0);
  let postes = 0;
  let priced = 0;
  for (const line of lines) {
    if (line.kind !== "poste") continue;
    postes++;
    if (line.amount === null) continue;
    priced++;
    const amount = new Dec(line.amount);
    total = total.plus(amount);
    let parent = line.parentId;
    while (parent) {
      subtotals.set(parent, (subtotals.get(parent) ?? new Dec(0)).plus(amount));
      parent = byId.get(parent)?.parentId ?? null;
    }
  }
  const vat = vatRate !== null ? total.times(vatRate).div(100).toDecimalPlaces(2) : null;
  return {
    subtotals: Object.fromEntries([...subtotals].map(([id, value]) => [id, value.toFixed(2)])),
    totalHt: total.toFixed(2),
    vat: vat?.toFixed(2) ?? null,
    totalTtc: vat ? total.plus(vat).toFixed(2) : null,
    postes,
    priced,
  };
}

/** Quantité d'un ouvrage d'après son métré (mesures non rejetées, dans l'unité du poste). */
export async function metreQuantity(db: Database, workItemId: string, unit: string): Promise<{ quantity: string; count: number; verified: number; source: string } | null> {
  const measures = await db
    .select()
    .from(schema.measurement)
    .where(and(eq(schema.measurement.workItemId, workItemId), ne(schema.measurement.status, "rejete")));
  const matching = measures.filter((m) => m.quantity !== null && sameUnit(m.unit, unit));
  if (matching.length === 0) return null;
  const total = matching.reduce((sum, m) => sum.plus(m.quantity!), new Dec(0));
  const verified = matching.filter((m) => m.status === "verifie").length;
  return { quantity: total.toDecimalPlaces(4).toFixed(4), count: matching.length, verified, source: `Métré : ${matching.length} mesure(s), dont ${verified} vérifiée(s)` };
}
