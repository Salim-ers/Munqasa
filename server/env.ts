/**
 * Variables d'environnement du serveur, validées au premier usage.
 * En production, une variable obligatoire manquante arrête tout de suite le serveur, avec son nom
 * (jamais sa valeur). Aucune de ces variables n'est préfixée par VITE_ : elles ne quittent pas le serveur.
 */
import { z } from "zod";

const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const schema = z.object({
  /** Chaîne de connexion Neon PostgreSQL (obligatoire en production). */
  DATABASE_URL: optionalString,
  /** Secret de signature des sessions (32 caractères au moins, obligatoire en production). */
  BETTER_AUTH_SECRET: optionalString,
  /** URL publique du site, sans barre finale (ex. https://munqasa.vercel.app). */
  APP_URL: optionalString,
  /** Adresse de l'unique compte administrateur. */
  ADMIN_EMAIL: optionalString,
  /** Clé de l'API OpenAI (fonctions IA uniquement). */
  OPENAI_API_KEY: optionalString,
  /** Secret des appels planifiés Vercel (traitements longs). */
  CRON_SECRET: optionalString,
  /** Stockage objet compatible S3 (Cloudflare R2 en production). */
  S3_ENDPOINT: optionalString,
  S3_REGION: optionalString,
  S3_BUCKET: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  /** Développement uniquement : dossier de la base PostgreSQL embarquée (PGlite). */
  LOCAL_DB_DIR: optionalString,
  /** Développement uniquement : dossier du stockage de fichiers local. */
  LOCAL_STORAGE_DIR: optionalString,
});

export type ServerEnv = z.infer<typeof schema> & {
  isProduction: boolean;
  appUrl: string;
  authSecret: string;
};

let cached: ServerEnv | null = null;

/** Production réelle (déploiement Vercel de production ou serveur lancé en production). */
function detectProduction(): boolean {
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview";
  return process.env.NODE_ENV === "production" && process.env.TALAB_LOCAL !== "1";
}

function resolveAppUrl(raw: string | undefined, isProduction: boolean): string {
  if (raw) return raw.replace(/\/+$/, "");
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (isProduction) throw new Error("Variable d'environnement manquante : APP_URL");
  return "http://localhost:5173";
}

export function getEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Variables d'environnement invalides : ${names}`);
  }
  const env = parsed.data;
  const isProduction = detectProduction();

  if (isProduction) {
    const missing = (["DATABASE_URL", "BETTER_AUTH_SECRET", "ADMIN_EMAIL"] as const).filter((k) => !env[k]);
    if (missing.length) throw new Error(`Variables d'environnement manquantes : ${missing.join(", ")}`);
  }
  if (env.BETTER_AUTH_SECRET && env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error("BETTER_AUTH_SECRET doit compter au moins 32 caractères");
  }

  cached = {
    ...env,
    ADMIN_EMAIL: env.ADMIN_EMAIL?.toLowerCase(),
    isProduction,
    appUrl: resolveAppUrl(env.APP_URL, isProduction),
    // Hors production seulement : secret de développement fixe (les sessions locales n'ont aucune valeur).
    authSecret: env.BETTER_AUTH_SECRET ?? "talab-dev-uniquement-secret-non-utilisable-en-production",
  };
  return cached;
}

/** Réservé aux tests : relit l'environnement. */
export function resetEnvCache(): void {
  cached = null;
}
