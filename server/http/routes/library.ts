/**
 * Bibliothèque de prix : chaque prix a sa provenance, sa date, sa zone et son statut de vérification.
 * Toute modification de valeur est historisée. Import de fichiers CSV ou Excel avec correspondance des
 * colonnes, lignes refusées avec leur motif, import réversible. Sources publiques (Maroc, France)
 * chargées et actualisées par lots contrôlés, quarantaine des valeurs douteuses. Comparaison des
 * déclinaisons d'une référence, détection des doublons. Fournisseurs.
 */
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, type SQLWrapper, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { PRICE_ROW_DECISIONS } from "../../../shared/enums.js";
import { defaultReliability } from "../../../shared/prices.js";
import { listQuery, priceFile, priceImportRequest, priceItemInput, priceTaxIssue, supplierInput } from "../../../shared/schemas.js";
import type { AdminEnv } from "../../auth/guard.js";
import { getDb, schema } from "../../db/index.js";
import { createJob } from "../../jobs/runner.js";
import { auditAction } from "../../services/audit.js";
import { parsePriceFilters, priceWhere } from "../../services/price-filters.js";
import { MAX_ROWS, parseAmount, parseDate, parseKind, parsePriceFile } from "../../services/price-import.js";
import { SOURCES } from "../../services/price-sources/catalog.js";
import { ensureSources, publishRows, rejectRows, revertBatch, SourceImportError } from "../../services/price-sources/engine.js";
import { readSnapshot } from "../../services/price-sources/snapshot.js";
import { readSetting } from "../../services/settings.js";
import { serializeJob } from "./agents.js";
import { body, conflict, notFound, parse, patchBody, uuidParam, ValidationError } from "../validate.js";

const p = schema.priceItem;
const src = schema.priceSource;
const batch = schema.priceImportBatch;
const row = schema.priceImportRow;

/** Prix accompagné de son fournisseur et de sa source publique. */
const priceColumns = { price: p, supplierName: schema.supplier.name, sourceName: src.name, sourceKey: src.key, sourcePublisher: src.publisher };
type PriceRow = { price: typeof p.$inferSelect; supplierName: string | null; sourceName: string | null; sourceKey: string | null; sourcePublisher: string | null };
const flatten = (r: PriceRow) => ({ ...r.price, supplierName: r.supplierName, sourceName: r.sourceName, sourceKey: r.sourceKey, sourcePublisher: r.sourcePublisher });

/** Désignation ramenée à une forme comparable (casse, accents, ponctuation). */
const normalized = (expr: SQLWrapper) => sql`trim(regexp_replace(translate(lower(${expr}), 'àâäéèêëîïôöùûüçœ’''', 'aaaeeeeiioouuuco  '), '[^a-z0-9]+', ' ', 'g'))`;

function taxCheck(data: { taxBasis?: string | null; vatRate?: string | null }) {
  const issue = priceTaxIssue(data);
  if (issue) throw new ValidationError({ vatRate: issue });
}

async function sourceStats() {
  const db = await getDb();
  const sources = await ensureSources(db);
  const [counts, pending, latest] = await Promise.all([
    db
      .select({ sourceId: p.sourceId, n: count() })
      .from(p)
      .where(and(isNotNull(p.sourceId), isNull(p.archivedAt)))
      .groupBy(p.sourceId),
    db
      .select({ sourceId: batch.sourceId, n: count() })
      .from(row)
      .innerJoin(batch, eq(batch.id, row.batchId))
      .where(inArray(row.decision, ["a_publier", "quarantaine"]))
      .groupBy(batch.sourceId),
    db
      .selectDistinctOn([batch.sourceId])
      .from(batch)
      .where(isNotNull(batch.sourceId))
      .orderBy(batch.sourceId, desc(batch.createdAt)),
  ]);
  const activeJobs = await db
    .select()
    .from(schema.generationJob)
    .where(and(eq(schema.generationJob.kind, "import_prix"), inArray(schema.generationJob.status, ["en_attente", "en_cours"])));
  const activeSteps = activeJobs.length
    ? await db
        .select()
        .from(schema.generationStep)
        .where(inArray(schema.generationStep.jobId, activeJobs.map((j) => j.id)))
        .orderBy(asc(schema.generationStep.position))
    : [];
  return sources.map((s) => {
    const snapshot = readSnapshot(s.key);
    const job = activeJobs.find((j) => (j.input as { sourceKey?: string }).sourceKey === s.key);
    return {
      ...s,
      references: Number(counts.find((c) => c.sourceId === s.id)?.n ?? 0),
      pending: Number(pending.find((c) => c.sourceId === s.id)?.n ?? 0),
      lastBatch: latest.find((b) => b.sourceId === s.id) ?? null,
      snapshot: snapshot ? { generatedAt: snapshot.generatedAt, references: snapshot.records.length } : null,
      job: job ? serializeJob(job, activeSteps.filter((st) => st.jobId === job.id)) : null,
    };
  });
}

