/** Génération des migrations SQL à partir du schéma (npm run db:generate). */
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./server/db/schema/index.ts",
  out: "./server/db/migrations",
  strict: true,
  verbose: true,
});
