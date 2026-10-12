/**
 * Catalogue des lots : nomenclatures modifiables (shared/lots.ts), créées au premier usage à partir de la
 * nomenclature par défaut et de ses modèles par type d'opération ; lots récents et favoris ; suggestions
 * tirées des éléments relevés sur les plans ; ajout groupé de lots à une affaire sans jamais renuméroter
 * ses lots existants ; fusion de deux lots d'une affaire tant qu'aucun document n'a été établi pour le lot
 * absorbé.
 */
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { DEFAULT_LOTS, ELEMENT_LOT_SUGGESTIONS, LOT_TEMPLATES } from "../../shared/lots.js";
import { type Database, schema } from "../db/index.js";

export type CatalogRow = typeof schema.lotCatalog.$inferSelect;
export type EntryRow = typeof schema.lotCatalogEntry.$inferSelect;

/** Crée les nomenclatures par défaut si aucune n'existe encore (idempotent). */
export async function ensureDefaultCatalogs(db: Database): Promise<void> {
  const [existing] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.lotCatalog);
  if (Number(existing?.n ?? 0) > 0) return;
  await db.transaction(async (tx) => {
    // Un autre appel a pu créer les nomenclatures entre-temps : on vérifie de nouveau dans la transaction.
    const [again] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.lotCatalog);
    if (Number(again?.n ?? 0) > 0) return;
    for (const [index, template] of LOT_TEMPLATES.entries()) {
      const [catalog] = await tx
        .insert(schema.lotCatalog)
        .values({ name: template.name, projectType: template.projectType, isDefault: index === 0, position: index })
        .returning({ id: schema.lotCatalog.id });
      const lots = template.numbers === "tous" ? DEFAULT_LOTS : DEFAULT_LOTS.filter((l) => (template.numbers as string[]).includes(l.number)).sort((a, b) => (template.numbers as string[]).indexOf(a.number) - (template.numbers as string[]).indexOf(b.number));
      let position = 0;
      for (const lot of lots) {
        const [entry] = await tx
          .insert(schema.lotCatalogEntry)
          .values({ catalogId: catalog!.id, number: lot.number, name: lot.name, tradeFamily: lot.tradeFamily, position: position++ })
          .returning({ id: schema.lotCatalogEntry.id });
        for (const sub of lot.subLots ?? []) {
          await tx.insert(schema.lotCatalogEntry).values({ catalogId: catalog!.id, parentId: entry!.id, number: sub.number, name: sub.name, tradeFamily: lot.tradeFamily, position: position++ });
        }
      }
    }
  });
}

export async function listCatalogs(db: Database): Promise<Array<CatalogRow & { entries: EntryRow[] }>> {
  await ensureDefaultCatalogs(db);
  const catalogs = await db.select().from(schema.lotCatalog).orderBy(desc(schema.lotCatalog.isDefault), asc(schema.lotCatalog.position), asc(schema.lotCatalog.createdAt));
  const entries = catalogs.length ? await db.select().from(schema.lotCatalogEntry).where(inArray(schema.lotCatalogEntry.catalogId, catalogs.map((c) => c.id))).orderBy(asc(schema.lotCatalogEntry.position), asc(schema.lotCatalogEntry.number)) : [];
  return catalogs.map((c) => ({ ...c, entries: entries.filter((e) => e.catalogId === c.id) }));
}