const sourceSettings = z.object({
  autoPublish: z.boolean(),
  maxVariation: z.coerce.number().min(5).max(200),
  refreshDays: z.coerce.number().int().min(7).max(365),
  enabled: z.boolean(),
});

const rowSelection = z.object({ rowIds: z.array(z.string().uuid()).max(5000).optional() });

async function guardedImport<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof SourceImportError) conflict(error.message);
    throw error;
  }
}

export const libraryRoutes = new Hono<AdminEnv>()
  .get("/prices", async (c) => {
    const db = await getDb();
    const q = parse(listQuery, c.req.query());
    const query = c.req.query();
    const filters = parsePriceFilters(query, query.anciens === "1" ? (await readSetting("alertes")).stalePriceMonths : undefined);
    const where = priceWhere(filters);
    const order = q.sort === "designation" ? (q.dir === "asc" ? asc(p.designation) : desc(p.designation)) : q.sort === "prix" ? (q.dir === "asc" ? asc(p.unitPrice) : desc(p.unitPrice)) : desc(p.priceDate);
    const [rows, total] = await Promise.all([
      db
        .select(priceColumns)
        .from(p)
        .leftJoin(schema.supplier, eq(schema.supplier.id, p.supplierId))
        .leftJoin(src, eq(src.id, p.sourceId))
        .where(where)
        .orderBy(order, asc(p.designation), asc(p.region), asc(p.city))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      db.select({ n: count() }).from(p).where(where),
    ]);
    return c.json({ items: rows.map(flatten), total: Number(total[0]?.n ?? 0), page: q.page, pageSize: q.pageSize });
  })
  /** Valeurs proposées par les filtres : régions, villes, familles, sources présentes dans la bibliothèque. */
  .get("/facets", async (c) => {
    const db = await getDb();
    const country = c.req.query("pays");
    const scope = and(isNull(p.archivedAt), country === "MA" || country === "FR" ? eq(p.country, country) : undefined);
    const [zones, families, sources] = await Promise.all([
      db.selectDistinct({ country: p.country, region: p.region, city: p.city }).from(p).where(scope).orderBy(asc(p.region), asc(p.city)),
      db.selectDistinct({ tradeFamily: p.tradeFamily }).from(p).where(and(scope, isNotNull(p.tradeFamily))),
      db
        .select({ key: src.key, name: src.name, country: src.country, n: count() })
        .from(p)
        .innerJoin(src, eq(src.id, p.sourceId))
        .where(scope)
        .groupBy(src.key, src.name, src.country),
    ]);
    const regions = [...new Set(zones.map((z) => z.region).filter((r): r is string => Boolean(r)))];
    const cities = zones.filter((z) => z.city).map((z) => ({ city: z.city!, region: z.region }));
    return c.json({ regions, cities, families: families.map((f) => f.tradeFamily), sources });
  })
  .post("/prices", async (c) => {
    const db = await getDb();
    const data = await body(c, priceItemInput);
    taxCheck(data);
    const [created] = await db
      .insert(p)
      .values({ ...data, reliability: data.reliability ?? defaultReliability(data.origin), verificationStatus: "a_verifier" })
      .returning();
    await db.insert(schema.priceHistory).values({ priceItemId: created!.id, unitPrice: created!.unitPrice, currency: created!.currency, priceDate: created!.priceDate, origin: created!.origin, note: "Création" });
    await auditAction(c, "bibliotheque.prix_ajoute", "price_item", created!.id, { prix: created!.designation });
    return c.json({ price: created }, 201);
  })
  .get("/prices/:id", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const [found] = await db
      .select(priceColumns)
      .from(p)
      .leftJoin(schema.supplier, eq(schema.supplier.id, p.supplierId))
      .leftJoin(src, eq(src.id, p.sourceId))
      .where(eq(p.id, id));
    if (!found) notFound("Prix introuvable.");
    const price = flatten(found);
    const [source, importBatch] = await Promise.all([
      price.sourceId ? db.select().from(src).where(eq(src.id, price.sourceId)).then((r) => r[0] ?? null) : null,
      price.importBatchId ? db.select({ id: batch.id, label: batch.label, status: batch.status, createdAt: batch.createdAt }).from(batch).where(eq(batch.id, price.importBatchId)).then((r) => r[0] ?? null) : null,
    ]);
    return c.json({ price, source, importBatch });
  })
  /**
   * Déclinaisons d'une référence pour la comparer : même référence dans les autres zones et années pour
   * une source publique, sinon prix de même désignation et même unité (autres sources ou fournisseurs).
   */
  .get("/prices/:id/compare", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const [price] = await db.select().from(p).where(eq(p.id, id));
    if (!price) notFound("Prix introuvable.");
    const sameReference = price.groupKey ? eq(p.groupKey, price.groupKey) : sql`${normalized(p.designation)} = ${normalized(sql`${price.designation}`)}`;
    const rows = await db
      .select(priceColumns)
      .from(p)
      .leftJoin(schema.supplier, eq(schema.supplier.id, p.supplierId))
      .leftJoin(src, eq(src.id, p.sourceId))
      .where(and(isNull(p.archivedAt), eq(p.country, price.country), eq(p.unit, price.unit), sameReference))
      .orderBy(asc(p.region), asc(p.city), desc(p.priceDate))
      .limit(200);
    return c.json({ items: rows.map(flatten) });
  })
  .patch("/prices/:id", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const [current] = await db.select().from(p).where(eq(p.id, id));
    if (!current) notFound("Prix introuvable.");
    if (current.sourceId) conflict("Référence publique : sa valeur suit la source. Dupliquez-la pour l’adapter à vos conditions.");
    const data = await patchBody(c, priceItemInput);
    taxCheck({ taxBasis: data.taxBasis !== undefined ? data.taxBasis : current.taxBasis, vatRate: data.vatRate !== undefined ? data.vatRate : current.vatRate });
    const valueChanged =
      (data.unitPrice !== undefined && Number(data.unitPrice) !== Number(current.unitPrice)) ||
      (data.currency !== undefined && data.currency !== current.currency) ||
      (data.priceDate !== undefined && data.priceDate !== current.priceDate);
    const [updated] = await db
      .update(p)
      .set({ ...data, ...(valueChanged ? { verificationStatus: "a_verifier" as const } : {}) })
      .where(eq(p.id, id))
      .returning();
    // Une nouvelle valeur est historisée : l'ancienne reste consultable.
    if (valueChanged) await db.insert(schema.priceHistory).values({ priceItemId: id, unitPrice: updated!.unitPrice, currency: updated!.currency, priceDate: updated!.priceDate, origin: updated!.origin, note: "Nouvelle valeur" });
    await auditAction(c, "bibliotheque.prix_modifie", "price_item", id, { prix: updated!.designation, champs: Object.keys(data) });
    return c.json({ price: updated });
  })
  /** Copie modifiable d'une référence (publique ou non), rattachée à sa référence d'origine. */
  .post("/prices/:id/duplicate", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const [current] = await db.select().from(p).where(eq(p.id, id));
    if (!current) notFound("Prix introuvable.");
    const {
      id: _id,
      createdAt: _c,
      updatedAt: _u,
      sourceId: _s,
      externalKey: _e,
      groupKey: _g,
      importBatchId: _b,
      archivedAt: _a,
      verifiedAt: _v,
      ...fields
    } = current;
    const [copy] = await db
      .insert(p)
      .values({ ...fields, verificationStatus: "a_verifier", sourceRef: `Copie de la référence « ${current.designation} »${current.sourceRef ? `, ${current.sourceRef}` : ""}`.slice(0, 300) })
      .returning();
    await db.insert(schema.priceHistory).values({ priceItemId: copy!.id, unitPrice: copy!.unitPrice, currency: copy!.currency, priceDate: copy!.priceDate, origin: copy!.origin, note: "Copie d’une référence" });
    await auditAction(c, "bibliotheque.prix_duplique", "price_item", copy!.id, { prix: copy!.designation, origine: id });
    return c.json({ price: copy }, 201);
  })
  .post("/prices/:id/verify", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const status = ((await c.req.json().catch(() => ({}))) as { status?: string }).status;
    if (status !== "verifie" && status !== "a_verifier" && status !== "rejete") throw new ValidationError({ status: "Statut invalide." });
    const [updated] = await db
      .update(p)
      .set({ verificationStatus: status, ...(status === "verifie" ? { verifiedAt: new Date() } : {}) })
      .where(eq(p.id, id))
      .returning();
    if (!updated) notFound("Prix introuvable.");
    await auditAction(c, `bibliotheque.prix_${status === "verifie" ? "verifie" : status === "rejete" ? "rejete" : "a_verifier"}`, "price_item", id, { prix: updated.designation });
    return c.json({ price: updated });
  })
  .post("/prices/:id/archive", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const archived = ((await c.req.json().catch(() => ({}))) as { archived?: boolean }).archived !== false;
    const [updated] = await db
      .update(p)
      .set({ archivedAt: archived ? new Date() : null })
      .where(eq(p.id, id))
      .returning();
    if (!updated) notFound("Prix introuvable.");
    await auditAction(c, archived ? "bibliotheque.prix_archive" : "bibliotheque.prix_restaure", "price_item", id, { prix: updated.designation });
    return c.json({ price: updated });
  })
  .get("/prices/:id/history", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const rows = await db
      .select({ entry: schema.priceHistory, batchLabel: batch.label })
      .from(schema.priceHistory)
      .leftJoin(batch, eq(batch.id, schema.priceHistory.batchId))
      .where(eq(schema.priceHistory.priceItemId, id))
      .orderBy(desc(schema.priceHistory.recordedAt));
    return c.json({ items: rows.map((r) => ({ ...r.entry, batchLabel: r.batchLabel })) });
  })
  /** Groupes de prix en service de même désignation, même unité et même zone : doublons probables. */
  .get("/duplicates", async (c) => {
    const db = await getDb();
    const country = c.req.query("pays");
    const groups = (await db.execute(sql`
      select ${normalized(p.designation)} as key, unit, country, coalesce(region, '') as region, coalesce(city, '') as city, count(*)::int as n,
        array_agg(id order by price_date desc) as ids
      from price_item
      where archived_at is null ${country === "MA" || country === "FR" ? sql`and country = ${country}` : sql``}
      group by 1, unit, country, coalesce(region, ''), coalesce(city, '')
      having count(*) > 1
      order by count(*) desc
      limit 100
    `)) as unknown as { rows: Array<{ ids: string[]; n: number }> };
    const ids = groups.rows.flatMap((g) => g.ids);
    const prices = ids.length
      ? await db
          .select(priceColumns)
          .from(p)
          .leftJoin(schema.supplier, eq(schema.supplier.id, p.supplierId))
          .leftJoin(src, eq(src.id, p.sourceId))
          .where(inArray(p.id, ids))
      : [];
    const byId = new Map(prices.map((r) => [r.price.id, flatten(r)]));
    return c.json({ groups: groups.rows.map((g) => ({ count: g.n, items: g.ids.map((x) => byId.get(x)).filter(Boolean) })) });
  })
  .post("/prices/import/preview", async (c) => {
    const data = await body(c, priceFile.extend({ sheet: priceImportRequest.shape.sheet }));
    try {
      const table = await parsePriceFile(data.fileName, data.contentBase64, data.sheet);
      return c.json({ sheets: table.sheets, sheet: table.sheet, rows: table.rows.slice(0, 15), total: table.rows.length, truncated: table.rows.length >= MAX_ROWS });
    } catch (error) {
      throw new ValidationError({ fileName: error instanceof Error ? error.message : "Fichier illisible." });
    }
  })
  .post("/prices/import", async (c) => {
    const db = await getDb();
    const data = await body(c, priceImportRequest);
    let table;
    try {
      table = await parsePriceFile(data.fileName, data.contentBase64, data.sheet);
    } catch (error) {
      throw new ValidationError({ fileName: error instanceof Error ? error.message : "Fichier illisible." });
    }
    const rows = table.rows.slice(data.headerRow + 1);
    const accepted: Array<typeof p.$inferInsert> = [];
    const rejected: Array<{ row: number; reason: string }> = [];
    rows.forEach((cells, index) => {
      const line = data.headerRow + index + 2;
      const designation = cells[data.columns.designation]?.trim();
      const unit = cells[data.columns.unit]?.trim();
      const unitPrice = parseAmount(cells[data.columns.unitPrice]);
      if (!designation) return rejected.push({ row: line, reason: "désignation vide" });
      if (!unit) return rejected.push({ row: line, reason: "unité vide" });
      if (!unitPrice || Number(unitPrice) <= 0) return rejected.push({ row: line, reason: "prix illisible ou nul" });
      const kind = (data.columns.kind !== null ? parseKind(cells[data.columns.kind]) : null) ?? data.defaults.kind;
      const rawDate = data.columns.priceDate !== null ? cells[data.columns.priceDate]?.trim() : "";
      const priceDate = rawDate ? parseDate(rawDate) : data.defaults.priceDate;
      if (!priceDate) return rejected.push({ row: line, reason: `date illisible (${rawDate})` });
      accepted.push({
        code: data.columns.code !== null ? cells[data.columns.code]?.trim() || null : null,
        designation: designation.slice(0, 500),
        kind,
        unit: unit.slice(0, 20),
        unitPrice,
        currency: data.defaults.currency,
        country: data.defaults.country,
        tradeFamily: data.defaults.tradeFamily,
        origin: data.defaults.origin,
        supplierId: data.defaults.supplierId,
        sourceRef: `${data.fileName}, ligne ${line}`,
        priceDate,
        reliability: defaultReliability(data.defaults.origin),
        verificationStatus: "a_verifier",
      });
    });
    // Lot de l'import : il permet d'annuler l'import entier (prix archivés, jamais supprimés).
    const [fileBatch] = await db
      .insert(batch)
      .values({
        label: `Fichier ${data.fileName}`.slice(0, 200),
        trigger: "fichier",
        status: accepted.length ? "publie" : "sans_changement",
        stats: { lues: rows.length, nouvelles: accepted.length, publiees: accepted.length, rejetees: rejected.length },
        publishedAt: accepted.length ? new Date() : null,
      })
      .returning();
    let imported = 0;
    for (let i = 0; i < accepted.length; i += 200) {
      const slice = accepted.slice(i, i + 200).map((x) => ({ ...x, importBatchId: fileBatch!.id }));
      const inserted = await db.insert(p).values(slice).returning({ id: p.id, unitPrice: p.unitPrice, currency: p.currency, priceDate: p.priceDate, origin: p.origin });
      await db
        .insert(schema.priceHistory)
        .values(inserted.map((r) => ({ priceItemId: r.id, unitPrice: r.unitPrice, currency: r.currency, priceDate: r.priceDate, origin: r.origin, batchId: fileBatch!.id, note: `Import ${data.fileName}` })));
      imported += inserted.length;
    }
    await auditAction(c, "bibliotheque.import", "price_item", null, { fichier: data.fileName, importes: imported, refuses: rejected.length });
    return c.json({ imported, rejected: rejected.slice(0, 50), rejectedCount: rejected.length, batchId: fileBatch!.id });
  })
  /* ---------- Sources publiques et lots ---------- */
  .get("/sources", async (c) => c.json({ items: await sourceStats(), catalog: SOURCES.map((s) => ({ key: s.key, resources: s.resources.length })) }))
  .patch("/sources/:key", async (c) => {
    const db = await getDb();
    const key = c.req.param("key");
    await ensureSources(db);
    const { maxVariation, ...data } = await patchBody(c, sourceSettings);
    const [updated] = await db
      .update(src)
      .set({ ...data, ...(maxVariation !== undefined ? { maxVariation: String(maxVariation) } : {}) })
      .where(eq(src.key, key))
      .returning();
    if (!updated) notFound("Source introuvable.");
    await auditAction(c, "bibliotheque.source_reglee", "price_source", updated.id, { source: updated.name, champs: [...Object.keys(data), ...(maxVariation !== undefined ? ["maxVariation"] : [])] });
    return c.json({ source: updated });
  })
  /** Premier chargement depuis l'instantané livré, ou relecture des ressources officielles en ligne. */
  .post("/sources/:key/:mode{load|refresh}", async (c) => {
    const db = await getDb();
    const key = c.req.param("key");
    const mode = c.req.param("mode") === "load" ? "instantane" : "actualisation";
    const def = SOURCES.find((s) => s.key === key);
    if (!def) notFound("Source introuvable.");
    if (mode === "instantane" && !readSnapshot(key)) conflict("Aucun instantané de cette source dans ce déploiement : lancez une actualisation en ligne.");
    await ensureSources(db);
    const job = await createJob({ kind: "import_prix", projectId: null, input: { sourceKey: key, mode, trigger: "manuel" } });
    const steps = await db.select().from(schema.generationStep).where(eq(schema.generationStep.jobId, job.id)).orderBy(asc(schema.generationStep.position));
    const [fresh] = await db.select().from(schema.generationJob).where(eq(schema.generationJob.id, job.id));
    await auditAction(c, mode === "instantane" ? "bibliotheque.source_chargee" : "bibliotheque.source_actualisee", "price_source", null, { source: def!.name });
    return c.json({ job: serializeJob(fresh ?? job, steps) }, 202);
  })
  .get("/batches", async (c) => {
    const db = await getDb();
    const key = c.req.query("source");
    const where = key === "fichiers" ? isNull(batch.sourceId) : key ? sql`${batch.sourceId} = (select id from price_source where key = ${key})` : undefined;
    const rows = await db
      .select({ batch, sourceName: src.name, sourceKey: src.key })
      .from(batch)
      .leftJoin(src, eq(src.id, batch.sourceId))
      .where(where)
      .orderBy(desc(batch.createdAt))
      .limit(30);
    return c.json({ items: rows.map((r) => ({ ...r.batch, sourceName: r.sourceName, sourceKey: r.sourceKey })) });
  })
  .get("/batches/:id/rows", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const q = parse(listQuery, c.req.query());
    const decision = c.req.query("decision");
    const where = and(eq(row.batchId, id), decision && (PRICE_ROW_DECISIONS as readonly string[]).includes(decision) ? eq(row.decision, decision as (typeof PRICE_ROW_DECISIONS)[number]) : undefined);
    const [rows, total] = await Promise.all([
      db
        .select()
        .from(row)
        .where(where)
        .orderBy(asc(row.decision), asc(row.externalKey))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      db.select({ n: count() }).from(row).where(where),
    ]);
    return c.json({ items: rows, total: Number(total[0]?.n ?? 0), page: q.page, pageSize: q.pageSize });
  })
  .post("/batches/:id/publish", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const data = await body(c, rowSelection);
    const updated = await guardedImport(() => publishRows(db, id, data.rowIds));
    await auditAction(c, "bibliotheque.lot_publie", "price_import_batch", id, { lot: updated.label, lignes: data.rowIds?.length ?? "toutes" });
    return c.json({ batch: updated });
  })
  .post("/batches/:id/reject", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const data = await body(c, rowSelection);
    if (!data.rowIds?.length) throw new ValidationError({ rowIds: "Choisissez les valeurs à écarter." });
    const updated = await guardedImport(() => rejectRows(db, id, data.rowIds!));
    await auditAction(c, "bibliotheque.lot_valeurs_ecartees", "price_import_batch", id, { lot: updated.label, lignes: data.rowIds.length });
    return c.json({ batch: updated });
  })
  .post("/batches/:id/revert", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const updated = await guardedImport(() => revertBatch(db, id));
    await auditAction(c, "bibliotheque.lot_annule", "price_import_batch", id, { lot: updated.label });
    return c.json({ batch: updated });
  })
  .get("/suppliers", async (c) => {
    const db = await getDb();
    const rows = await db.select().from(schema.supplier).orderBy(asc(schema.supplier.name));
    return c.json({ items: rows });
  })
  .post("/suppliers", async (c) => {
    const db = await getDb();
    const data = await body(c, supplierInput);
    const [created] = await db.insert(schema.supplier).values(data).returning();
    await auditAction(c, "bibliotheque.fournisseur_ajoute", "supplier", created!.id, { fournisseur: created!.name });
    return c.json({ supplier: created }, 201);
  })
  .patch("/suppliers/:id", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const data = await patchBody(c, supplierInput);
    const [updated] = await db.update(schema.supplier).set(data).where(eq(schema.supplier.id, id)).returning();
    if (!updated) notFound("Fournisseur introuvable.");
    return c.json({ supplier: updated });
  });
