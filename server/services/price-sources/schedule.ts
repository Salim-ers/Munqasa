/**
 * Vérification planifiée des sources publiques (tâche quotidienne) : une source déjà chargée dont la
 * dernière vérification dépasse son intervalle est relue en ligne. Une source jamais chargée ne l'est
 * pas d'office : le premier chargement reste une décision de l'utilisateur.
 */
import type { Database } from "../../db/index.js";
import { createJob } from "../../jobs/runner.js";
import { ensureSources } from "./engine.js";

export async function scheduleSourceChecks(db: Database, now = new Date()): Promise<number> {
  const sources = await ensureSources(db);
  let scheduled = 0;
  for (const source of sources) {
    if (!source.enabled || !source.lastCheckedAt) continue;
    if (now.getTime() - source.lastCheckedAt.getTime() < source.refreshDays * 86_400_000) continue;
    await createJob({ kind: "import_prix", projectId: null, input: { sourceKey: source.key, mode: "actualisation", trigger: "planifie" } });
    scheduled++;
  }
  return scheduled;
}
