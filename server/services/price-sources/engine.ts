/**
 * Import des sources publiques dans la bibliothèque, par lots analysés puis publiés, toujours réversibles.
 *
 * Règles de contrôle d'une valeur (une valeur douteuse part en quarantaine, jamais publiée d'office) :
 * - prix nul, négatif ou illisible : rejeté ;
 * - unité différente de la valeur publiée : quarantaine ;
 * - valeur plus ancienne que la valeur publiée : quarantaine ;
 * - révision d'une même période au-delà du seuil de variation de la source : quarantaine ;
 * - nouvelle période dont la variation annuelle moyenne dépasse ce seuil : quarantaine ;
 * - nouvelle référence plus de trois fois au-dessus ou en dessous de la médiane des références sœurs
 *   (même référence dans les autres zones, même unité, au moins trois) : quarantaine ;
 * - lot de moins de la moitié des références déjà publiées : tout le lot reste en attente.
 * Une référence absente du nouveau lot n'est ni supprimée ni archivée : elle est comptée et signalée.
 * Une référence archivée par l'utilisateur n'est pas modifiée par les imports.
 */
import { and, asc, desc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import type { PriceRowDecision } from "../../../shared/enums.js";
import type { BatchStats, PreviousValue, SourceRecord, SourceResource } from "../../../shared/prices.js";
import { type Database, schema } from "../../db/index.js";
import { normalizeUnit } from "../units.js";
import { SOURCES, type SourceDefinition } from "./catalog.js";

const p = schema.priceItem;
const b = schema.priceImportBatch;
const r = schema.priceImportRow;

export type SourceRow = typeof schema.priceSource.$inferSelect;
export type BatchRow = typeof schema.priceImportBatch.$inferSelect;

export class SourceImportError extends Error {}

const CHUNK = 400;
const PEER_FACTOR = 3;
const MIN_PEERS = 3;

const fr = (n: number, digits = 1) => n.toLocaleString("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/** Inscrit ou met à jour le registre des sources ; les réglages modifiés par l'utilisateur sont conservés. */
export async function ensureSources(db: Database): Promise<SourceRow[]> {
  for (const def of SOURCES) {
    const descriptive = {
      name: def.name,
      publisher: def.publisher,
      country: def.country,
      homepage: def.homepage,
      license: def.license,
      licenseUrl: def.licenseUrl,
      description: def.description,
      method: def.method,
      coverage: def.coverage,
    };
    await db
      .insert(schema.priceSource)
      .values({ key: def.key, ...descriptive, refreshDays: def.refreshDays, maxVariation: String(def.maxVariation) })
      .onConflictDoUpdate({ target: schema.priceSource.key, set: descriptive });
  }
  return db.select().from(schema.priceSource).orderBy(asc(schema.priceSource.country), asc(schema.priceSource.name));
}

export async function sourceByKey(db: Database, key: string): Promise<{ row: SourceRow; def: SourceDefinition }> {
  const def = SOURCES.find((s) => s.key === key);
  if (!def) throw new SourceImportError(`Source inconnue : ${key}.`);
  await ensureSources(db);
  const [row] = await db.select().from(schema.priceSource).where(eq(schema.priceSource.key, key));
  return { row: row!, def };
}

/* ---------- Analyse ---------- */

type Existing = Pick<
  typeof p.$inferSelect,
  "id" | "externalKey" | "unitPrice" | "unit" | "priceDate" | "period" | "priceMin" | "priceMax" | "sampleSize" | "series" | "archivedAt" | "importBatchId" | "designation"
>;

interface Classified {
  record: SourceRecord;
  action: "nouveau" | "modifie";
  decision: PriceRowDecision;
  reason: string | null;
  existing: Existing | null;
  /** Référence annulée avec son lot puis proposée de nouveau : elle est restaurée. */
  revive: boolean;
}

const sameNumber = (a: string | null, b: string | null) => (a === null || b === null ? a === b : Number(a) === Number(b));
const canonical = (series: Record<string, number> | null) =>
  series
    ? JSON.stringify(
        Object.keys(series)
          .sort()
          .map((k) => [k, series[k]]),
      )
    : "";

function unchanged(e: Existing, rec: SourceRecord): boolean {
  return (
    sameNumber(e.unitPrice, rec.unitPrice) &&
    e.unit === rec.unit &&
    e.priceDate === rec.priceDate &&
    (e.period ?? null) === rec.period &&
    sameNumber(e.priceMin, rec.priceMin) &&
    sameNumber(e.priceMax, rec.priceMax) &&
    (e.sampleSize ?? null) === rec.sampleSize &&
    canonical(e.series) === canonical(rec.series)
  );
}

function median(values: number[]): number {
  const s = [...values].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Contrôle d'une valeur : null si elle peut être publiée, sinon le motif de quarantaine. */
function anomaly(rec: SourceRecord, existing: Existing | null, peers: number[] | undefined, maxVariation: number): string | null {
  const value = Number(rec.unitPrice);
  if (existing && !existing.archivedAt) {
    if (normalizeUnit(existing.unit) !== normalizeUnit(rec.unit)) return `Unité modifiée : ${existing.unit} devient ${rec.unit}.`;
    if (rec.priceDate < existing.priceDate) return `Valeur plus ancienne que la valeur publiée (${existing.period ?? existing.priceDate}).`;
    const before = Number(existing.unitPrice);
    if (before > 0 && value !== before) {
      const years = (Date.parse(rec.priceDate) - Date.parse(existing.priceDate)) / (365.25 * 86_400_000);
      if (years < 0.5) {
        const change = (value / before - 1) * 100;
        if (Math.abs(change) > maxVariation) return `Révision de la valeur ${rec.period} de ${change > 0 ? "+" : ""}${fr(change)} %, au-delà du seuil de ${fr(maxVariation, 0)} %.`;
      } else {
        const yearly = (Math.pow(value / before, 1 / years) - 1) * 100;
        if (Math.abs(yearly) > maxVariation) return `Variation de ${yearly > 0 ? "+" : ""}${fr(yearly)} % par an depuis la valeur publiée, au-delà du seuil de ${fr(maxVariation, 0)} %.`;
      }
    }
    return null;
  }
  if (peers && peers.length >= MIN_PEERS) {
    const m = median(peers);
    if (m > 0 && value > m * PEER_FACTOR) return `Valeur ${fr(value / m)} fois supérieure à la médiane des ${peers.length} références sœurs.`;
    if (m > 0 && value < m / PEER_FACTOR) return `Valeur ${fr(m / value)} fois inférieure à la médiane des ${peers.length} références sœurs.`;
  }
  return null;
}

export interface Analysis {
  classified: Classified[];
  unchangedKeys: string[];
  rejected: Array<{ record: SourceRecord; reason: string }>;
  ignored: number;
  absent: number;
  /** Lot anormalement réduit : rien n'est publié d'office. */
  suspicious: boolean;
}

export async function analyze(db: Database, source: SourceRow, records: SourceRecord[]): Promise<Analysis> {
  const existingRows: Existing[] = await db
    .select({
      id: p.id,
      externalKey: p.externalKey,
      unitPrice: p.unitPrice,
      unit: p.unit,
      priceDate: p.priceDate,
      period: p.period,
      priceMin: p.priceMin,
      priceMax: p.priceMax,
      sampleSize: p.sampleSize,
      series: p.series,
      archivedAt: p.archivedAt,
      importBatchId: p.importBatchId,
      designation: p.designation,
    })
    .from(p)
    .where(eq(p.sourceId, source.id));
  const existing = new Map(existingRows.map((e) => [e.externalKey!, e]));
  const revertedBatches = new Set(
    (
      await db
        .select({ id: b.id })
        .from(b)
        .where(and(eq(b.sourceId, source.id), eq(b.status, "annule")))
    ).map((x) => x.id),
  );

  const peers = new Map<string, number[]>();
  for (const rec of records) {
    const key = `${rec.groupKey}|${normalizeUnit(rec.unit)}`;
    peers.set(key, [...(peers.get(key) ?? []), Number(rec.unitPrice)]);
  }

  const maxVariation = Number(source.maxVariation);
  const classified: Classified[] = [];
  const unchangedKeys: string[] = [];
  const rejected: Analysis["rejected"] = [];
  let ignored = 0;
  const seen = new Set<string>();
  for (const rec of records) {
    if (seen.has(rec.externalKey)) {
      rejected.push({ record: rec, reason: "Référence en double dans la source." });
      continue;
    }
    seen.add(rec.externalKey);
    const value = Number(rec.unitPrice);
    if (!Number.isFinite(value) || value <= 0) {
      rejected.push({ record: rec, reason: "Prix nul, négatif ou illisible." });
      continue;
    }
    const current = existing.get(rec.externalKey) ?? null;
    const revive = Boolean(current?.archivedAt && current.importBatchId && revertedBatches.has(current.importBatchId));
    if (current?.archivedAt && !revive) {
      ignored++;
      continue;
    }
    if (current && !revive && unchanged(current, rec)) {
      unchangedKeys.push(rec.externalKey);
      continue;
    }
    const siblings = peers.get(`${rec.groupKey}|${normalizeUnit(rec.unit)}`);
    const own = siblings ? [...siblings] : undefined;
    // La valeur contrôlée est retirée de la liste des références sœurs.
    const at = own ? own.indexOf(value) : -1;
    if (own && at >= 0) own.splice(at, 1);
    const reason = anomaly(rec, revive ? null : current, own, maxVariation);
    classified.push({ record: rec, action: current && !revive ? "modifie" : "nouveau", decision: reason ? "quarantaine" : "a_publier", reason, existing: current, revive });
  }
  const active = existingRows.filter((e) => !e.archivedAt).length;
  const absent = existingRows.filter((e) => !e.archivedAt && !seen.has(e.externalKey!)).length;
  const suspicious = active > 0 && records.length < active * 0.5;
  if (suspicious) {
    for (const c of classified) {
      if (c.decision === "a_publier") {
        c.decision = "quarantaine";
        c.reason = `Lot réduit : ${records.length} références lues pour ${active} publiées, publication suspendue.`;
      }
    }
  }
  return { classified, unchangedKeys, rejected, ignored, absent, suspicious };
}

/* ---------- Écriture ---------- */

function itemValues(rec: SourceRecord, source: SourceRow, batchId: string, now: Date) {
  return {
    code: null,
    designation: rec.designation.slice(0, 500),
    description: rec.description,
    kind: rec.kind,
    unit: rec.unit.slice(0, 20),
    unitPrice: rec.unitPrice,
    currency: rec.currency,
    country: rec.country,
    region: rec.region,
    city: rec.city,
    tradeFamily: rec.tradeFamily,
    subFamily: rec.subFamily,
    origin: "donnees_publiques" as const,
    sourceRef: rec.sourceRef.slice(0, 300),
    priceDate: rec.priceDate,
    verificationStatus: "a_verifier" as const,
    attributes: rec.attributes,
    priceScope: rec.scope,
    taxBasis: rec.taxBasis,
    vatRate: rec.vatRate,
    valueStatus: rec.valueStatus,
    reliability: rec.reliability,
    sourceId: source.id,
    externalKey: rec.externalKey,
    groupKey: rec.groupKey,
    sourceUrl: rec.sourceUrl,
    license: source.license,
    period: rec.period,
    priceMin: rec.priceMin,
    priceMax: rec.priceMax,
    sampleSize: rec.sampleSize,
    aggregation: rec.aggregation,
    series: rec.series,
    verifiedAt: now,
    importBatchId: batchId,
  };
}

const excluded = (column: string) => sql.raw(`excluded."${column}"`);

/**
 * Écrit des références : insertion des nouvelles, mise à jour des valeurs des existantes (les réglages
 * de l'utilisateur, comme la validation d'un prix inchangé ou son fournisseur, sont conservés).
 * Chaque valeur écrite est historisée avec son lot.
 */
async function writeRecords(db: Database, source: SourceRow, batch: BatchRow, items: Classified[]): Promise<Map<string, string>> {
  const now = new Date();
  const itemIds = new Map<string, string>();
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    const written = await db
      .insert(p)
      .values(chunk.map((c) => itemValues(c.record, source, batch.id, now)))
      .onConflictDoUpdate({
        target: [p.sourceId, p.externalKey],
        set: {
          designation: excluded("designation"),
          description: excluded("description"),
          kind: excluded("kind"),
          unit: excluded("unit"),
          unitPrice: excluded("unit_price"),
          currency: excluded("currency"),
          country: excluded("country"),
          region: excluded("region"),
          city: excluded("city"),
          tradeFamily: excluded("trade_family"),
          subFamily: excluded("sub_family"),
          sourceRef: excluded("source_ref"),
          priceDate: excluded("price_date"),
          attributes: excluded("attributes"),
          priceScope: excluded("price_scope"),
          taxBasis: excluded("tax_basis"),
          vatRate: excluded("vat_rate"),
          valueStatus: excluded("value_status"),
          reliability: excluded("reliability"),
          groupKey: excluded("group_key"),
          sourceUrl: excluded("source_url"),
          license: excluded("license"),
          period: excluded("period"),
          priceMin: excluded("price_min"),
          priceMax: excluded("price_max"),
          sampleSize: excluded("sample_size"),
          aggregation: excluded("aggregation"),
          series: excluded("series"),
          verifiedAt: excluded("verified_at"),
          // Une nouvelle valeur doit être revue ; une valeur inchangée garde sa validation.
          verificationStatus: sql`case when ${p.unitPrice} <> excluded."unit_price" or ${p.unit} <> excluded."unit" then 'a_verifier'::validation_status else ${p.verificationStatus} end`,
          updatedAt: now,
        },
      })
      .returning({ id: p.id, externalKey: p.externalKey, unitPrice: p.unitPrice, currency: p.currency, priceDate: p.priceDate });
    const ids = new Map(written.map((w) => [w.externalKey!, w]));
    for (const w of written) itemIds.set(w.externalKey!, w.id);
    const revived = chunk.filter((c) => c.revive).map((c) => ids.get(c.record.externalKey)!.id);
    if (revived.length) await db.update(p).set({ archivedAt: null, importBatchId: batch.id }).where(inArray(p.id, revived));
    await db.insert(schema.priceHistory).values(
      chunk.map((c) => {
        const w = ids.get(c.record.externalKey)!;
        return {
          priceItemId: w.id,
          unitPrice: w.unitPrice,
          currency: w.currency,
          priceDate: w.priceDate,
          origin: "donnees_publiques" as const,
          batchId: batch.id,
          note: `${c.action === "nouveau" ? (c.revive ? "Restauration" : "Création") : "Nouvelle valeur"}, ${batch.label}`.slice(0, 300),
        };
      }),
    );
  }
  return itemIds;
}

function previousOf(e: Existing): PreviousValue {
  return {
    unitPrice: e.unitPrice,
    unit: e.unit,
    priceDate: e.priceDate,
    period: e.period,
    priceMin: e.priceMin,
    priceMax: e.priceMax,
    sampleSize: e.sampleSize,
    series: e.series,
    archivedAt: e.archivedAt ? new Date(e.archivedAt).toISOString() : null,
  };
}

async function insertRows(db: Database, rows: Array<typeof r.$inferInsert>): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) await db.insert(r).values(rows.slice(i, i + CHUNK));
}

