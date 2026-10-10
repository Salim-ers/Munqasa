/**
 * Agent de contrôle indépendant du dossier (agent 5), sans appel à un modèle :
 * 1. recalculs : quantités du métré, quantités de DPGF reprises du métré, prix reportés des sous-détails
 *    validés, montants, sous-détails ; chaque erreur calculable est corrigée et journalisée ;
 * 2. contrôles : tous les contrôles qualité rejoués (CCTP, DPGF, sous-détails, métré, dossier), contrôle
 *    enregistré avec son empreinte, niveau de validation recalculé.
 */
import { and, eq } from "drizzle-orm";
import type { AuditFix } from "../../../shared/dossier.js";
import { schema } from "../../db/index.js";
import { dossierFingerprint, dossierStatus, recomputeDossier, runDossierChecks } from "../../services/dossier.js";
import type { JobHandler, StepContext } from "../types.js";

/** Étapes du contrôle, réutilisées par la génération du dossier. */
export async function auditStep(name: string, ctx: StepContext): Promise<{ result: unknown }> {
  const { db } = ctx;
  const projectId = ctx.job.projectId!;
  if (name === "recalculs") {
    const { fixes, checked } = await recomputeDossier(db, projectId);
    for (const f of fixes.slice(0, 40)) await ctx.log(`${f.target} : ${f.note}`);
    if (fixes.length > 40) await ctx.log(`${fixes.length - 40} autre(s) correction(s) non détaillée(s) ici.`);
    if (fixes.length === 0) await ctx.log("Aucune erreur de calcul : toutes les valeurs recalculées concordent.");
    return { result: { fixes, checked } };
  }
  const recalcul = (ctx.results.get("recalculs") ?? { fixes: [], checked: { measurements: 0, dpgfLines: 0, breakdowns: 0 } }) as { fixes: AuditFix[]; checked: { measurements: number; dpgfLines: number; breakdowns: number } };
  const { counts, documents } = await runDossierChecks(db, projectId);
  const fingerprint = await dossierFingerprint(db, projectId);
  const [audit] = await db
    .insert(schema.dossierAudit)
    .values({ projectId, jobId: ctx.job.id, summary: { fixes: recalcul.fixes, issues: counts, checked: { ...recalcul.checked, documents }, fingerprint } })
    .returning({ id: schema.dossierAudit.id });
  const status = await dossierStatus(db, projectId, { ignoreJobId: ctx.job.id });
  await ctx.log(`Anomalies ouvertes : ${counts.bloquante} bloquante(s), ${counts.majeure} majeure(s), ${counts.mineure} mineure(s). Niveau : ${status.levelLabel}.`);
  return { result: { auditId: audit!.id, issues: counts, level: status.level, fixes: recalcul.fixes.length } };
}

export const dossierAuditHandler: JobHandler = {
  kind: "controle_qualite",
  title: () => "Contrôle indépendant du dossier",
  stepLabel: (name) => (name === "recalculs" ? "Recalcul des quantités, montants et sous-détails" : name === "controles" ? "Contrôles qualité et niveau de validation" : name),
  initialSteps: () => ["recalculs", "controles"],
  run: (name, ctx) => auditStep(name, ctx),
  async finished(job, db) {
    const [step] = await db
      .select({ result: schema.generationStep.result })
      .from(schema.generationStep)
      .where(and(eq(schema.generationStep.jobId, job.id), eq(schema.generationStep.name, "controles")));
    const r = (step?.result ?? {}) as { issues?: { bloquante: number; majeure: number }; level?: string; fixes?: number };
    const status = job.projectId ? await dossierStatus(db, job.projectId) : null;
    const open = (r.issues?.bloquante ?? 0) + (r.issues?.majeure ?? 0);
    return {
      title: `Contrôle indépendant : ${r.fixes ?? 0} correction(s), ${open} anomalie(s) à traiter${status ? `, niveau « ${status.levelLabel} »` : ""}`,
      link: job.projectId ? `/administration/affaires/${job.projectId}?onglet=dossier` : null,
    };
  },
};
