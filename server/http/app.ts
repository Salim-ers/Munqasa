/**
 * API Hono : /api/auth/* (Better Auth), /api/admin/* (métier, protégée), /api/jobs/* (tâche planifiée).
 * Même application sur Vercel (api/index.ts) et en local (middleware Vite).
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getAuth } from "../auth/auth.js";
import { type AdminEnv, requireAdmin, sameOriginOnly } from "../auth/guard.js";
import { ConfigError } from "../env.js";
import { AiConfigError } from "../ai/client.js";
import { AiBudgetError } from "../services/openai.js";
import { StorageNotConfiguredError } from "../services/storage.js";
import { agentRoutes, metreRoutes } from "./routes/agents.js";
import { breakdownRoutes } from "./routes/breakdowns.js";
import { dossierRoutes } from "./routes/dossier.js";
import { exportRoutes } from "./routes/exports.js";
import { cctpRoutes, qualityRoutes } from "./routes/cctp.js";
import { dpgfRoutes } from "./routes/dpgf.js";
import { clientRoutes, prospectRoutes } from "./routes/crm.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { fileRoutes } from "./routes/files.js";
import { jobRoutes } from "./routes/jobs.js";
import { libraryRoutes } from "./routes/library.js";
import { referenceRoutes } from "./routes/references.js";
import { deadlineRoutes, projectRoutes } from "./routes/projects.js";
import { aiRoutes, companyRoutes, notificationRoutes, settingRoutes } from "./routes/settings.js";
import { systemRoutes } from "./routes/system.js";
import { ValidationError } from "./validate.js";

function adminApi() {
  const admin = new Hono<AdminEnv>();
  admin.use("*", sameOriginOnly);

  // Accessible avant l'activation de la double authentification (pour la proposer).
  admin.get("/me", requireAdmin({ allowWithoutSecondFactor: true }), (c) => {
    const { user, session } = c.get("session");
    return c.json({
      user: { id: user.id, email: user.email, name: user.name, twoFactorEnabled: Boolean(user.twoFactorEnabled) },
      session: { id: session.id, expiresAt: session.expiresAt },
      secondFactorRequired: !user.twoFactorEnabled,
    });
  });

  // Tout le reste exige la double authentification.
  admin.use("*", requireAdmin());
  admin.route("/dashboard", dashboardRoutes);
  admin.route("/system", systemRoutes);
  admin.route("/clients", clientRoutes);
  admin.route("/prospects", prospectRoutes);
  admin.route("/projects", projectRoutes);
  admin.route("/deadlines", deadlineRoutes);
  admin.route("/files", fileRoutes);
  admin.route("/company", companyRoutes);
  admin.route("/settings", settingRoutes);
  admin.route("/notifications", notificationRoutes);
  admin.route("/ai", aiRoutes);
  admin.route("/agents", agentRoutes);
  admin.route("/", metreRoutes);
  admin.route("/references", referenceRoutes);
  admin.route("/quality-issues", qualityRoutes);
  admin.route("/", cctpRoutes);
  admin.route("/", dpgfRoutes);
  admin.route("/library", libraryRoutes);
  admin.route("/", breakdownRoutes);
  admin.route("/", dossierRoutes);
  admin.route("/exports", exportRoutes);
  return admin;
}

export function createApp() {
  const app = new Hono().basePath("/api");

  app.use("*", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
    c.header("X-Robots-Tag", "noindex, nofollow");
  });

  app.get("/health", (c) => c.json({ ok: true }));
  // Connexion, double authentification, passkeys : uniquement depuis le site lui-même.
  app.on(["GET", "POST"], "/auth/*", sameOriginOnly, async (c) => (await getAuth()).handler(c.req.raw));
  app.route("/admin", adminApi());
  // Appelée par Vercel Cron, authentifiée par CRON_SECRET (hors session).
  app.route("/jobs", jobRoutes);

  app.notFound((c) => c.json({ error: "introuvable", message: "Ressource introuvable." }, 404));
  app.onError((error, c) => {
    if (error instanceof ValidationError) {
      return c.json({ error: "validation", message: error.message, fields: error.fields }, 400);
    }
    if (error instanceof HTTPException) {
      const code = error.status === 404 ? "introuvable" : error.status === 409 ? "conflit" : "requete_invalide";
      return c.json({ error: code, message: error.message }, error.status);
    }
    if (error instanceof AiBudgetError) return c.json({ error: "plafond_ia", message: error.message }, 429);
    if (error instanceof AiConfigError) return c.json({ error: "ia_non_configuree", message: error.message }, 400);
    // Le détail reste dans les journaux serveur ; le client reçoit un message neutre.
    console.error("[api]", c.req.method, c.req.path, error);
    if (error instanceof ConfigError) {
      return c.json({ error: "configuration_incomplete", message: "La configuration du serveur est incomplète." }, 503);
    }
    if (error instanceof StorageNotConfiguredError) {
      return c.json({ error: "stockage_non_configure", message: "Le stockage des fichiers n’est pas encore configuré." }, 503);
    }
    // Ne relit pas la configuration ici : elle peut être la cause de l'erreur.
    const production = Boolean(process.env.VERCEL_ENV) || process.env.NODE_ENV === "production";
    return c.json({ error: "erreur_interne", message: "Une erreur est survenue.", ...(production ? {} : { detail: String(error) }) }, 500);
  });
  return app;
}

let app: ReturnType<typeof createApp> | null = null;

export function getApp() {
  app ??= createApp();
  return app;
}
