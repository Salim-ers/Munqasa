/**
 * Applique les migrations SQL (server/db/migrations) :
 * - sur Neon si DATABASE_URL est défini (production, préproduction) ;
 * - sinon sur la base locale de développement (.data/pglite).
 *
 *   npm run db:migrate
 */
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

// Déploiement Vercel sans base configurée : rien à migrer (l'API refusera de démarrer sans DATABASE_URL).
if (process.env.VERCEL && !process.env.DATABASE_URL) {
  console.log("DATABASE_URL absente : migrations ignorées.");
  process.exit(0);
}

const { MIGRATIONS_DIR, connectLocal } = await import("../server/db/index.js");

if (process.env.DATABASE_URL) {
  const { Pool, neonConfig } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-serverless");
  const { migrate } = await import("drizzle-orm/neon-serverless/migrator");
  neonConfig.webSocketConstructor = globalThis.WebSocket;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle({ client: pool });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  await pool.end();
  console.log("✓ Migrations appliquées sur Neon.");
} else {
  await connectLocal(process.env.LOCAL_DB_DIR ?? ".data/pglite");
  console.log("✓ Migrations appliquées sur la base locale (.data/pglite).");
}
