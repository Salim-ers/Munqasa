/** Sous-détails : taux par défaut (réglages de chiffrage), recalcul après chaque modification. */
import { asc, eq } from "drizzle-orm";
import { type Database, schema } from "../db/index.js";
import { type BreakdownResult, computeBreakdown, PricingError, type PricingRates } from "./pricing.js";
import { readSetting } from "./settings.js";

export type BreakdownRow = typeof schema.priceBreakdown.$inferSelect;
export type ComponentRow = typeof schema.priceBreakdownComponent.$inferSelect;

/** Taux saisis dans Paramètres > Chiffrage, recopiés à la création d'un sous-détail (modifiables ensuite). */
export async function defaultRates() {
  const s = await readSetting("chiffrage");
  return {
    overheadRate: s.overheadRate || null,
    overheadBase: s.overheadBase,
    contingencyRate: s.contingencyRate || null,
    contingencyBase: s.contingencyBase,
    marginRate: s.marginRate || null,
    marginMode: s.marginMode,
  };
}

export function ratesOf(b: BreakdownRow): PricingRates {
  return {
    overheadRate: b.overheadRate,
    overheadBase: b.overheadBase,
    contingencyRate: b.contingencyRate,
    contingencyBase: b.contingencyBase,
    marginRate: b.marginRate,
    marginMode: b.marginMode,
  };
}

export function resultOf(b: BreakdownRow, components: ComponentRow[]): BreakdownResult | { error: string } {
  try {
    return computeBreakdown(
      components.map((c) => ({ category: c.category, quantity: c.quantity, unitCost: c.unitCost, lossRate: c.lossRate })),
      ratesOf(b),
    );
  } catch (error) {
    return { error: error instanceof PricingError ? error.message : "Calcul impossible." };
  }
}

/** Recalcule le prix de vente unitaire ; un sous-détail incomplet reste un brouillon. */
export async function recomputeBreakdown(db: Database, breakdownId: string): Promise<void> {
  const [b] = await db.select().from(schema.priceBreakdown).where(eq(schema.priceBreakdown.id, breakdownId));
  if (!b) return;
  const components = await db.select().from(schema.priceBreakdownComponent).where(eq(schema.priceBreakdownComponent.breakdownId, breakdownId)).orderBy(asc(schema.priceBreakdownComponent.position));
  const result = resultOf(b, components);
  const price = "error" in result ? null : result.prixDeVente;
  await db
    .update(schema.priceBreakdown)
    .set({ computedUnitPrice: price, ...(b.locked ? {} : { status: price ? "a_valider" : "brouillon" }) })
    .where(eq(schema.priceBreakdown.id, breakdownId));
}
