/**
 * Garde de l'API d'administration, appliquée côté serveur à chaque route privée :
 * session valide, compte = ADMIN_EMAIL, double authentification activée.
 * Le lien « Administration » du site n'est qu'un point d'entrée : la sécurité est ici.
 */
import { createMiddleware } from "hono/factory";
import { getEnv } from "../env.js";
import { requestOrigin, writeAudit } from "../services/audit.js";
import { type Auth, getAuth } from "./auth.js";

export type AdminSession = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;
export type AdminEnv = { Variables: { session: AdminSession } };

export function requireAdmin(options: { allowWithoutSecondFactor?: boolean } = {}) {
  return createMiddleware<AdminEnv>(async (c, next) => {
    const auth = await getAuth();
    const result = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!result) return c.json({ error: "non_authentifie", message: "Connexion requise." }, 401);

    const env = getEnv();
    if (!env.ADMIN_EMAIL || result.user.email.toLowerCase() !== env.ADMIN_EMAIL) {
      await writeAudit({
        action: "acces.refuse",
        actorUserId: result.user.id,
        ...requestOrigin(c.req.raw.headers),
        details: { chemin: c.req.path },
      });
      return c.json({ error: "interdit", message: "Accès refusé." }, 403);
    }
    if (!result.user.twoFactorEnabled && !options.allowWithoutSecondFactor) {
      return c.json(
        { error: "second_facteur_requis", message: "Activez la double authentification pour accéder à l'espace d'administration." },
        403,
      );
    }
    c.set("session", result);
    await next();
  });
}

/** Requêtes modifiantes acceptées uniquement depuis le site lui-même (protection CSRF en plus des cookies SameSite). */
export const sameOriginOnly = createMiddleware(async (c, next) => {
  if (c.req.method === "GET" || c.req.method === "HEAD") return next();
  const origin = c.req.header("origin");
  if (!origin || !isAllowedOrigin(origin)) {
    return c.json({ error: "origine_refusee", message: "Requête refusée." }, 403);
  }
  await next();
});

/** Production : l'adresse exacte du site. Développement : le site, ou tout serveur local. */
export function isAllowedOrigin(origin: string): boolean {
  const env = getEnv();
  if (origin === env.appUrl) return true;
  return !env.isProduction && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}
