/**
 * API Hono : /api/auth/* (Better Auth) et /api/admin/* (métier, protégée).
 * Même application sur Vercel (api/[...path].ts) et en local (middleware Vite).
 */
import { Hono } from "hono";
import { getAuth } from "../auth/auth.js";
import { type AdminEnv, requireAdmin, sameOriginOnly } from "../auth/guard.js";
import { getEnv } from "../env.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { systemRoutes } from "./routes/system.js";

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

  app.notFound((c) => c.json({ error: "introuvable", message: "Ressource introuvable." }, 404));
  app.onError((error, c) => {
    // Le détail reste dans les journaux serveur ; le client reçoit un message neutre.
    console.error("[api]", c.req.method, c.req.path, error);
    const env = getEnv();
    return c.json({ error: "erreur_interne", message: "Une erreur est survenue.", ...(env.isProduction ? {} : { detail: String(error) }) }, 500);
  });
  return app;
}

let app: ReturnType<typeof createApp> | null = null;

export function getApp() {
  app ??= createApp();
  return app;
}
