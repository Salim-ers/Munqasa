/**
 * Au déploiement (buildCommand de vercel.json), après les migrations : premier chargement de chaque source
 * publique de prix jamais chargée, depuis son instantané, puis bilan des références réellement présentes en
 * base. Voir server/services/price-sources/initial-load.ts. N'interrompt jamais le build.
 *
 *   npm run prices:init
 */
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

// Une prévisualisation ne touche jamais à la base de production.
if (process.env.VERCEL_ENV === "preview") {
  console.log("Prévisualisation : bibliothèque de prix non chargée.");
  process.exit(0);
}
if (process.env.VERCEL && !process.env.DATABASE_URL) {
  console.log("Bibliothèque de prix : DATABASE_URL absente, rien à charger.");
  process.exit(0);
}

try {
  const { getDb } = await import("../server/db/index.js");
  const { initialLoad } = await import("../server/services/price-sources/initial-load.js");
  for (const line of await initialLoad(await getDb())) console.log(line);
} catch (error) {
  // Le site doit pouvoir se déployer même si le chargement échoue (cause dans les journaux du build).
  console.error("⚠ Bibliothèque de prix : premier chargement impossible.", error instanceof Error ? error.message : "");
}
process.exit(0);
