/**
 * Catalogue des lots : nomenclatures (modèles modifiables), lots et sous-lots, favoris, fusion et séparation ;
 * lots d'une affaire ajoutés en une fois depuis le catalogue ou en lot personnalisé, suggestions tirées des
 * plans, fusion de deux lots d'une affaire. Les lots d'une affaire existante ne sont jamais renumérotés.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { lotCatalogInput, lotEntryInput, lotMergeInput, lotSplitInput, projectLotMergeInput, projectLotsBulkInput } from "../../../shared/schemas.js";
import type { AdminEnv } from "../../auth/guard.js";
import { getDb, schema } from "../../db/index.js";
import { auditAction } from "../../services/audit.js";
import { addProjectLots, ensureDefaultCatalogs, listCatalogs, LotMergeError, lotSuggestions, mergeProjectLots, recentLots } from "../../services/lot-catalog.js";
import { body, conflict, notFound, patchBody, uuidParam } from "../validate.js";

const cat = schema.lotCatalog;
const entry = schema.lotCatalogEntry;

async function catalogOr404(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(cat).where(eq(cat.id, id));
  if (!row) notFound("Nomenclature introuvable.");
  return row;
}

async function entryOr404(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(entry).where(eq(entry.id, id));
  if (!row) notFound("Lot introuvable dans la nomenclature.");
  return row;
}

/** Numéro déjà pris dans la nomenclature (contrainte d'unicité). */
async function assertFreeNumber(catalogId: string, number: string, exceptId?: string) {
  const db = await getDb();
  const [taken] = await db.select({ id: entry.id }).from(entry).where(and(eq(entry.catalogId, catalogId), eq(entry.number, number)));
  if (taken && taken.id !== exceptId) conflict(`Le numéro ${number} existe déjà dans cette nomenclature.`);
}

async function nextPosition(catalogId: string): Promise<number> {
  const db = await getDb();
  const [{ max } = { max: 0 }] = await db.select({ max: sql<number>`coalesce(max(${entry.position}), 0)::int` }).from(entry).where(eq(entry.catalogId, catalogId));
  return Number(max) + 1;
}

export const lotCatalogRoutes = new Hono<AdminEnv>()
  .get("/", async (c) => {
    const db = await getDb();
    return c.json({ catalogs: await listCatalogs(db), recent: await recentLots(db) });
  })
  .post("/", async (c) => {
    const db = await getDb();
    await ensureDefaultCatalogs(db);
    const data = await body(c, lotCatalogInput);
    const created = await db.transaction(async (tx) => {
      if (data.isDefault) await tx.update(cat).set({ isDefault: false });
      const [row] = await tx.insert(cat).values({ name: data.name, country: data.country, projectType: data.projectType, isDefault: data.isDefault }).returning();
      if (data.copyFrom) {
        // Copie d'une nomenclature : lots puis sous-lots, rattachés à leurs nouveaux parents.
        const source = await tx.select().from(entry).where(eq(entry.catalogId, data.copyFrom)).orderBy(asc(entry.position));
        const ids = new Map<string, string>();
        for (const e of [...source].sort((a, b) => Number(Boolean(a.parentId)) - Number(Boolean(b.parentId)))) {
          const [copy] = await tx
            .insert(entry)
            .values({ catalogId: row!.id, parentId: e.parentId ? (ids.get(e.parentId) ?? null) : null, number: e.number, name: e.name, tradeFamily: e.tradeFamily, favorite: e.favorite, archived: e.archived, position: e.position })
            .returning({ id: entry.id });
          ids.set(e.id, copy!.id);
        }
      }
      return row!;
    });
    await auditAction(c, "lots.nomenclature_creee", "lot_catalog", created.id, { nom: created.name, copie: Boolean(data.copyFrom) });
    return c.json({ catalog: created }, 201);
  })
  .patch("/:id", async (c) => {
    const id = uuidParam(c);
    await catalogOr404(id);
    const db = await getDb();
    const data = await patchBody(c, lotCatalogInput.omit({ copyFrom: true }));
    const row = await db.transaction(async (tx) => {
      if (data.isDefault) await tx.update(cat).set({ isDefault: false });
      const [updated] = await tx.update(cat).set(data).where(eq(cat.id, id)).returning();
      return updated!;
    });
    return c.json({ catalog: row });
  })
  .delete("/:id", async (c) => {
    const id = uuidParam(c);
    const catalog = await catalogOr404(id);
    const db = await getDb();
    const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(cat);
    if (Number(n) <= 1) conflict("La dernière nomenclature ne peut pas être supprimée.");
    // Les affaires ont recopié leurs lots : supprimer une nomenclature ne les modifie pas.
    await db.delete(cat).where(eq(cat.id, id));
    if (catalog.isDefault) {
      const [first] = await db.select({ id: cat.id }).from(cat).orderBy(asc(cat.position), asc(cat.createdAt)).limit(1);
      if (first) await db.update(cat).set({ isDefault: true }).where(eq(cat.id, first.id));
    }
    await auditAction(c, "lots.nomenclature_supprimee", "lot_catalog", id, { nom: catalog.name });
    return c.json({ ok: true });
  })
  .post("/:id/entries", async (c) => {
    const id = uuidParam(c);
    await catalogOr404(id);
    const data = await body(c, lotEntryInput);
    await assertFreeNumber(id, data.number);
    if (data.parentId) {
      const parent = await entryOr404(data.parentId);
      if (parent.catalogId !== id) conflict("Le lot parent appartient à une autre nomenclature.");
    }
    const db = await getDb();
    const [row] = await db.insert(entry).values({ ...data, catalogId: id, position: await nextPosition(id) }).returning();
    return c.json({ entry: row }, 201);
  })
  .post("/:id/merge", async (c) => {
    // Fusion : les lots fusionnés sont retirés (archivés, jamais effacés), un lot les remplace.
    const id = uuidParam(c);
    await catalogOr404(id);
    const data = await body(c, lotMergeInput);
    const db = await getDb();
    const sources = await db.select().from(entry).where(and(eq(entry.catalogId, id), inArray(entry.id, data.entryIds)));
    if (sources.length !== data.entryIds.length) notFound("Lot introuvable dans la nomenclature.");
    const sourceIds = new Set(sources.map((s) => s.id));
    const [taken] = await db.select({ id: entry.id }).from(entry).where(and(eq(entry.catalogId, id), eq(entry.number, data.number)));
    if (taken && !sourceIds.has(taken.id)) conflict(`Le numéro ${data.number} existe déjà dans cette nomenclature.`);
    const merged = await db.transaction(async (tx) => {
      const first = [...sources].sort((a, b) => a.position - b.position)[0]!;
      // Le numéro repris par la fusion est libéré par le lot qui le portait (archivé sous un numéro dérivé).
      for (const s of sources) await tx.update(entry).set({ archived: true, number: `${s.number}~${Date.now().toString(36)}` }).where(eq(entry.id, s.id));
      const [row] = await tx.insert(entry).values({ catalogId: id, number: data.number, name: data.name, tradeFamily: first.tradeFamily, position: first.position }).returning();
      await tx.update(entry).set({ parentId: row!.id }).where(inArray(entry.parentId, [...sourceIds]));
      return row!;
    });
    await auditAction(c, "lots.fusion", "lot_catalog", id, { lots: sources.map((s) => s.number), resultat: `${merged.number} ${merged.name}` });
    return c.json({ entry: merged }, 201);
  });

