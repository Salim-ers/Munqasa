/** Entreprise (entités émettrices), réglages, notifications, paramètres IA. */
import { and, count, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { companyProfileInput } from "../../../shared/schemas.js";
import { SETTINGS, type SettingKey } from "../../../shared/settings.js";
import { supportsReasoning } from "../../ai/client.js";
import type { AdminEnv } from "../../auth/guard.js";
import { getDb, schema } from "../../db/index.js";
import { getEnv } from "../../env.js";
import { auditAction } from "../../services/audit.js";
import { assertBudget, getOpenAI, listModels, monthSpendUsd, recordUsage } from "../../services/openai.js";
import { readSetting, writeSetting } from "../../services/settings.js";
import { body, notFound, patchBody, uuidParam } from "../validate.js";

const cp = schema.companyProfile;

export const companyRoutes = new Hono<AdminEnv>()
  .get("/profiles", async (c) => {
    const db = await getDb();
    const rows = await db.select().from(cp).orderBy(desc(cp.isDefault), cp.label);
    return c.json({ items: rows });
  })
  .post("/profiles", async (c) => {
    const db = await getDb();
    const data = await body(c, companyProfileInput);
    const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(cp);
    const [row] = await db
      .insert(cp)
      .values({ ...data, isDefault: Number(n) === 0 })
      .returning();
    await auditAction(c, "entreprise.creation", "company_profile", row!.id, { entite: row!.label });
    return c.json({ profile: row }, 201);
  })
  .patch("/profiles/:id", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const data = await patchBody(c, companyProfileInput);
    const [row] = await db.update(cp).set(data).where(eq(cp.id, id)).returning();
    if (!row) notFound();
    await auditAction(c, "entreprise.modification", "company_profile", id, { champs: Object.keys(data) });
    return c.json({ profile: row });
  })
  .post("/profiles/:id/default", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    await db.transaction(async (tx) => {
      await tx.update(cp).set({ isDefault: false }).where(ne(cp.id, id));
      const [row] = await tx.update(cp).set({ isDefault: true }).where(eq(cp.id, id)).returning();
      if (!row) notFound();
    });
    await auditAction(c, "entreprise.entite_par_defaut", "company_profile", id);
    return c.json({ ok: true });
  });

const isSettingKey = (key: string): key is SettingKey => key in SETTINGS;

export const settingRoutes = new Hono<AdminEnv>()
  .get("/:key", async (c) => {
    const key = c.req.param("key");
    if (!isSettingKey(key)) notFound();
    return c.json({ value: await readSetting(key) });
  })
  .put("/:key", async (c) => {
    const key = c.req.param("key");
    if (!isSettingKey(key)) notFound();
    const json = await c.req.json().catch(() => null);
    const parsed = SETTINGS[key].safeParse(json);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) fields[issue.path.join(".") || "_"] ??= issue.message;
      return c.json({ error: "validation", message: "Certains champs sont invalides.", fields }, 400);
    }
    const value = await writeSetting(key, parsed.data);
    await auditAction(c, `reglages.${key}`, "app_setting", key);
    return c.json({ value });
  });

export const notificationRoutes = new Hono<AdminEnv>()
  .get("/", async (c) => {
    const db = await getDb();
    const n = schema.notification;
    const [items, unread] = await Promise.all([
      db.select().from(n).orderBy(sql`${n.readAt} is not null`, desc(n.createdAt)).limit(100),
      db.select({ n: count() }).from(n).where(isNull(n.readAt)),
    ]);
    return c.json({ items, unread: Number(unread[0]?.n ?? 0) });
  })
  .post("/:id/read", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    await db.update(schema.notification).set({ readAt: new Date() }).where(and(eq(schema.notification.id, id), isNull(schema.notification.readAt)));
    return c.json({ ok: true });
  })
  .post("/read-all", async (c) => {
    const db = await getDb();
    await db.update(schema.notification).set({ readAt: new Date() }).where(isNull(schema.notification.readAt));
    return c.json({ ok: true });
  });

/** Paramètres IA : modèles réellement disponibles, essai de connexion, dépense du mois. */
export const aiRoutes = new Hono<AdminEnv>()
  .get("/models", async (c) => {
    if (!getEnv().OPENAI_API_KEY) return c.json({ configured: false, models: [] });
    try {
      return c.json({ configured: true, models: await listModels() });
    } catch (error) {
      const status = (error as { status?: number }).status;
      return c.json({ configured: true, models: [], error: status === 401 ? "Clé OpenAI refusée." : "L’API OpenAI ne répond pas." }, 502);
    }
  })
  .get("/spend", async (c) => {
    const settings = await readSetting("ia");
    return c.json({ monthUsd: await monthSpendUsd(), budgetUsd: settings.monthlyBudgetUsd || null });
  })
  .post("/test", async (c) => {
    const settings = await readSetting("ia");
    const model = settings.generationModel;
    if (!model) throw new HTTPException(400, { message: "Choisissez d’abord un modèle de génération." });
    if (!getEnv().OPENAI_API_KEY) {
      return c.json({ error: "openai_non_configure", message: "La clé OpenAI n’est pas configurée sur le serveur (variable OPENAI_API_KEY)." }, 503);
    }
    await assertBudget();
    const started = Date.now();
    // Un modèle à raisonnement compte sa réflexion dans la limite de sortie : effort minimal et marge suffisante.
    const response = await getOpenAI().responses.create({
      model,
      input: "Réponds uniquement : OK",
      max_output_tokens: supportsReasoning(model) ? 512 : 16,
      ...(supportsReasoning(model) ? { reasoning: { effort: "low" as const } } : {}),
      store: settings.storeResponses,
    });
    await recordUsage(model, response.usage);
    await auditAction(c, "ia.test_connexion", "ai", model);
    return c.json({ ok: true, model, latencyMs: Date.now() - started, output: response.output_text.slice(0, 50) });
  });