async function touchVerified(db: Database, source: SourceRow, keys: string[]): Promise<void> {
  const now = new Date();
  for (let i = 0; i < keys.length; i += 1000) {
    await db
      .update(p)
      .set({ verifiedAt: now })
      .where(and(eq(p.sourceId, source.id), inArray(p.externalKey, keys.slice(i, i + 1000))));
  }
}

/* ---------- Lots ---------- */

/**
 * Un nouveau lot remplace les décisions encore en suspens des lots précédents de la même source :
 * une valeur ancienne ne peut plus être publiée par-dessus une lecture plus récente.
 */
async function supersedePending(db: Database, source: SourceRow, batch: BatchRow): Promise<void> {
  const older = await db
    .select({ id: b.id })
    .from(b)
    .where(and(eq(b.sourceId, source.id), ne(b.id, batch.id), inArray(b.status, ["a_publier", "quarantaine"])));
  if (older.length === 0) return;
  const ids = older.map((o) => o.id);
  await db
    .update(r)
    .set({ decision: "annule", decidedAt: new Date(), reason: sql`coalesce(${r.reason} || ' ', '') || ${`Remplacée par ${batch.label}.`}` })
    .where(and(inArray(r.batchId, ids), inArray(r.decision, ["a_publier", "quarantaine"])));
  for (const id of ids) await refreshBatchStatus(db, id);
}

