/**
 * Tableau de bord : uniquement des agrégats calculés sur les données réelles.
 * Aucune valeur par défaut fictive : sans données, les compteurs valent 0 et les séries sont vides.
 */
import { and, count, desc, eq, gte, inArray, isNull, lt, lte, ne, sql, sum } from "drizzle-orm";
import { Hono } from "hono";
import type { AdminEnv } from "../../auth/guard.js";
import { getDb, schema } from "../../db/index.js";

const OPEN_STATUSES = ["brouillon", "analyse", "etude_technique", "chiffrage", "controle_qualite", "pret_a_remettre"] as const;
const PREPARATION_STATUSES = ["etude_technique", "chiffrage", "controle_qualite"] as const;
const ACTIVE_TENDER_STATUSES = ["analyse", "etude_technique", "chiffrage", "controle_qualite", "pret_a_remettre"] as const;
const PENDING_QUOTE_STATUSES = ["a_verifier", "valide", "envoye"] as const;
/** Un prix est signalé comme ancien au-delà de 12 mois. */
const STALE_PRICE_MONTHS = 12;

export const dashboardRoutes = new Hono<AdminEnv>().get("/", async (c) => {
  const db = await getDb();
  const p = schema.project;
  const now = new Date();
  const in14days = new Date(now.getTime() + 14 * 24 * 3600 * 1000);
  const days30ago = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const staleDate = new Date(now);
  staleDate.setMonth(staleDate.getMonth() - STALE_PRICE_MONTHS);

  const [
    byStatus,
    byCountry,
    estimates,
    cctpGenerating,
    dpgfToValidate,
    quotesPending,
    upcomingProjects,
    upcomingDeadlines,
    blockingIssues,
    staleprices,
    unverifiedPrices,
    jobsRunning,
    usage,
    recentProjects,
    byTrade,
    quotesByMonth,
  ] = await Promise.all([
    db.select({ status: p.status, n: count() }).from(p).groupBy(p.status),
    db.select({ country: p.country, n: count() }).from(p).where(ne(p.status, "archive")).groupBy(p.country),
    db
      .select({ currency: p.currency, total: sum(p.manualEstimate), n: count() })
      .from(p)
      .where(and(inArray(p.status, [...OPEN_STATUSES]), sql`${p.manualEstimate} is not null`))
      .groupBy(p.currency),
    db.select({ n: count() }).from(schema.cctpDocument).where(eq(schema.cctpDocument.status, "en_generation")),
    db.select({ n: count() }).from(schema.dpgf).where(eq(schema.dpgf.status, "a_valider")),
    db
      .select({ currency: schema.quote.currency, n: count() })
      .from(schema.quote)
      .where(inArray(schema.quote.status, [...PENDING_QUOTE_STATUSES]))
      .groupBy(schema.quote.currency),
    db
      .select({ id: p.id, reference: p.reference, name: p.name, dueAt: p.submissionDeadline })
      .from(p)
      .where(and(inArray(p.status, [...OPEN_STATUSES]), gte(p.submissionDeadline, now), lte(p.submissionDeadline, in14days)))
      .orderBy(p.submissionDeadline)
      .limit(6),
    db
      .select({ id: schema.deadline.id, title: schema.deadline.title, dueAt: schema.deadline.dueAt, projectId: schema.deadline.projectId })
      .from(schema.deadline)
      .where(and(isNull(schema.deadline.doneAt), gte(schema.deadline.dueAt, now), lte(schema.deadline.dueAt, in14days)))
      .orderBy(schema.deadline.dueAt)
      .limit(6),
    db
      .select({ projectId: schema.qualityIssue.projectId, n: count() })
      .from(schema.qualityIssue)
      .where(and(eq(schema.qualityIssue.status, "ouverte"), eq(schema.qualityIssue.severity, "bloquante")))
      .groupBy(schema.qualityIssue.projectId),
    db
      .select({ n: count() })
      .from(schema.priceItem)
      .where(and(isNull(schema.priceItem.archivedAt), lt(schema.priceItem.priceDate, staleDate.toISOString().slice(0, 10)))),
    db
      .select({ n: count() })
      .from(schema.priceItem)
      .where(and(isNull(schema.priceItem.archivedAt), eq(schema.priceItem.verificationStatus, "a_verifier"))),
    db
      .select({ n: count() })
      .from(schema.generationJob)
      .where(inArray(schema.generationJob.status, ["en_attente", "en_cours"])),
    db
      .select({
        inputTokens: sum(schema.aiUsageRecord.inputTokens),
        outputTokens: sum(schema.aiUsageRecord.outputTokens),
        costUsd: sum(schema.aiUsageRecord.costUsd),
        calls: count(),
      })
      .from(schema.aiUsageRecord)
      .where(gte(schema.aiUsageRecord.createdAt, days30ago)),
    db
      .select({
        id: p.id,
        reference: p.reference,
        name: p.name,
        status: p.status,
        country: p.country,
        currency: p.currency,
        submissionDeadline: p.submissionDeadline,
        updatedAt: p.updatedAt,
        clientName: schema.client.name,
      })
      .from(p)
      .leftJoin(schema.client, eq(schema.client.id, p.clientId))
      .where(ne(p.status, "archive"))
      .orderBy(desc(sql`coalesce(${p.lastOpenedAt}, ${p.updatedAt})`))
      .limit(8),
    db
      .select({ trade: schema.projectLot.tradeFamily, n: count() })
      .from(schema.projectLot)
      .innerJoin(p, eq(p.id, schema.projectLot.projectId))
      .where(ne(p.status, "archive"))
      .groupBy(schema.projectLot.tradeFamily),
    db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${schema.quote.createdAt}), 'YYYY-MM')`,
        currency: schema.quote.currency,
        n: count(),
      })
      .from(schema.quote)
      .where(gte(schema.quote.createdAt, new Date(now.getFullYear() - 1, now.getMonth(), 1)))
      .groupBy(sql`1`, schema.quote.currency)
      .orderBy(sql`1`),
  ]);

  const statusCount = (statuses: readonly string[]) =>
    byStatus.filter((r) => statuses.includes(r.status)).reduce((acc, r) => acc + Number(r.n), 0);

  return c.json({
    generatedAt: now.toISOString(),
    projects: {
      open: statusCount(OPEN_STATUSES),
      activeTenders: statusCount(ACTIVE_TENDER_STATUSES),
      inPreparation: statusCount(PREPARATION_STATUSES),
      byStatus: byStatus.map((r) => ({ status: r.status, count: Number(r.n) })),
      byCountry: byCountry.map((r) => ({ country: r.country, count: Number(r.n) })),
      byTrade: byTrade.map((r) => ({ trade: r.trade, count: Number(r.n) })),
      /** Estimations saisies, par devise : jamais additionnées entre devises. */
      estimates: estimates.map((r) => ({ currency: r.currency, total: r.total ?? "0", projects: Number(r.n) })),
      needingAttention: blockingIssues.map((r) => ({ projectId: r.projectId, blockingIssues: Number(r.n) })),
    },
    documents: {
      cctpGenerating: Number(cctpGenerating[0]?.n ?? 0),
      dpgfToValidate: Number(dpgfToValidate[0]?.n ?? 0),
      quotesPending: quotesPending.map((r) => ({ currency: r.currency, count: Number(r.n) })),
      quotesByMonth: quotesByMonth.map((r) => ({ month: r.month, currency: r.currency, count: Number(r.n) })),
    },
    deadlines: [
      ...upcomingProjects.map((r) => ({ kind: "remise" as const, id: r.id, title: `${r.reference} · ${r.name}`, dueAt: r.dueAt })),
      ...upcomingDeadlines.map((r) => ({ kind: "jalon" as const, id: r.id, title: r.title, dueAt: r.dueAt, projectId: r.projectId })),
    ].sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt))),
    alerts: {
      stalePrices: Number(staleprices[0]?.n ?? 0),
      unverifiedPrices: Number(unverifiedPrices[0]?.n ?? 0),
      stalePriceMonths: STALE_PRICE_MONTHS,
    },
    ai: {
      jobsRunning: Number(jobsRunning[0]?.n ?? 0),
      last30Days: {
        calls: Number(usage[0]?.calls ?? 0),
        inputTokens: Number(usage[0]?.inputTokens ?? 0),
        outputTokens: Number(usage[0]?.outputTokens ?? 0),
        costUsd: usage[0]?.costUsd ?? null,
      },
    },
    recentProjects,
  });
});
