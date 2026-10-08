/**
 * Authentification (Better Auth, données dans Neon).
 * - Un seul compte : ADMIN_EMAIL. Toute autre création de compte est refusée en base.
 * - Aucune inscription publique : la route est désactivée ; le compte se crée en ligne de commande.
 * - Double authentification TOTP + codes de secours, verrouillage après échecs répétés ; passkeys.
 * - Limitation des tentatives stockée en base (fonctionne en serverless).
 */
import { passkey } from "@better-auth/passkey";
import { type BetterAuthPlugin, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware, isAPIError } from "better-auth/api";
import { twoFactor } from "better-auth/plugins/two-factor";
import { type Database, getDb, schema } from "../db/index.js";
import { getEnv, type ServerEnv } from "../env.js";
import { requestOrigin, writeAudit } from "../services/audit.js";

/** Durée de session : 12 h, prolongée par l'activité (au plus une fois par heure). */
const SESSION_SECONDS = 60 * 60 * 12;

/** Événements de sécurité journalisés : chemin Better Auth → action du journal. */
const AUDITED_PATHS: Record<string, string> = {
  "/sign-in/email": "connexion.mot_de_passe",
  "/two-factor/verify-totp": "connexion.second_facteur",
  "/two-factor/verify-backup-code": "connexion.code_de_secours",
  "/passkey/verify-authentication": "connexion.passkey",
  "/sign-out": "deconnexion",
  "/revoke-sessions": "sessions.revocation_toutes",
  "/revoke-other-sessions": "sessions.revocation_autres",
  "/revoke-session": "sessions.revocation",
  "/two-factor/enable": "securite.2fa_activation_demandee",
  "/two-factor/disable": "securite.2fa_desactivation",
  "/two-factor/generate-backup-codes": "securite.codes_de_secours_regeneres",
  "/passkey/verify-registration": "securite.passkey_ajoutee",
  "/passkey/delete-passkey": "securite.passkey_supprimee",
  "/change-password": "securite.mot_de_passe_modifie",
};

/**
 * Journal des événements de sécurité. Module placé après les autres : il voit la réponse finale
 * (par exemple « second facteur requis » plutôt que la session provisoire de la connexion).
 */
const auditPlugin = {
  id: "talab-audit",
  hooks: {
    after: [
      {
        matcher: (ctx) => Boolean(ctx.path && ctx.path in AUDITED_PATHS),
        handler: createAuthMiddleware(async (ctx) => {
          const action = AUDITED_PATHS[ctx.path];
          if (!action) return;
          const returned = ctx.context.returned;
          const failed = isAPIError(returned);
          const headers = ctx.request?.headers ?? ctx.headers ?? new Headers();
          const actor = ctx.context.newSession?.user.id ?? ctx.context.session?.user.id ?? null;
          const pendingSecondFactor =
            !failed && typeof returned === "object" && returned !== null && "twoFactorRedirect" in returned && returned.twoFactorRedirect === true;
          await writeAudit({
            action: `${action}.${failed ? "echec" : pendingSecondFactor ? "second_facteur_requis" : "reussite"}`,
            actorUserId: actor,
            ...requestOrigin(headers),
            details: failed ? { code: (returned as { body?: { code?: string } }).body?.code ?? null } : {},
          });
        }),
      },
    ],
  },
} satisfies BetterAuthPlugin;

/** Origines admises : le site en production ; en développement, aussi tout serveur local. */
function devOrigins(env: ServerEnv): string[] {
  if (env.isProduction) return [env.appUrl];
  return [env.appUrl, "http://localhost:*", "http://127.0.0.1:*"];
}

function build(db: Database, env: ServerEnv) {
  const origins = devOrigins(env);
  return betterAuth({
    appName: "Talab Solutions",
    baseURL: env.appUrl,
    basePath: "/api/auth",
    secret: env.authSecret,
    telemetry: { enabled: false },
    database: drizzleAdapter(db, {
      provider: "pg",
      transaction: true,
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        twoFactor: schema.twoFactor,
        passkey: schema.passkey,
        rateLimit: schema.rateLimit,
      },
    }),
    trustedOrigins: origins,
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 256,
      revokeSessionsOnPasswordReset: true,
    },
    session: {
      expiresIn: SESSION_SECONDS,
      updateAge: 60 * 60,
      // Opérations sensibles (mot de passe, sécurité) : session de moins de 15 minutes.
      freshAge: 60 * 15,
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 15 * 60, max: 5 },
        "/two-factor/verify-totp": { window: 15 * 60, max: 6 },
        "/two-factor/verify-backup-code": { window: 15 * 60, max: 5 },
        "/passkey/verify-authentication": { window: 15 * 60, max: 10 },
        "/change-password": { window: 15 * 60, max: 5 },
      },
    },
    // Routes inutiles ou dangereuses pour un compte unique : désactivées.
    disabledPaths: [
      "/sign-up/email",
      "/request-password-reset",
      "/reset-password",
      "/change-email",
      "/delete-user",
      "/send-verification-email",
      "/verify-email",
    ],
    advanced: {
      cookiePrefix: "talab",
      useSecureCookies: env.isProduction,
      ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-real-ip"] },
    },
    databaseHooks: {
      user: {
        create: {
          // Un seul compte possible : celui de l'administrateur.
          before: async (user) => {
            if (!env.ADMIN_EMAIL || user.email.toLowerCase() !== env.ADMIN_EMAIL) {
              await writeAudit({ action: "compte.creation_refusee", details: { email: user.email } });
              return false;
            }
          },
        },
        update: {
          before: async (data) => {
            if (typeof data.email === "string" && data.email.toLowerCase() !== env.ADMIN_EMAIL) return false;
          },
        },
      },
    },
    plugins: [
      twoFactor({
        issuer: "Talab Solutions",
        backupCodeOptions: { amount: 10, length: 12 },
        trustDeviceMaxAge: 60 * 60 * 24 * 30,
        accountLockout: { enabled: true },
      }),
      passkey({
        rpID: new URL(env.appUrl).hostname,
        rpName: "Talab Solutions",
        // WebAuthn exige l'origine exacte : celle du site (en local, APP_URL suit le port du serveur).
        origin: env.appUrl,
      }),
      auditPlugin,
    ],
  });
}

export type Auth = ReturnType<typeof build>;

let pending: Promise<Auth> | null = null;

export function getAuth(): Promise<Auth> {
  pending ??= getDb().then((db) => build(db, getEnv()));
  return pending;
}

/** Tests : reconstruit l'instance (après changement d'environnement ou de base). */
export function resetAuthForTests(): void {
  pending = null;
}