export interface StageParams {
  source: SourceRow;
  records: SourceRecord[];
  label: string;
  trigger: "instantane" | "actualisation" | "planifie";
  resources: SourceResource[];
  jobId?: string | null;
}

/**
 * Analyse un jeu de références et crée le lot : publication immédiate des valeurs saines si la source
 * le permet, quarantaine des valeurs douteuses, rien d'écrit pour les valeurs inchangées (seule leur
 * date de vérification avance).
 */
export async function stageBatch(db: Database, params: StageParams): Promise<BatchRow> {
  const { source, records } = params;
  // Une reprise du même traitement réutilise son lot.
  const [resumed] = params.jobId ? await db.select().from(b).where(and(eq(b.jobId, params.jobId), eq(b.status, "en_cours"))) : [];
  const batch =
    resumed ??
    (
      await db
        .insert(b)
        .values({ sourceId: source.id, label: params.label, trigger: params.trigger, status: "en_cours", resources: params.resources, jobId: params.jobId ?? null })
        .returning()
    )[0]!;
  if (records.length === 0) {
    const [failed] = await db
      .update(b)
      .set({ status: "echoue", message: "La source n’a renvoyé aucune référence lisible : rien n’a été modifié." })
      .where(eq(b.id, batch.id))
      .returning();
    return failed!;
  }
  await supersedePending(db, source, batch);
  const analysis = await analyze(db, source, records);
  const publishable = analysis.classified.filter((c) => c.decision === "a_publier");
  const quarantined = analysis.classified.filter((c) => c.decision === "quarantaine");
  const publishNow = source.autoPublish && !analysis.suspicious;

  const written = publishNow && publishable.length ? await writeRecords(db, source, batch, publishable) : new Map<string, string>();
  await touchVerified(db, source, analysis.unchangedKeys);

  const rows: Array<typeof r.$inferInsert> = [];
  const now = new Date();
  for (const c of analysis.classified) {
    const published = publishNow && c.decision === "a_publier";
    // Une nouvelle référence publiée d'office n'a pas besoin de ligne : elle porte son lot.
    if (published && c.action === "nouveau" && !c.revive) continue;
    rows.push({
      batchId: batch.id,
      externalKey: c.record.externalKey,
      action: c.action,
      decision: published ? "publie" : c.decision,
      reason: c.reason,
      payload: c.record,
      previous: c.existing ? previousOf(c.existing) : null,
      priceItemId: c.existing?.id ?? written.get(c.record.externalKey) ?? null,
      decidedAt: published ? now : null,
    });
  }
  for (const x of analysis.rejected) rows.push({ batchId: batch.id, externalKey: x.record.externalKey, action: "nouveau", decision: "rejete", reason: x.reason, payload: x.record, decidedAt: now });
  await insertRows(db, rows);

  const stats: BatchStats = {
    lues: records.length,
    nouvelles: analysis.classified.filter((c) => c.action === "nouveau").length,
    modifiees: analysis.classified.filter((c) => c.action === "modifie").length,
    inchangees: analysis.unchangedKeys.length,
    quarantaine: quarantined.length,
    rejetees: analysis.rejected.length,
    absentes: analysis.absent,
    publiees: publishNow ? publishable.length : 0,
  };
  const status =
    publishable.length === 0 && quarantined.length === 0
      ? "sans_changement"
      : !publishNow && publishable.length > 0
        ? "a_publier"
        : quarantined.length > 0
          ? "quarantaine"
          : "publie";
  const messages = [
    analysis.suspicious ? "Lot nettement plus réduit que les références publiées : rien n’a été publié d’office." : null,
    analysis.absent ? `${analysis.absent} références publiées n’apparaissent plus dans la source : elles sont conservées.` : null,
    analysis.ignored ? `${analysis.ignored} références archivées par vos soins n’ont pas été modifiées.` : null,
  ].filter(Boolean);
  const [done] = await db
    .update(b)
    .set({ status, stats, message: messages.join(" ") || null, publishedAt: stats.publiees ? now : null })
    .where(eq(b.id, batch.id))
    .returning();
  await db
    .update(schema.priceSource)
    .set({ lastCheckedAt: now, ...(status !== "sans_changement" ? { lastChangedAt: now } : {}), resources: params.resources })
    .where(eq(schema.priceSource.id, source.id));
  return done!;
}

