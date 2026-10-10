/**
 * Import d'une source publique dans la bibliothèque de prix, en une étape :
 * - « instantane » : premier chargement depuis l'instantané livré avec l'application ;
 * - « actualisation » : relecture des ressources officielles en ligne ; si leurs empreintes n'ont pas
 *   changé, rien n'est relu et la date de vérification des références avance ; sinon, lecture,
 *   contrôle des valeurs, publication des valeurs saines et quarantaine des autres.
 */
import { and, eq, isNull } from "drizzle-orm";
import type { PriceBatchStatus } from "../../../shared/enums.js";
import { schema } from "../../db/index.js";
import { sourceDefinition } from "../../services/price-sources/catalog.js";
import { fetchResources } from "../../services/price-sources/download.js";
import { type BatchRow, sourceByKey, stageBatch } from "../../services/price-sources/engine.js";
import { readSnapshot } from "../../services/price-sources/snapshot.js";
import type { JobHandler } from "../types.js";

export interface PriceImportInput {
  sourceKey: string;
  mode: "instantane" | "actualisation";
  trigger: "manuel" | "planifie";
}

const day = (iso: string | Date) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });

export function batchSummary(batch: Pick<BatchRow, "status" | "stats" | "message">): string {
  const s = batch.stats;
  const parts = [
    s.publiees ? `${s.publiees} valeurs publiées` : null,
    s.inchangees ? `${s.inchangees} inchangées` : null,
    s.quarantaine ? `${s.quarantaine} en quarantaine` : null,
    s.rejetees ? `${s.rejetees} rejetées` : null,
  ].filter(Boolean);
  const labels: Partial<Record<PriceBatchStatus, string>> = { sans_changement: "aucun changement", echoue: "échec", a_publier: "lot à publier" };
  return parts.length ? parts.join(", ") : (labels[batch.status] ?? batch.status);
}

export const priceImportHandler: JobHandler = {
  kind: "import_prix",
  title(job) {
    const input = job.input as unknown as PriceImportInput;
    return `Bibliothèque de prix : ${sourceDefinition(input.sourceKey)?.name ?? input.sourceKey}`;
  },
  stepLabel: (name) => (name === "import" ? "Lecture de la source, contrôle et publication" : name),
  initialSteps: () => ["import"],

  async run(_name, ctx) {
    const { db } = ctx;
    const input = ctx.input as unknown as PriceImportInput;
    const { row, def } = await sourceByKey(db, input.sourceKey);

    if (input.mode === "instantane") {
      const snapshot = readSnapshot(def.key);
      if (!snapshot) throw new Error("Instantané de la source absent de ce déploiement.");
      await ctx.log(`Instantané du ${day(snapshot.generatedAt)} : ${snapshot.records.length} références lues.`);
      const batch = await stageBatch(db, { source: row, records: snapshot.records, label: `Instantané du ${day(snapshot.generatedAt)}`, trigger: "instantane", resources: snapshot.resources, jobId: ctx.job.id });
      await ctx.log(`Lot enregistré : ${batchSummary(batch)}.`);
      return { result: { batchId: batch.id } };
    }

    await ctx.log(`Téléchargement de ${def.resources.length} ressource(s) officielle(s).`);
    const fetched = await fetchResources(def);
    const label = `${input.trigger === "planifie" ? "Vérification planifiée" : "Actualisation"} du ${day(new Date())}`;
    const known = new Map(row.resources.map((res) => [res.url, res.sha256]));
    const identical = row.resources.length > 0 && fetched.resources.every((res) => known.get(res.url) === res.sha256);
    if (identical) {
      const now = new Date();
      const [batch] = await db
        .insert(schema.priceImportBatch)
        .values({
          sourceId: row.id,
          label,
          trigger: input.trigger === "planifie" ? "planifie" : "actualisation",
          status: "sans_changement",
          stats: { lues: 0 },
          resources: fetched.resources,
          message: "Ressources identiques à la dernière lecture : aucune valeur à relire.",
          jobId: ctx.job.id,
        })
        .returning();
      // Les valeurs publiées restent celles de la source : leur vérification est datée.
      await db
        .update(schema.priceItem)
        .set({ verifiedAt: now })
        .where(and(eq(schema.priceItem.sourceId, row.id), isNull(schema.priceItem.archivedAt)));
      await db.update(schema.priceSource).set({ lastCheckedAt: now }).where(eq(schema.priceSource.id, row.id));
      await ctx.log("Aucune mise à jour publiée par la source.");
      return { result: { batchId: batch!.id } };
    }
    const records = await def.parse(fetched.files);
    await ctx.log(`${records.length} références lues dans les ressources.`);
    const batch = await stageBatch(db, { source: row, records, label, trigger: input.trigger === "planifie" ? "planifie" : "actualisation", resources: fetched.resources, jobId: ctx.job.id });
    await ctx.log(`Lot enregistré : ${batchSummary(batch)}.`);
    return { result: { batchId: batch.id } };
  },

  async finished(job, db) {
    const input = job.input as unknown as PriceImportInput;
    const [batch] = await db.select().from(schema.priceImportBatch).where(eq(schema.priceImportBatch.jobId, job.id));
    const name = sourceDefinition(input.sourceKey)?.name ?? input.sourceKey;
    return { title: `${name} : ${batch ? batchSummary(batch) : "terminé"}`, link: "/administration/bibliotheque?vue=sources" };
  },

  async failed(job, db, error) {
    await db
      .update(schema.priceImportBatch)
      .set({ status: "echoue", message: error.slice(0, 500) })
      .where(and(eq(schema.priceImportBatch.jobId, job.id), eq(schema.priceImportBatch.status, "en_cours")));
  },
};
