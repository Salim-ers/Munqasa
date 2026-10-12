/**
 * Devis : liste, création (vierge, affaire, DPGF, métré, bibliothèque, préparation par l'IA), en-tête, lignes,
 * prix ajoutés depuis la bibliothèque, statuts et versions, duplication, archivage, exports PDF, Excel et Word.
 * Les montants sont toujours recalculés par le serveur (services/quote-calc.ts), jamais saisis.
 */
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { QUOTE_STATUSES, type QuoteStatus } from "../../../shared/enums.js";
import { listQuery, quoteActionInput, quoteAiInput, quoteCreateInput, quoteLibraryLinesInput, quoteLineInput, quoteUpdateInput } from "../../../shared/schemas.js";
import type { AdminEnv } from "../../auth/guard.js";
import { getDb, schema } from "../../db/index.js";
import { type ExportFormat, UnsupportedFormat } from "../../documents/registry.js";
import { renderQuote, renderQuoteVersion } from "../../documents/builders/quote.js";
import { layoutSummary } from "../../documents/render-checked.js";
import { createJob } from "../../jobs/runner.js";
import { auditAction } from "../../services/audit.js";
import { quoteExportAudit } from "../../services/export-audit.js";
import { QuoteCalcError } from "../../services/quote-calc.js";
import {
  assertEditable,
  createQuote,
  duplicateQuote,
  expireQuotes,
  lineFromPrice,
  loadQuote,
  type QuoteAction,
  QuoteError,
  quoteChecks,
  recomputeQuote,
  transitionQuote,
} from "../../services/quotes.js";
import { download, themeOf } from "./exports.js";
import { body, conflict, notFound, parse, patchBody, uuidParam, ValidationError } from "../validate.js";

const q = schema.quote;
const ql = schema.quoteLine;

/** Erreurs métier des devis en réponses explicites. */
async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof QuoteError) {
      if (error.status === 404) notFound(error.message);
      if (error.status === 400) throw new ValidationError({ devis: error.message });
      conflict(error.message);
    }
    if (error instanceof QuoteCalcError) throw new ValidationError({ coefficients: error.message });
    if (error instanceof UnsupportedFormat) throw new ValidationError({ format: error.message });
    throw error;
  }
}

/** Devis complet : en-tête, lignes, totaux recalculés, contrôles, historique, versions et références liées. */
async function detail(id: string) {
  const db = await getDb();
  const totals = await recomputeQuote(db, id);
  const { quote, lines } = await loadQuote(db, id);
  const [company] = quote.companyProfileId ? await db.select().from(schema.companyProfile).where(eq(schema.companyProfile.id, quote.companyProfileId)) : [];
  const [client] = quote.clientId ? await db.select().from(schema.client).where(eq(schema.client.id, quote.clientId)) : [];
  const [project] = quote.projectId ? await db.select({ id: schema.project.id, reference: schema.project.reference, name: schema.project.name, country: schema.project.country }).from(schema.project).where(eq(schema.project.id, quote.projectId)) : [];
  const lots = quote.projectId ? await db.select().from(schema.projectLot).where(eq(schema.projectLot.projectId, quote.projectId)).orderBy(asc(schema.projectLot.position), asc(schema.projectLot.code)) : [];
  const events = await db.select().from(schema.quoteEvent).where(eq(schema.quoteEvent.quoteId, id)).orderBy(desc(schema.quoteEvent.occurredAt));
  const versions = await db
    .select({ id: schema.quoteVersion.id, version: schema.quoteVersion.version, status: schema.quoteVersion.status, label: schema.quoteVersion.label, createdAt: schema.quoteVersion.createdAt })
    .from(schema.quoteVersion)
    .where(eq(schema.quoteVersion.quoteId, id))
    .orderBy(desc(schema.quoteVersion.version));
  const [job] = quote.generationJobId ? await db.select({ id: schema.generationJob.id, status: schema.generationJob.status }).from(schema.generationJob).where(eq(schema.generationJob.id, quote.generationJobId)) : [];
  return { quote, lines, totals, checks: quoteChecks(quote, lines, totals, company?.country ?? null), company: company ?? null, client: client ?? null, project: project ?? null, lots, events, versions, job: job ?? null };
}

async function lineOr404(id: string) {
  const db = await getDb();
  const [line] = await db.select().from(ql).where(eq(ql.id, id));
  if (!line) notFound("Ligne de devis introuvable.");
  return line;
}