async function refreshBatchStatus(db: Database, batchId: string): Promise<BatchRow> {
  const counts = await db.select({ decision: r.decision, n: sql<number>`count(*)::int` }).from(r).where(eq(r.batchId, batchId)).groupBy(r.decision);
  const n = (d: PriceRowDecision) => counts.find((c) => c.decision === d)?.n ?? 0;
  const [current] = await db.select().from(b).where(eq(b.id, batchId));
  const published = current!.stats.publiees ?? 0;
  const status = n("a_publier") > 0 ? "a_publier" : n("quarantaine") > 0 ? "quarantaine" : published > 0 ? "publie" : "sans_changement";
  const stats: BatchStats = { ...current!.stats, quarantaine: n("quarantaine"), rejetees: n("rejete") };
  const [row] = await db.update(b).set({ status, stats }).where(eq(b.id, batchId)).returning();
  return row!;
}

/** Publie les valeurs en attente d'un lot (toutes, ou les lignes de quarantaine choisies). */
export async function publishRows(db: Database, batchId: string, rowIds?: string[]): Promise<BatchRow> {
  const [batch] = await db.select().from(b).where(eq(b.id, batchId));
  if (!batch) throw new SourceImportError("Lot introuvable.");
  if (batch.status === "annule" || batch.status === "echoue") throw new SourceImportError("Ce lot ne peut plus être publié.");
  if (!batch.sourceId) throw new SourceImportError("Ce lot ne provient pas d’une source publique.");
  const [source] = await db.select().from(schema.priceSource).where(eq(schema.priceSource.id, batch.sourceId));
  const pending = await db
    .select()
    .from(r)
    .where(and(eq(r.batchId, batchId), rowIds ? and(inArray(r.id, rowIds), inArray(r.decision, ["a_publier", "quarantaine"])) : eq(r.decision, "a_publier")));
  if (pending.length === 0) return refreshBatchStatus(db, batchId);
  const items: Classified[] = pending.map((row) => ({
    record: row.payload,
    action: row.action === "modifie" ? "modifie" : "nouveau",
    decision: "a_publier",
    reason: row.reason,
    existing: null,
    revive: Boolean(row.previous?.archivedAt),
  }));
  await writeRecords(db, source!, batch, items);
  const now = new Date();
  for (let i = 0; i < pending.length; i += 1000) {
    const slice = pending.slice(i, i + 1000);
    await db
      .update(r)
      .set({ decision: "publie", decidedAt: now })
      .where(inArray(r.id, slice.map((x) => x.id)));
  }
  // Lien entre chaque ligne publiée et sa référence, pour l'annulation.
  await db.execute(sql`
    update price_import_row set price_item_id = price_item.id
    from price_item
    where price_import_row.batch_id = ${batchId} and price_import_row.price_item_id is null
      and price_item.source_id = ${batch.sourceId} and price_item.external_key = price_import_row.external_key
  `);
  await db
    .update(b)
    .set({ publishedAt: now, stats: sql`jsonb_set(${b.stats}, '{publiees}', to_jsonb(coalesce((${b.stats}->>'publiees')::int, 0) + ${pending.length}))` })
    .where(eq(b.id, batchId));
  return refreshBatchStatus(db, batchId);
}