/** Lots récemment ajoutés aux affaires (numéro et intitulé tels qu'utilisés), du plus récent au plus ancien. */
export async function recentLots(db: Database, limit = 8): Promise<Array<{ code: string; name: string; tradeFamily: string; catalogEntryId: string | null }>> {
  const rows = await db
    .select({ code: schema.projectLot.code, name: schema.projectLot.name, tradeFamily: schema.projectLot.tradeFamily, catalogEntryId: schema.projectLot.catalogEntryId, createdAt: schema.projectLot.createdAt })
    .from(schema.projectLot)
    .orderBy(desc(schema.projectLot.createdAt))
    .limit(200);
  const seen = new Set<string>();
  const out: Array<{ code: string; name: string; tradeFamily: string; catalogEntryId: string | null }> = [];
  for (const r of rows) {
    const key = `${r.code}|${r.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ code: r.code, name: r.name, tradeFamily: r.tradeFamily, catalogEntryId: r.catalogEntryId });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Lots suggérés par l'analyse des plans de l'affaire : catégories des éléments relevés, rapportées aux numéros
 * de la nomenclature par défaut, avec le nombre d'éléments et quelques exemples.
 */
export async function lotSuggestions(db: Database, projectId: string): Promise<Array<{ number: string; elements: number; examples: string[] }>> {
  const drawings = await db
    .select({ extraction: schema.drawing.extraction })
    .from(schema.drawing)
    .where(and(eq(schema.drawing.projectId, projectId), isNotNull(schema.drawing.extraction)));
  const byNumber = new Map<string, { elements: number; examples: Set<string> }>();
  for (const d of drawings) {
    const elements = ((d.extraction as { elements?: Array<{ category: string; designation: string }> } | null)?.elements ?? []);
    for (const el of elements) {
      for (const number of ELEMENT_LOT_SUGGESTIONS[el.category] ?? []) {
        const entry = byNumber.get(number) ?? { elements: 0, examples: new Set<string>() };
        entry.elements++;
        if (entry.examples.size < 3) entry.examples.add(el.designation);
        byNumber.set(number, entry);
      }
    }
  }
  return [...byNumber].map(([number, v]) => ({ number, elements: v.elements, examples: [...v.examples] })).sort((a, b) => b.elements - a.elements || a.number.localeCompare(b.number));
}

export type LotSelection = { catalogEntryId: string } | { code: string; name: string; tradeFamily: string; parentCode?: string | null };

/**
 * Ajoute des lots à une affaire : entrées de catalogue recopiées (numéro, intitulé, famille) ou lots
 * personnalisés. Un numéro déjà présent dans l'affaire est laissé tel quel (jamais renuméroté) et signalé.
 * Un sous-lot est rattaché au lot de l'affaire qui porte le numéro de son lot parent, s'il existe.
 */
export async function addProjectLots(db: Database, projectId: string, selections: LotSelection[]): Promise<{ created: Array<typeof schema.projectLot.$inferSelect>; skipped: Array<{ code: string; reason: string }> }> {
  const entryIds = selections.filter((s): s is { catalogEntryId: string } => "catalogEntryId" in s).map((s) => s.catalogEntryId);
  const entries = entryIds.length ? await db.select().from(schema.lotCatalogEntry).where(inArray(schema.lotCatalogEntry.id, entryIds)) : [];
  const parents = entries.some((e) => e.parentId) ? await db.select().from(schema.lotCatalogEntry).where(inArray(schema.lotCatalogEntry.id, entries.map((e) => e.parentId).filter((v): v is string => Boolean(v)))) : [];
  return db.transaction(async (tx) => {
    const existing = await tx.select().from(schema.projectLot).where(eq(schema.projectLot.projectId, projectId));
    const byCode = new Map(existing.map((l) => [l.code, l]));
    let position = existing.reduce((max, l) => Math.max(max, l.position), 0);
    const created: Array<typeof schema.projectLot.$inferSelect> = [];
    const skipped: Array<{ code: string; reason: string }> = [];
    // Lots avant sous-lots : un sous-lot trouve ainsi son lot parent ajouté dans la même opération.
    const resolved = selections
      .map((s) => {
        if ("catalogEntryId" in s) {
          const entry = entries.find((e) => e.id === s.catalogEntryId);
          if (!entry) return null;
          const parent = parents.find((p) => p.id === entry.parentId);
          return { code: entry.number, name: entry.name, tradeFamily: entry.tradeFamily, parentCode: parent?.number ?? null, catalogEntryId: entry.id };
        }
        return { code: s.code.trim(), name: s.name.trim(), tradeFamily: s.tradeFamily, parentCode: s.parentCode ?? null, catalogEntryId: null };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .sort((a, b) => Number(Boolean(a.parentCode)) - Number(Boolean(b.parentCode)));
    for (const s of resolved) {
      if (!s.code || !s.name) {
        skipped.push({ code: s.code || "?", reason: "numéro ou intitulé manquant" });
        continue;
      }
      if (byCode.has(s.code)) {
        skipped.push({ code: s.code, reason: "numéro déjà utilisé dans l’affaire : lot existant conservé tel quel" });
        continue;
      }
      const parent = s.parentCode ? byCode.get(s.parentCode) : undefined;
      const [row] = await tx
        .insert(schema.projectLot)
        .values({ projectId, code: s.code, name: s.name, tradeFamily: s.tradeFamily, position: ++position, parentId: parent?.id ?? null, catalogEntryId: s.catalogEntryId })
        .returning();
      byCode.set(s.code, row!);
      created.push(row!);
    }
    return { created, skipped };
  });
}

/**
 * Fusion de deux lots d'une affaire : ouvrages et mesures du lot absorbé passent au lot conservé, puis le
 * lot absorbé est retiré. Refusée si un CCTP ou une DPGF a déjà été établi pour le lot absorbé (ses
 * documents ne seraient plus cohérents).
 */
export async function mergeProjectLots(db: Database, projectId: string, sourceId: string, targetId: string): Promise<{ moved: number }> {
  if (sourceId === targetId) throw new LotMergeError("Choisissez deux lots différents.");
  const lots = await db.select().from(schema.projectLot).where(and(eq(schema.projectLot.projectId, projectId), inArray(schema.projectLot.id, [sourceId, targetId])));
  if (lots.length !== 2) throw new LotMergeError("Lot introuvable dans cette affaire.");
  const [cctp] = await db.select({ id: schema.cctpDocument.id }).from(schema.cctpDocument).where(eq(schema.cctpDocument.lotId, sourceId)).limit(1);
  const [dpgf] = await db.select({ id: schema.dpgf.id }).from(schema.dpgf).where(eq(schema.dpgf.lotId, sourceId)).limit(1);
  if (cctp || dpgf) throw new LotMergeError("Un CCTP ou une DPGF existe déjà pour le lot à absorber : fusion refusée pour garder des documents cohérents.");
  return db.transaction(async (tx) => {
    const moved = await tx.update(schema.workItem).set({ lotId: targetId }).where(eq(schema.workItem.lotId, sourceId)).returning({ id: schema.workItem.id });
    await tx.update(schema.measurement).set({ lotId: targetId }).where(eq(schema.measurement.lotId, sourceId));
    await tx.update(schema.projectLot).set({ parentId: targetId }).where(eq(schema.projectLot.parentId, sourceId));
    await tx.delete(schema.projectLot).where(eq(schema.projectLot.id, sourceId));
    return { moved: moved.length };
  });
}

export class LotMergeError extends Error {}
