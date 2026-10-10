/**
 * Instantané des sources publiques de prix (server/data/prix) : téléchargement des ressources
 * officielles, empreintes, lecture et bilan par source.
 *
 *   npx tsx scripts/price-snapshot.ts            toutes les sources
 *   npx tsx scripts/price-snapshot.ts ademe-renovation
 */
import { SOURCES } from "../server/services/price-sources/catalog.js";
import { fetchResources } from "../server/services/price-sources/download.js";
import { writeSnapshot } from "../server/services/price-sources/snapshot.js";

const wanted = process.argv.slice(2);
for (const def of SOURCES.filter((s) => wanted.length === 0 || wanted.includes(s.key))) {
  const started = Date.now();
  const { files, resources } = await fetchResources(def);
  const records = await def.parse(files);
  const path = writeSnapshot({ sourceKey: def.key, generatedAt: new Date().toISOString(), resources, records });
  const groups = new Set(records.map((r) => r.groupKey)).size;
  const zones = new Set(records.map((r) => `${r.region ?? ""}|${r.city ?? ""}`)).size;
  console.log(`${def.key} : ${records.length} références, ${groups} références distinctes, ${zones} zones, ${files.length} ressources, ${Math.round((Date.now() - started) / 1000)} s -> ${path}`);
}
