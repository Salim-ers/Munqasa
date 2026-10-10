/**
 * Dossier d'une affaire : niveau de validation, génération complète par les agents, contrôle indépendant,
 * déclaration de validation professionnelle. La déclaration n'est acceptée qu'au niveau « prêt pour
 * validation professionnelle », documents validés ; elle est datée et liée aux versions des documents.
 */
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { DOSSIER_LEVEL_LABELS } from "../../../shared/dossier.js";
import { dossierGenerationRequest, dossierValidationRequest } from "../../../shared/schemas.js";
import { modelFor } from "../../ai/client.js";
import type { AdminEnv } from "../../auth/guard.js";
import { getDb, schema } from "../../db/index.js";
import { createJob } from "../../jobs/runner.js";
import { auditAction } from "../../services/audit.js";
import { dossierStatus } from "../../services/dossier.js";
import { body, conflict, notFound, uuidParam, ValidationError } from "../validate.js";
import { serializeJob } from "./agents.js";

async function projectOr404(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(schema.project).where(eq(schema.project.id, id));
  if (!row) notFound("Affaire introuvable.");
  return row;
}

/** Dernier traitement d'un type pour l'affaire, avec ses étapes. */
async function latestJob(projectId: string, kind: "generation_dossier" | "controle_qualite") {
  const db = await getDb();
  const [job] = await db
    .select()
    .from(schema.generationJob)
    .where(and(eq(schema.generationJob.projectId, projectId), eq(schema.generationJob.kind, kind)))
    .orderBy(desc(schema.generationJob.createdAt))
    .limit(1);
  if (!job) return null;
  const steps = await db.select().from(schema.generationStep).where(eq(schema.generationStep.jobId, job.id)).orderBy(asc(schema.generationStep.position));
  return serializeJob(job, steps);
}

export const dossierRoutes = new Hono<AdminEnv>()
  .get("/projects/:id/dossier", async (c) => {
    const projectId = uuidParam(c);
    await projectOr404(projectId);
    const db = await getDb();
    const [status, generation, audit, lastAudit, plans] = await Promise.all([
      dossierStatus(db, projectId),
      latestJob(projectId, "generation_dossier"),
      latestJob(projectId, "controle_qualite"),
      db.select().from(schema.dossierAudit).where(eq(schema.dossierAudit.projectId, projectId)).orderBy(desc(schema.dossierAudit.createdAt)).limit(1),
      db
        .select({ id: schema.sourceFile.id, name: schema.sourceFile.originalName, mimeType: schema.sourceFile.mimeType, pageCount: schema.sourceFile.pageCount })
        .from(schema.sourceFile)
        .where(and(eq(schema.sourceFile.projectId, projectId), isNull(schema.sourceFile.deletedAt), inArray(schema.sourceFile.status, ["verifie", "traite"])))
        .orderBy(asc(schema.sourceFile.originalName)),
    ]);
    return c.json({
      status,
      generation,
      audit,
      fixes: lastAudit[0]?.summary.fixes ?? [],
      plans: plans.filter((f) => f.mimeType === "application/pdf" || f.mimeType.startsWith("image/")),
    });
  })
  .post("/projects/:id/dossier/generate", async (c) => {
    const projectId = uuidParam(c);
    await projectOr404(projectId);
    const data = await body(c, dossierGenerationRequest);
    // Modèles et clé vérifiés avant de lancer quoi que ce soit.
    if (data.fileIds.length) await modelFor("extraction");
    await modelFor("generation");
    const db = await getDb();
    const fileIds = [...new Set(data.fileIds)].sort();
    if (fileIds.length) {
      const files = await db
        .select({ id: schema.sourceFile.id })
        .from(schema.sourceFile)
        .where(and(inArray(schema.sourceFile.id, fileIds), eq(schema.sourceFile.projectId, projectId), isNull(schema.sourceFile.deletedAt)));
      if (files.length !== fileIds.length) throw new ValidationError({ fileIds: "Un des plans choisis n’appartient pas à cette affaire." });
    }
    const job = await createJob({
      kind: "generation_dossier",
      projectId,
      input: {
        fileIds,
        lotId: data.lotId,
        detailLevel: data.detailLevel,
        referenceIds: [...new Set(data.referenceIds)].sort(),
        vatRate: data.vatRate,
        instructions: data.instructions,
        withSousDetails: data.withSousDetails,
      },
    });
    await auditAction(c, "dossier.generation", "project", projectId, { plans: fileIds.length, references: data.referenceIds.length, sousDetails: data.withSousDetails });
    return c.json({ job: (await latestJob(projectId, "generation_dossier")) ?? { id: job.id } }, 201);
  })
  .post("/projects/:id/dossier/audit", async (c) => {
    const projectId = uuidParam(c);
    await projectOr404(projectId);
    await createJob({ kind: "controle_qualite", projectId, input: { projectId } });
    await auditAction(c, "dossier.controle", "project", projectId, {});
    return c.json({ job: await latestJob(projectId, "controle_qualite") }, 201);
  })
  .post("/projects/:id/dossier/validate", async (c) => {
    const projectId = uuidParam(c);
    await projectOr404(projectId);
    const data = await body(c, dossierValidationRequest);
    const db = await getDb();
    const status = await dossierStatus(db, projectId);
    const ready = status.criteria.slice(0, 3).every((cr) => cr.met);
    const documentsValidated = status.documents.length > 0 && status.documents.every((d) => d.status === "valide");
    if (!ready) conflict(`Dossier pas encore prêt pour la validation professionnelle : ${status.criteria.filter((cr) => !cr.met && cr.level !== "valide_professionnel").map((cr) => cr.detail).join(", ")}.`);
    if (!documentsValidated) conflict("Validez d’abord le CCTP et la DPGF : la déclaration porte sur leurs versions validées.");
    const statement = `Je soussigné ${data.signedBy}, ${data.qualification}, déclare avoir vérifié le dossier de l’affaire et valider le CCTP et la DPGF dans leurs versions validées, au niveau « ${DOSSIER_LEVEL_LABELS.pret_pour_validation} ». Cette déclaration engage le signataire ; la plateforme ne certifie ni sa qualification ni la conformité réglementaire du dossier.`;
    await db.insert(schema.dossierValidation).values({
      projectId,
      signedBy: data.signedBy,
      qualification: data.qualification,
      statement,
      documents: status.documents.map((d) => ({ type: d.type, id: d.id, title: d.title, version: d.version })),
    });
    await auditAction(c, "dossier.validation_professionnelle", "project", projectId, { signataire: data.signedBy, qualite: data.qualification });
    return c.json({ status: await dossierStatus(db, projectId) });
  });