export const lotEntryRoutes = new Hono<AdminEnv>()
  .patch("/:id", async (c) => {
    const id = uuidParam(c);
    const current = await entryOr404(id);
    const data = await patchBody(c, lotEntryInput);
    if (data.number && data.number !== current.number) await assertFreeNumber(current.catalogId, data.number, id);
    const db = await getDb();
    const [row] = await db.update(entry).set(data).where(eq(entry.id, id)).returning();
    return c.json({ entry: row });
  })
  .post("/:id/split", async (c) => {
    // Séparation : un nouveau lot de même famille est créé à côté du lot d'origine, qui reste en place.
    const id = uuidParam(c);
    const current = await entryOr404(id);
    const data = await body(c, lotSplitInput);
    await assertFreeNumber(current.catalogId, data.number);
    const db = await getDb();
    const [row] = await db.insert(entry).values({ catalogId: current.catalogId, parentId: current.parentId, number: data.number, name: data.name, tradeFamily: current.tradeFamily, position: current.position }).returning();
    return c.json({ entry: row }, 201);
  })
  .delete("/:id", async (c) => {
    const id = uuidParam(c);
    await entryOr404(id);
    const db = await getDb();
    await db.delete(entry).where(eq(entry.id, id));
    return c.json({ ok: true });
  });

/** Lots d'une affaire : ajout groupé, suggestions des plans, fusion. */
export const projectLotRoutes = new Hono<AdminEnv>()
  .post("/:id/lots/bulk", async (c) => {
    const projectId = uuidParam(c);
    const db = await getDb();
    const [project] = await db.select({ id: schema.project.id }).from(schema.project).where(eq(schema.project.id, projectId));
    if (!project) notFound("Affaire introuvable.");
    const data = await body(c, projectLotsBulkInput);
    const result = await addProjectLots(db, projectId, data.selections);
    if (result.created.length) await auditAction(c, "affaire.lots_ajoutes", "project", projectId, { lots: result.created.map((l) => `${l.code} ${l.name}`) });
    return c.json(result, result.created.length ? 201 : 200);
  })
  .get("/:id/lot-suggestions", async (c) => {
    const projectId = uuidParam(c);
    const db = await getDb();
    return c.json({ suggestions: await lotSuggestions(db, projectId) });
  })
  .post("/:id/lots/:lotId/merge", async (c) => {
    const projectId = uuidParam(c);
    const lotId = uuidParam(c, "lotId");
    const data = await body(c, projectLotMergeInput);
    const db = await getDb();
    try {
      const result = await mergeProjectLots(db, projectId, lotId, data.targetId);
      await auditAction(c, "affaire.lots_fusionnes", "project", projectId, { absorbe: lotId, conserve: data.targetId, ouvrages: result.moved });
      return c.json(result);
    } catch (error) {
      if (error instanceof LotMergeError) conflict(error.message);
      throw error;
    }
  });
