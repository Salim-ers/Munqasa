/**
 * Prix de la bibliothèque appliqués aux postes d'une DPGF, avec les mêmes règles pour un choix de
 * l'utilisateur et pour l'agent de recherche de prix : poste de la DPGF, prix ni archivé ni rejeté, même
 * devise et même pays, prix d'ouvrage (jamais une fourniture seule ni un ratio), même unité ou unité de la
 * même grandeur convertie exactement (prix à la tonne pour un poste au kilogramme), prix TTC ramené hors taxes.
 * La provenance est inscrite, conversion comprise, et le poste repasse « à vérifier ».
 */
import { eq } from "drizzle-orm";
import { PRICE_ORIGIN_LABELS } from "../../shared/enums.js";
import { appliesToDpgfLine } from "../../shared/prices.js";
import { type Database, schema } from "../db/index.js";
import { lineAmount } from "./dpgf.js";
import { exclTax } from "./pricing.js";
import { convertPrice, sameUnit } from "./units.js";

type DpgfLine = typeof schema.dpgfLine.$inferSelect;
type PriceItem = typeof schema.priceItem.$inferSelect;

/** Prix hors taxes et provenance d'un prix pour un poste, ou la raison du refus. */
export function priceForLine(line: Pick<DpgfLine, "kind" | "unit"> | undefined, found: { price: PriceItem; sourceName: string | null } | undefined, doc: { currency: string }, country: string): { unitPrice: string; priceSource: string } | { error: string } {
  if (!line || line.kind !== "poste") return { error: "Poste introuvable dans cette DPGF." };
  if (!found || found.price.archivedAt || found.price.verificationStatus === "rejete") return { error: "Prix introuvable, archivé ou rejeté." };
  const price = found.price;
  if (price.currency !== doc.currency || price.country !== country) return { error: `Prix en ${price.currency} pour ${price.country}, DPGF en ${doc.currency}.` };
  if (!appliesToDpgfLine(price)) return { error: "Prix de fourniture ou ratio d’opération : il sert aux sous-détails, pas au prix d’un poste." };
  const ht = exclTax(price.unitPrice, price.taxBasis, price.vatRate);
  if (ht === null) return { error: "Prix TTC sans taux de TVA : il ne peut pas être ramené hors taxes." };
  const converted = convertPrice(ht, price.unit, line.unit);
  if (converted === null) return { error: `Unité du prix (${price.unit}) différente de celle du poste (${line.unit ?? "aucune"}).` };
  const conversion = sameUnit(price.unit, line.unit) ? null : `converti de ${Number(ht).toLocaleString("fr-FR", { maximumFractionDigits: 4 })} par ${price.unit} en ${Number(converted).toLocaleString("fr-FR", { maximumFractionDigits: 4 })} par ${line.unit}`.replace(/[\u00a0\u202f]/g, " ");
  const zone = price.city ?? price.region;
  const when = price.period ? `valeur ${price.period}` : `prix du ${price.priceDate.split("-").reverse().join("/")}`;
  const priceSource = [`Bibliothèque : ${price.designation}`, zone, when, found.sourceName ?? PRICE_ORIGIN_LABELS[price.origin], price.taxBasis === "TTC" ? "TTC ramené HT" : null, conversion].filter(Boolean).join(", ");
  return { unitPrice: converted, priceSource };
}

/** Applique un prix à un poste ; renvoie la raison du refus, ou null s'il est appliqué. */
export async function applyLibraryPrice(db: Database, line: DpgfLine | undefined, found: { price: PriceItem; sourceName: string | null } | undefined, doc: { currency: string }, country: string, note?: string): Promise<string | null> {
  const priced = priceForLine(line, found, doc, country);
  if ("error" in priced) return priced.error;
  await db
    .update(schema.dpgfLine)
    .set({ unitPrice: priced.unitPrice, amount: lineAmount(line!.quantity, priced.unitPrice), priceItemId: found!.price.id, priceSource: note ? `${priced.priceSource}, ${note}` : priced.priceSource, status: "a_verifier" })
    .where(eq(schema.dpgfLine.id, line!.id));
  return null;
}
