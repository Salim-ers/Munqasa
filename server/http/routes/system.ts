/**
 * État des services et journal de sécurité. Aucun secret n'est jamais renvoyé :
 * seulement « configuré » ou non.
 */
import { desc, like, or } from "drizzle-orm";
import { Hono } from "hono";
import type { AdminEnv } from "../../auth/guard.js";
import { getDb, schema } from "../../db/index.js";
import { getEnv } from "../../env.js";

export const systemRoutes = new Hono<AdminEnv>()
  .get("/status", (c) => {
    const env = getEnv();
    return c.json({
      environment: env.isProduction ? "production" : "developpement",
      database: env.DATABASE_URL ? "neon" : "locale",
      openai: Boolean(env.OPENAI_API_KEY),
      storage: Boolean(env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY) ? "s3" : env.isProduction ? "absent" : "local",
      cron: Boolean(env.CRON_SECRET),
    });
  })
  .get("/audit", async (c) => {
    const db = await getDb();
    const limit = Math.min(Number(c.req.query("limit") ?? 50) || 50, 200);
    const securityOnly = c.req.query("filtre") === "securite";
    const rows = await db
      .select()
      .from(schema.auditLog)
      .where(
        securityOnly
          ? or(
              like(schema.auditLog.action, "connexion.%"),
              like(schema.auditLog.action, "deconnexion.%"),
              like(schema.auditLog.action, "securite.%"),
              like(schema.auditLog.action, "sessions.%"),
              like(schema.auditLog.action, "compte.%"),
              like(schema.auditLog.action, "acces.%"),
            )
          : undefined,
      )
      .orderBy(desc(schema.auditLog.occurredAt))
      .limit(limit);
    return c.json({ entries: rows });
  });