/** Écarte des lignes en attente ou en quarantaine : la valeur publiée reste celle d'avant. */
export async function rejectRows(db: Database, batchId: string, rowIds: string[]): Promise<BatchRow> {
  if (rowIds.length) {
    await db
      .update(r)
      .set({ decision: "rejete", decidedAt: new Date() })
      .where(and(eq(r.batchId, batchId), inArray(r.id, rowIds), inArray(r.decision, ["a_publier", "quarantaine"])));
  }
  return refreshBatchStatus(db, batchId);
}

/**
 * Annule un lot publié : les références qu'il a créées sont archivées, les valeurs qu'il a remplacées
 * sont rétablies, chaque retour est historisé. Seul le dernier lot publié d'une source s'annule, pour
 * ne jamais rétablir une valeur par-dessus un lot plus récent.
 */
export async function revertBatch(db: Database, batchId: string): Promise<BatchRow> {
  const [batch] = await db.select().from(b).where(eq(b.id, batchId));
  if (!batch) throw new SourceImportError("Lot introuvable.");
  if (batch.status === "annule") throw new SourceImportError("Ce lot est déjà annulé.");
  if (batch.status === "en_cours") throw new SourceImportError("Ce lot est encore en cours d’analyse.");
  if (batch.sourceId) {
    const [later] = await db
      .select({ id: b.id })
      .from(b)
      .where(and(eq(b.sourceId, batch.sourceId), gt(b.createdAt, batch.createdAt), inArray(b.status, ["publie", "quarantaine", "a_publier"])))
      .limit(1);
    if (later) throw new SourceImportError("Un lot plus récent de cette source est publié : annulez-le d’abord.");
  }
  const now = new Date();
  const note = `Annulation, ${batch.label}`.slice(0, 300);
  // Valeurs remplacées : rétablies à l'identique.
  const modified = await db
    .select()
    .from(r)
    .where(and(eq(r.batchId, batchId), eq(r.decision, "publie"), ne(r.action, "nouveau")));
  for (const row of modified) {
    if (!row.priceItemId || !row.previous) continue;
    const prev = row.previous;
    const [item] = await db
      .update(p)
      .set({
        unitPrice: prev.unitPrice,
        unit: prev.unit,
        priceDate: prev.priceDate,
        period: prev.period,
        priceMin: prev.priceMin,
        priceMax: prev.priceMax,
        sampleSize: prev.sampleSize,
        series: prev.series,
        verificationStatus: "a_verifier",
      })
      .where(eq(p.id, row.priceItemId))
      .returning();
    if (item) await db.insert(schema.priceHistory).values({ priceItemId: item.id, unitPrice: item.unitPrice, currency: item.currency, priceDate: item.priceDate, origin: item.origin, batchId, note });
  }
  // Références créées ou restaurées par le lot : archivées, jamais supprimées.
  const created = await db
    .update(p)
    .set({ archivedAt: now })
    .where(and(eq(p.importBatchId, batchId), isNull(p.archivedAt)))
    .returning({ id: p.id, unitPrice: p.unitPrice, currency: p.currency, priceDate: p.priceDate, origin: p.origin });
  for (let i = 0; i < created.length; i += 1000) {
    const slice = created.slice(i, i + 1000);
    if (slice.length) await db.insert(schema.priceHistory).values(slice.map((x) => ({ priceItemId: x.id, unitPrice: x.unitPrice, currency: x.currency, priceDate: x.priceDate, origin: x.origin, batchId, note })));
  }
  await db
    .update(r)
    .set({ decision: "annule", decidedAt: now })
    .where(and(eq(r.batchId, batchId), inArray(r.decision, ["publie", "a_publier", "quarantaine"])));
  const [row] = await db.update(b).set({ status: "annule", revertedAt: now }).where(eq(b.id, batchId)).returning();
  return row!;
}

/** Derniers lots d'une source (ou de toutes), du plus récent au plus ancien. */
export async function recentBatches(db: Database, sourceId?: string, limit = 20): Promise<BatchRow[]> {
  return db
    .select()
    .from(b)
    .where(sourceId ? eq(b.sourceId, sourceId) : undefined)
    .orderBy(desc(b.createdAt))
    .limit(limit);
}
