/**
 * État des services, essais de connexion, journal, export de sauvegarde. Aucun secret n'est jamais
 * renvoyé : seulement « configuré » ou non, et le résultat des essais.
 */
import { and, desc, eq, gte, like, lte, or, type SQL, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { AdminEnv } from "../../auth/guard.js";
import { getDb, schema } from "../../db/index.js";
import { getEnv } from "../../env.js";
import { auditAction } from "../../services/audit.js";
import { listModels } from "../../services/openai.js";
import { getStorage, storageConfigured } from "../../services/storage.js";
import { renderPdf } from "../../documents/render-pdf.js";
import { readPdfText } from "../../services/pdf-text.js";
import { readSetting } from "../../services/settings.js";

/** Tables exportées : toutes les données métier, jamais les secrets d'authentification. */
const EXPORT_TABLES = {
  company_profile: schema.companyProfile,
  app_setting: schema.appSetting,
  client: schema.client,
  prospect: schema.prospect,
  project: schema.project,
  project_lot: schema.projectLot,
  deadline: schema.deadline,
  source_file: schema.sourceFile,
  drawing: schema.drawing,
  drawing_annotation: schema.drawingAnnotation,
  measurement: schema.measurement,
  technical_reference: schema.technicalReference,
  supplier: schema.supplier,
  material: schema.material,
  price_item: schema.priceItem,
  price_history: schema.priceHistory,
  work_item: schema.workItem,
  cctp_document: schema.cctpDocument,
  cctp_section: schema.cctpSection,
  dpgf: schema.dpgf,
  dpgf_line: schema.dpgfLine,
  price_breakdown: schema.priceBreakdown,
  price_breakdown_component: schema.priceBreakdownComponent,
  document_version: schema.documentVersion,
  quote: schema.quote,
  quote_line: schema.quoteLine,
  quote_event: schema.quoteEvent,
  currency_rate: schema.currencyRate,
  generation_job: schema.generationJob,
  generation_step: schema.generationStep,
  generation_artifact: schema.generationArtifact,
  agent_run: schema.agentRun,
  ai_usage_record: schema.aiUsageRecord,
  quality_issue: schema.qualityIssue,
  notification: schema.notification,
  audit_log: schema.auditLog,
} as const;

async function timed<T>(run: () => Promise<T>): Promise<{ ok: true; ms: number; detail?: T } | { ok: false; ms: number; error: string }> {
  const started = Date.now();
  try {
    const detail = await run();
    return { ok: true, ms: Date.now() - started, detail };
  } catch (error) {
    return { ok: false, ms: Date.now() - started, error: error instanceof Error ? error.message.slice(0, 200) : "Échec." };
  }
}

export const systemRoutes = new Hono<AdminEnv>()
  .get("/status", (c) => {
    const env = getEnv();
    return c.json({
      environment: env.isProduction ? "production" : "developpement",
      database: env.DATABASE_URL ? "neon" : "locale",
      openai: Boolean(env.OPENAI_API_KEY),
      storage: storageConfigured() ? "s3" : env.isProduction ? "absent" : "local",
      cron: Boolean(env.CRON_SECRET),
      // Mot de passe initial encore présent sur Vercel : à supprimer une fois le compte créé.
      adminPassword: Boolean(env.ADMIN_PASSWORD),
    });
  })
  .post("/connections/test", async (c) => {
    const env = getEnv();
    const db = await getDb();
    const [database, storage, openai, documents] = await Promise.all([
      timed(async () => {
        await db.execute(sql`select 1`);
        return env.DATABASE_URL ? "Neon" : "PostgreSQL local";
      }),
      timed(async () => {
        const store = await getStorage();
        const key = `diagnostic/${crypto.randomUUID()}.txt`;
        await store.put(key, new TextEncoder().encode("talab"), "text/plain");
        const head = await store.head(key);
        await store.remove(key);
        if (head?.size !== 5) throw new Error("Lecture incohérente.");
        return store.kind === "s3" ? "Compartiment S3" : "Dossier local";
      }),
      env.OPENAI_API_KEY ? timed(async () => `${(await listModels()).length} modèles disponibles`) : Promise.resolve({ ok: false as const, ms: 0, error: "Clé non configurée." }),
      // Moteur documentaire : polices et logos embarqués, rendu PDF puis relecture de son texte.
      timed(async () => {
        const pdf = await renderPdf(
          {
            meta: {
              kind: "controle",
              typeLabel: "Essai du moteur documentaire",
              shortLabel: "Essai",
              title: "Essai du moteur documentaire",
              project: { reference: "ESSAI", name: "Essai", location: null, phase: null },
              client: null,
              lot: null,
              version: null,
              date: new Date(),
              status: "Essai",
              company: null,
              footerText: "Talab Solutions",
              orientation: "portrait",
              toc: false,
            },
            blocks: [{ type: "paragraph", content: ["Béton armé, 12,50 m², ≤ 0,5 %."] }],
          },
          await readSetting("identite_documentaire"),
          { theme: "clair" },
        );
        const pages = await readPdfText(pdf);
        if (!pages.some((p) => p.items.some((i) => i.text.includes("Béton armé")))) throw new Error("Texte illisible dans le PDF produit.");
        return `PDF de ${pages.length} pages, ${Math.round(pdf.length / 1024)} Ko`;
      }),
    ]);
    await auditAction(c, "systeme.test_connexions", "system", null, { base: database.ok, stockage: storage.ok, openai: openai.ok, documents: documents.ok });
    return c.json({ database, storage, openai, documents });
  })
  .get("/audit", async (c) => {
    const db = await getDb();
    const limit = Math.min(Number(c.req.query("limit") ?? 50) || 50, 500);
    const filters: SQL[] = [];
    const filter = c.req.query("filtre");
    if (filter === "securite") {
      filters.push(
        or(
          like(schema.auditLog.action, "connexion.%"),
          like(schema.auditLog.action, "deconnexion.%"),
          like(schema.auditLog.action, "securite.%"),
          like(schema.auditLog.action, "sessions.%"),
          like(schema.auditLog.action, "compte.%"),
          like(schema.auditLog.action, "acces.%"),
        )!,
      );
    }
    const action = c.req.query("action");
    if (action && /^[a-z_.]{1,80}$/.test(action)) filters.push(like(schema.auditLog.action, `${action}%`));
    const from = c.req.query("du");
    const to = c.req.query("au");
    if (from) filters.push(gte(schema.auditLog.occurredAt, new Date(from)));
    if (to) filters.push(lte(schema.auditLog.occurredAt, new Date(to)));
    const entity = c.req.query("entite");
    if (entity && /^[0-9a-f-]{36}$/i.test(entity)) filters.push(eq(schema.auditLog.entityId, entity));
    const rows = await db
      .select()
      .from(schema.auditLog)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(schema.auditLog.occurredAt))
      .limit(limit);
    return c.json({ entries: rows });
  })
  .get("/export", async (c) => {
    // Sauvegarde complète des données métier, au format JSON (restaurable table par table).
    const db = await getDb();
    const tables: Record<string, unknown[]> = {};
    for (const [name, table] of Object.entries(EXPORT_TABLES)) tables[name] = await db.select().from(table);
    await auditAction(c, "systeme.export_donnees", "system", null, { tables: Object.keys(tables).length });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    return new Response(JSON.stringify({ format: "talab-intelligence/export", version: 1, exportedAt: new Date().toISOString(), tables }, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="talab-sauvegarde-${stamp}.json"`,
        "cache-control": "no-store",
      },
    });
  })
  .get("/stats", async (c) => {
    // Volumétrie par table (supervision).
    const db = await getDb();
    const counts: Record<string, number> = {};
    for (const [name, table] of Object.entries(EXPORT_TABLES)) {
      const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table);
      counts[name] = Number(row?.n ?? 0);
    }
    return c.json({ counts });
  });
