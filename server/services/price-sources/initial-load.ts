/**
 * Premier chargement des sources publiques de prix, au déploiement : chaque source active jamais chargée
 * est importée depuis son instantané (server/data/prix), avec les contrôles d'un chargement manuel (valeurs
 * douteuses en quarantaine, jamais publiées d'office). Une source déjà chargée, ou dont le chargement a été
 * annulé par l'utilisateur, n'est pas relue : son actualisation suit l'intervalle planifié.
 */
import { and, count, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { type Database, schema } from "../../db/index.js";
import { batchSummary } from "../../jobs/handlers/price-import.js";
import { ensureSources, stageBatch } from "./engine.js";
import { readSnapshot } from "./snapshot.js";

const day = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });

export interface LibraryCount {
  country: string;
  published: number;
  regulated: number;
  pending: number;
}

/** Références publiques réellement présentes en base, par pays : publiées (dont valeurs réglementaires) et en attente de décision. */
export async function libraryCounts(db: Database): Promise<LibraryCount[]> {
  const p = schema.priceItem;
  const published = await db
    .select({ country: p.country, n: count(), regulated: sql<number>`count(*) filter (where ${p.regulated})::int` })
    .from(p)
    .where(and(isNull(p.archivedAt), isNotNull(p.sourceId)))
    .groupBy(p.country);
  const pending = await db
    .select({ country: schema.priceSource.country, n: count() })
    .from(schema.priceImportRow)
    .innerJoin(schema.priceImportBatch, eq(schema.priceImportBatch.id, schema.priceImportRow.batchId))
    .innerJoin(schema.priceSource, eq(schema.priceSource.id, schema.priceImportBatch.sourceId))
    .where(sql`${schema.priceImportRow.decision} in ('a_publier', 'quarantaine')`)
    .groupBy(schema.priceSource.country);
  const countries = [...new Set([...published.map((x) => x.country), ...pending.map((x) => x.country)])].sort();
  return countries.map((country) => ({
    country,
    published: Number(published.find((x) => x.country === country)?.n ?? 0),
    regulated: Number(published.find((x) => x.country === country)?.regulated ?? 0),
    pending: Number(pending.find((x) => x.country === country)?.n ?? 0),
  }));
}

/** Charge les sources jamais chargées ; renvoie le compte rendu, ligne par ligne. */
export async function initialLoad(db: Database): Promise<string[]> {
  const lines: string[] = [];
  for (const source of await ensureSources(db)) {
    if (!source.enabled) continue;
    const [previous] = await db
      .select({ id: schema.priceImportBatch.id })
      .from(schema.priceImportBatch)
      .where(and(eq(schema.priceImportBatch.sourceId, source.id), ne(schema.priceImportBatch.status, "echoue")))
      .limit(1);
    if (previous) continue;
    const snapshot = readSnapshot(source.key);
    if (!snapshot) {
      lines.push(`${source.name} : aucun instantané dans ce déploiement.`);
      continue;
    }
    const batch = await stageBatch(db, { source, records: snapshot.records, label: `Instantané du ${day(snapshot.generatedAt)}`, trigger: "instantane", resources: snapshot.resources });
    lines.push(`✓ ${source.name} : ${batchSummary(batch)}.`);
  }
  if (lines.length === 0) lines.push("Bibliothèque de prix : toutes les sources sont déjà chargées.");
  for (const c of await libraryCounts(db)) {
    const label = c.country === "MA" ? "marocaines" : c.country === "FR" ? "françaises" : c.country;
    lines.push(`Références publiques ${label} en base : ${c.published} publiées, dont ${c.regulated} ${c.regulated > 1 ? "valeurs réglementaires" : "valeur réglementaire"}, ${c.pending} en attente de décision.`);
  }
  return lines;
}
