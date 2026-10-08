/**
 * Connexion à la base.
 * - Production : Neon PostgreSQL (pilote serverless sur WebSocket : transactions disponibles).
 * - Développement et tests : PGlite, PostgreSQL embarqué, avec exactement les mêmes migrations.
 *   PGlite n'est jamais utilisé en production (DATABASE_URL y est obligatoire).
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { getEnv } from "../env.js";
import * as schema from "./schema/index.js";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
export { schema };

export const MIGRATIONS_DIR = fileURLToPath(new URL("./migrations", import.meta.url));

let pending: Promise<Database> | null = null;
let override: Database | null = null;

export function getDb(): Promise<Database> {
  if (override) return Promise.resolve(override);
  // Un échec (configuration, réseau) n'est pas mis en cache : la prochaine requête réessaie.
  pending ??= connect().catch((error: unknown) => {
    pending = null;
    throw error;
  });
  return pending;
}

/** Tests : injecte une base (PGlite en mémoire). */
export function setDbForTests(db: Database | null): void {
  override = db;
  pending = null;
}

async function connect(): Promise<Database> {
  const env = getEnv();
  if (env.DATABASE_URL) {
    const { Pool, neonConfig } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-serverless");
    // Node 22+ fournit WebSocket nativement.
    neonConfig.webSocketConstructor = globalThis.WebSocket;
    const pool = new Pool({ connectionString: env.DATABASE_URL, max: 5 });
    return drizzle({ client: pool, schema }) as unknown as Database;
  }
  if (env.isProduction) throw new Error("DATABASE_URL est obligatoire en production.");
  return connectLocal(env.LOCAL_DB_DIR ?? ".data/pglite");
}

/** Base locale persistée sur disque, migrée automatiquement. */
export async function connectLocal(dataDir: string | undefined): Promise<Database> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  if (dataDir) mkdirSync(dirname(resolve(dataDir)), { recursive: true });
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db as unknown as Database;
}
