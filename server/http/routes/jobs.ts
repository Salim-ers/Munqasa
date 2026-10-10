/**
 * Tâche planifiée (Vercel Cron, chaque matin) : rappels d'échéance, nettoyage des envois abandonnés,
 * reprise des traitements longs, vérification des sources publiques de prix. Protégée par CRON_SECRET (Vercel envoie
 * « Authorization: Bearer <CRON_SECRET> »).
 */
import { timingSafeEqual } from "node:crypto";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { Hono } from "hono";
import { type Database, getDb, schema } from "../../db/index.js";
import { getEnv } from "../../env.js";
import { writeAudit } from "../../services/audit.js";
import { generateDeadlineReminders } from "../../services/notifications.js";
import { scheduleSourceChecks } from "../../services/price-sources/schedule.js";
import { getStorage } from "../../services/storage.js";
import { resumeStalledJobs, runSlice, verifyJobToken } from "../../jobs/runner.js";

function authorized(header: string | undefined, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Envois commencés mais jamais terminés depuis plus de 24 h : l'objet éventuel est effacé du stockage. */
export async function purgeAbandonedUploads(db: Database, now = new Date()): Promise<number> {
  const f = schema.sourceFile;
  const cutoff = new Date(now.getTime() - 24 * 3600 * 1000);
  const stale = await db
    .select({ id: f.id, storageKey: f.storageKey })
    .from(f)
    .where(and(eq(f.status, "en_attente"), lt(f.createdAt, cutoff), isNull(f.deletedAt)));
  if (stale.length === 0) return 0;
  const storage = await getStorage();
  for (const file of stale) await storage.remove(file.storageKey).catch(() => undefined);
  await db
    .update(f)
    .set({ status: "rejete", error: "Envoi non terminé.", deletedAt: now })
    .where(inArray(f.id, stale.map((file) => file.id)));
  return stale.length;
}

export const jobRoutes = new Hono()
  .post("/run", async (c) => {
    // Relance interne d'un traitement long (appelée par le serveur lui-même, jeton signé).
    const { jobId } = (await c.req.json().catch(() => ({}))) as { jobId?: string };
    if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) return c.json({ error: "requete_invalide" }, 400);
    if (!verifyJobToken(jobId, c.req.header("authorization")?.replace(/^Bearer /, ""))) return c.json({ error: "interdit" }, 403);
    if (process.env.VERCEL) {
      const { waitUntil } = await import("@vercel/functions");
      waitUntil(runSlice(jobId).catch((error: unknown) => console.error("[jobs]", jobId, error)));
    } else {
      void runSlice(jobId).catch((error: unknown) => console.error("[jobs]", jobId, error));
    }
    return c.json({ ok: true }, 202);
  })
  .get("/cron", async (c) => {
  if (!authorized(c.req.header("authorization"), getEnv().CRON_SECRET)) return c.json({ error: "interdit" }, 403);
  const db = await getDb();
  const reminders = await generateDeadlineReminders(db);
  // Traitements longs interrompus : relancés là où ils s'étaient arrêtés.
  const resumedJobs = await resumeStalledJobs().catch(() => 0);
  const abandonedUploads = await purgeAbandonedUploads(db).catch((error: unknown) => {
    // Stockage indisponible : les rappels restent prioritaires.
    console.error("[cron] nettoyage des envois", error);
    return 0;
  });
  const priceChecks = await scheduleSourceChecks(db).catch((error: unknown) => {
    console.error("[cron] sources de prix", error);
    return 0;
  });
  await writeAudit({ action: "systeme.tache_planifiee", details: { rappels: reminders, envoisAbandonnes: abandonedUploads, traitementsRelances: resumedJobs, sourcesDePrix: priceChecks } });
  return c.json({ ok: true, reminders, abandonedUploads, resumedJobs, priceChecks });
  });