/** Une modification d'un devis prêt à envoyer le renvoie à vérifier. */
async function touched(quoteId: string, status: QuoteStatus) {
  const db = await getDb();
  if (status === "valide") await db.update(q).set({ status: "a_verifier" }).where(eq(q.id, quoteId));
}

async function nextPosition(quoteId: string): Promise<number> {
  const db = await getDb();
  const [{ max } = { max: -1 }] = await db.select({ max: sql<number>`coalesce(max(${ql.position}), -1)::int` }).from(ql).where(eq(ql.quoteId, quoteId));
  return Number(max) + 1;
}

const EXPORT_FORMATS = ["pdf", "xlsx", "docx"] as const;

export const quoteRoutes = new Hono<AdminEnv>()
  .get("/", async (c) => {
    const db = await getDb();
    await expireQuotes(db);
    const params = parse(listQuery, c.req.query());
    const status = c.req.query("statut");
    const archived = c.req.query("archives") === "1";
    const where: SQL[] = [archived ? isNotNull(q.archivedAt) : isNull(q.archivedAt)];
    if (status && (QUOTE_STATUSES as readonly string[]).includes(status)) where.push(eq(q.status, status as QuoteStatus));
    if (params.q) {
      const like = `%${params.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
      where.push(or(ilike(q.number, like), ilike(q.title, like), ilike(schema.client.name, like), ilike(schema.project.reference, like))!);
    }
    const filter = and(...where);
    const [items, [total]] = await Promise.all([
      db
        .select({
          id: q.id,
          number: q.number,
          title: q.title,
          status: q.status,
          currency: q.currency,
          totalHt: q.totalHt,
          totalTtc: q.totalTtc,
          totalsState: q.totalsState,
          issueDate: q.issueDate,
          validityDays: q.validityDays,
          currentVersion: q.currentVersion,
          source: q.source,
          archivedAt: q.archivedAt,
          updatedAt: q.updatedAt,
          clientName: schema.client.name,
          projectReference: schema.project.reference,
          projectId: q.projectId,
        })
        .from(q)
        .leftJoin(schema.client, eq(schema.client.id, q.clientId))
        .leftJoin(schema.project, eq(schema.project.id, q.projectId))
        .where(filter)
        .orderBy(desc(q.updatedAt))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db.select({ n: count() }).from(q).leftJoin(schema.client, eq(schema.client.id, q.clientId)).leftJoin(schema.project, eq(schema.project.id, q.projectId)).where(filter),
    ]);
    return c.json({ items, total: Number(total?.n ?? 0), page: params.page, pageSize: params.pageSize });
  })
  .post("/", async (c) => {
    const db = await getDb();
    const data = await body(c, quoteCreateInput);
    if (data.mode === "ia") throw new ValidationError({ mode: "La préparation par l’IA se lance avec « Générer mon devis avec l’IA »." });
    const quote = await guarded(() => createQuote(db, data));
    await auditAction(c, "devis.creation", "quote", quote.id, { reference: quote.number, titre: quote.title });
    return c.json({ quote }, 201);
  })
  .post("/ia", async (c) => {
    const db = await getDb();
    const data = await body(c, quoteAiInput);
    if (!data.description && !data.projectId) throw new ValidationError({ description: "Décrivez les travaux ou choisissez une affaire." });
    const quote = await guarded(() => createQuote(db, { mode: "ia", projectId: data.projectId, clientId: data.clientId, lotIds: data.lotIds, companyProfileId: data.companyProfileId, title: null }));
    const job = await createJob({
      kind: "generation_devis",
      projectId: quote.projectId,
      input: { quoteId: quote.id, description: data.description, lotIds: data.lotIds, useCctp: data.useCctp, useDpgf: data.useDpgf, useMetre: data.useMetre },
    });
    await db.update(q).set({ generationJobId: job.id }).where(eq(q.id, quote.id));
    await auditAction(c, "devis.generation_ia", "quote", quote.id, { reference: quote.number });
    return c.json({ quote: { ...quote, generationJobId: job.id }, jobId: job.id }, 202);
  })
  .get("/:id", async (c) => c.json(await guarded(() => detail(uuidParam(c)))))
  .patch("/:id", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const { quote } = await guarded(() => loadQuote(db, id));
    guardedSync(() => assertEditable(quote));
    const data = await patchBody(c, quoteUpdateInput);
    if (data.clientId) {
      const [exists] = await db.select({ id: schema.client.id }).from(schema.client).where(eq(schema.client.id, data.clientId));
      if (!exists) throw new ValidationError({ clientId: "Client introuvable." });
    }
    await db.update(q).set(data).where(eq(q.id, id));
    await touched(id, quote.status);
    await guarded(() => recomputeQuote(db, id));
    await db.insert(schema.quoteEvent).values({ quoteId: id, kind: "modification", note: `En-tête : ${Object.keys(data).length} champ(s)` });
    await auditAction(c, "devis.modification", "quote", id, { reference: quote.number, champs: Object.keys(data) });
    return c.json(await guarded(() => detail(id)));
  })
  .post("/:id/lines", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const { quote } = await guarded(() => loadQuote(db, id));
    guardedSync(() => assertEditable(quote));
    const data = await body(c, quoteLineInput);
    if (data.parentId) {
      const parent = await lineOr404(data.parentId);
      if (parent.quoteId !== id || parent.kind !== "section") throw new ValidationError({ parentId: "Section introuvable dans ce devis." });
    }
    const [line] = await db
      .insert(ql)
      .values({ ...data, priceConfirmed: data.priceConfirmed ?? false, quoteId: id, position: await nextPosition(id), priceOrigin: data.unitPrice !== null || data.pricingMode === "decompose" ? "Saisie" : null })
      .returning();
    await touched(id, quote.status);
    await guarded(() => recomputeQuote(db, id));
    await db.insert(schema.quoteEvent).values({ quoteId: id, kind: "modification", note: `Ligne ajoutée : ${line!.designation.slice(0, 120)}` });
    return c.json(await guarded(() => detail(id)), 201);
  })
  .post("/:id/lines/library", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const { quote } = await guarded(() => loadQuote(db, id));
    guardedSync(() => assertEditable(quote));
    const data = await body(c, quoteLibraryLinesInput);
    const prices = await db
      .select({ price: schema.priceItem, sourceName: schema.priceSource.name })
      .from(schema.priceItem)
      .leftJoin(schema.priceSource, eq(schema.priceSource.id, schema.priceItem.sourceId))
      .where(inArray(schema.priceItem.id, data.priceItemIds));
    let position = await nextPosition(id);
    for (const priceId of data.priceItemIds) {
      const found = prices.find((p) => p.price.id === priceId);
      if (!found) throw new ValidationError({ priceItemIds: "Un des prix choisis est introuvable." });
      const values = await guarded(() => lineFromPrice(found.price, found.sourceName, quote.currency));
      await db.insert(ql).values({ ...values, quoteId: id, kind: "ligne", parentId: data.parentId, position: position++, quantitySource: "À préciser" });
    }
    await touched(id, quote.status);
    await guarded(() => recomputeQuote(db, id));
    await db.insert(schema.quoteEvent).values({ quoteId: id, kind: "modification", note: `${data.priceItemIds.length} prix ajouté(s) depuis la bibliothèque` });
    await auditAction(c, "devis.prix_bibliotheque", "quote", id, { reference: quote.number, lignes: data.priceItemIds.length });
    return c.json(await guarded(() => detail(id)), 201);
  })
  .post("/:id/dupliquer", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const copy = await guarded(() => duplicateQuote(db, id));
    await auditAction(c, "devis.duplication", "quote", copy.id, { reference: copy.number });
    return c.json({ quote: copy }, 201);
  })
  /** Contrôle avant export : contrôles du devis, totaux et quantités vérifiés, trois formats rendus et relus. */
  .post("/:id/controle", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const audit = await guarded(() => quoteExportAudit(db, id, { render: true, theme: themeOf(c) }));
    await auditAction(c, "devis.controle", "quote", id, { verdict: audit.verdict, bloquants: audit.counts.bloquante });
    return c.json({ audit });
  })
  .post("/:id/:action{soumettre|valider|rouvrir|envoyer|relancer|accepter|refuser|nouvelle-version|archiver|restaurer}", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const action = c.req.param("action") as QuoteAction;
    const { note } = await body(c, quoteActionInput).catch(() => ({ note: null }));
    const quote = await guarded(() => transitionQuote(db, id, action, note ?? null));
    await auditAction(c, `devis.${action.replace("-", "_")}`, "quote", id, { reference: quote.number, statut: quote.status });
    return c.json(await guarded(() => detail(id)));
  })
  .get("/:id/export/:format{pdf|xlsx|docx}", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const format = c.req.param("format") as ExportFormat;
    if (!(EXPORT_FORMATS as readonly string[]).includes(format)) throw new ValidationError({ format: "Format indisponible." });
    const result = await guarded(() => renderQuote(db, id, format, themeOf(c)));
    await db.insert(schema.quoteEvent).values({ quoteId: id, kind: "export", note: `${format.toUpperCase()}, ${layoutSummary(result.layout)}` });
    await auditAction(c, "devis.export", "quote", id, { document: result.title, format, miseEnPage: layoutSummary(result.layout) });
    return download(result);
  })
  .get("/:id/versions/:versionId/export/:format{pdf|xlsx|docx}", async (c) => {
    const id = uuidParam(c);
    const versionId = uuidParam(c, "versionId");
    const db = await getDb();
    const result = await guarded(() => renderQuoteVersion(db, id, versionId, c.req.param("format") as ExportFormat, themeOf(c)));
    await auditAction(c, "devis.export", "quote", id, { document: result.title, format: c.req.param("format"), miseEnPage: layoutSummary(result.layout) });
    return download(result);
  });

function guardedSync(work: () => void): void {
  try {
    work();
  } catch (error) {
    if (error instanceof QuoteError) conflict(error.message);
    throw error;
  }
}

export const quoteLineRoutes = new Hono<AdminEnv>()
  .patch("/:id", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const line = await lineOr404(id);
    const { quote } = await guarded(() => loadQuote(db, line.quoteId));
    guardedSync(() => assertEditable(quote));
    const data = await patchBody(c, quoteLineInput.omit({ kind: true, parentId: true }));
    // Prix modifié à la main : la provenance devient une saisie, la copie de la bibliothèque est conservée pour mémoire.
    const priceChanged = ("unitPrice" in data && data.unitPrice !== line.unitPrice) || ("pricingMode" in data && data.pricingMode !== line.pricingMode);
    // Quantité modifiée à la main : elle ne se dit plus reprise de la DPGF ou du métré (le lien reste pour mémoire).
    const quantityChanged = "quantity" in data && (data.quantity === null ? line.quantity !== null : line.quantity === null || Number(data.quantity) !== Number(line.quantity));
    await db
      .update(ql)
      .set({
        ...data,
        ...(priceChanged ? { priceOrigin: data.unitPrice === null && data.pricingMode !== "decompose" ? null : "Saisie", priceItemId: null, priceConfirmed: true } : {}),
        ...(quantityChanged ? { quantitySource: data.quantity === null ? "À préciser" : "Saisie" } : {}),
      })
      .where(eq(ql.id, id));
    await touched(quote.id, quote.status);
    await guarded(() => recomputeQuote(db, quote.id));
    await db.insert(schema.quoteEvent).values({ quoteId: quote.id, kind: "modification", note: `Ligne modifiée : ${line.designation.slice(0, 120)}` });
    return c.json(await guarded(() => detail(quote.id)));
  })
  .delete("/:id", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const line = await lineOr404(id);
    const { quote } = await guarded(() => loadQuote(db, line.quoteId));
    guardedSync(() => assertEditable(quote));
    await db.delete(ql).where(eq(ql.id, id));
    await touched(quote.id, quote.status);
    await guarded(() => recomputeQuote(db, quote.id));
    await db.insert(schema.quoteEvent).values({ quoteId: quote.id, kind: "modification", note: `Ligne supprimée : ${line.designation.slice(0, 120)}` });
    return c.json(await guarded(() => detail(quote.id)));
  })
  .post("/:id/deplacer", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const line = await lineOr404(id);
    const { quote, lines } = await guarded(() => loadQuote(db, line.quoteId));
    guardedSync(() => assertEditable(quote));
    const direction = ((await c.req.json().catch(() => ({}))) as { direction?: string }).direction === "haut" ? -1 : 1;
    const siblings = lines.filter((l) => l.parentId === line.parentId);
    const index = siblings.findIndex((l) => l.id === id);
    const other = siblings[index + direction];
    if (other) {
      await db.update(ql).set({ position: other.position }).where(eq(ql.id, line.id));
      await db.update(ql).set({ position: line.position }).where(eq(ql.id, other.id));
    }
    return c.json(await guarded(() => detail(quote.id)));
  });
