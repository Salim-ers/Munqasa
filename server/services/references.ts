/**
 * Références automatiques (affaires TAL-2026-0001, devis DEV-2026-0001…) : compteur atomique en base,
 * par portée et par année. Deux créations simultanées ne peuvent pas obtenir le même numéro.
 */
import { sql } from "drizzle-orm";
import type { Database } from "../db/index.js";

export async function nextReference(db: Database, kind: "project" | "quote", prefix: string, date = new Date()): Promise<string> {
  const year = date.getFullYear();
  const scope = `${kind}:${year}`;
  const result = (await db.execute(sql`
    insert into reference_counter (scope, value) values (${scope}, 1)
    on conflict (scope) do update set value = reference_counter.value + 1
    returning value
  `)) as unknown as { rows: Array<{ value: number }> };
  const value = result.rows[0]?.value;
  if (!value) throw new Error("Compteur de référence indisponible.");
  return `${prefix}-${year}-${String(value).padStart(4, "0")}`;
}
