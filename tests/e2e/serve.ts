/**
 * Serveur des tests de bout en bout : base PostgreSQL locale et stockage neufs, compte administrateur
 * de test créé comme en production (ligne de commande), aucune clé externe (OpenAI désactivée).
 * Lancé par Playwright (playwright.config.ts) ; jamais relié à Neon ni à un compartiment réel.
 */
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { E2E } from "./constants.ts";

const DB_DIR = resolve(".data/e2e/pglite");
const STORAGE_DIR = resolve(".data/e2e/storage");

rmSync(resolve(".data/e2e"), { recursive: true, force: true });
Object.assign(process.env, {
  NODE_ENV: "development",
  LOCAL_DB_DIR: DB_DIR,
  LOCAL_STORAGE_DIR: STORAGE_DIR,
  ADMIN_EMAIL: E2E.email,
  BETTER_AUTH_SECRET: "secret-de-session-des-tests-e2e-0123456789",
  CRON_SECRET: E2E.cronSecret,
  APP_URL: E2E.baseUrl,
  // Chaînes vides : aucune base distante, aucun stockage distant, aucun appel à OpenAI.
  DATABASE_URL: "",
  OPENAI_API_KEY: "",
  S3_ENDPOINT: "",
  S3_BUCKET: "",
  S3_ACCESS_KEY_ID: "",
  S3_SECRET_ACCESS_KEY: "",
});

// 1. Compte administrateur, puis fermeture de la base (PGlite n'accepte qu'un processus à la fois).
{
  const { getAuth } = await import("../../server/auth/auth.js");
  const { getDb } = await import("../../server/db/index.js");
  const auth = await getAuth();
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser({ email: E2E.email, name: "Administrateur", emailVerified: true }, { method: "admin" });
  if (!user) throw new Error("Création du compte de test impossible.");
  await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: "credential", accountId: user.id, password: await ctx.password.hash(E2E.password) });
  const db = (await getDb()) as unknown as { $client: { close(): Promise<void> } };
  await db.$client.close();
}

// 2. Serveur de développement (vitrine, administration, API), sur un port réservé aux tests.
const { createServer } = await import("vite");
const server = await createServer({ server: { port: E2E.port, strictPort: true, host: "localhost" } });
await server.listen();
console.log(`Serveur de test prêt sur ${E2E.baseUrl}`);
