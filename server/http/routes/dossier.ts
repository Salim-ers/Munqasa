/**
 * Dossier d'une affaire : niveau de validation, génération par les agents des documents demandés, contrôle
 * indépendant, contrôle avant export, déclaration de validation professionnelle. La déclaration n'est
 * acceptée qu'au niveau « prêt pour validation professionnelle », documents validés ; elle est datée et liée
 * aux versions des documents.
 */
import { and, asc, desc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { Hono } from "hono";
import { DOSSIER_LEVEL_LABELS, type GenerationDocument } from "../../../shared/dossier.js";
import { CONSENT_MESSAGE, dossierGenerationRequest, dossierValidationRequest } from "../../../shared/schemas.js";
import { modelFor } from "../../ai/client.js";
import type { AdminEnv } from "../../auth/guard.js";
import { getDb, schema } from "../../db/index.js";
import { createJob } from "../../jobs/runner.js";
import type { DossierLot } from "../../jobs/handlers/dossier.js";
import { auditAction } from "../../services/audit.js";
import { dossierStatus } from "../../services/dossier.js";
import { dossierExportAudit } from "../../services/export-audit.js";
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
  /** Contrôle avant export : contrôles qualité rejoués, quinze points, état du contrôle des fichiers produits. */
  .get("/projects/:id/dossier/export-audit", async (c) => {
    const projectId = uuidParam(c);
    await projectOr404(projectId);
    const db = await getDb();
    return c.json({ audit: await dossierExportAudit(db, projectId) });
  })
  .post("/projects/:id/dossier/generate", async (c) => {
    const projectId = uuidParam(c);
    await projectOr404(projectId);
    const data = await body(c, dossierGenerationRequest);
    const db = await getDb();
    const documents = [...new Set<GenerationDocument>(data.documents ?? [...(data.fileIds.length ? (["metre"] as const) : []), "cctp", "dpgf", ...(data.withSousDetails ? (["sous_details"] as const) : [])])];
    const has = (d: GenerationDocument) => documents.includes(d);
    // Plans : lus seulement pour établir le métré.
    const fileIds = has("metre") ? [...new Set(data.fileIds)].sort() : [];
    if (has("metre") && fileIds.length === 0) throw new ValidationError({ fileIds: "Choisissez les plans à lire pour établir le métré." });

    // Lots couverts, dans l'ordre de l'affaire ; documents déjà établis repris quand ils ne sont pas demandés.
    const lotRows = await db.select().from(schema.projectLot).where(eq(schema.projectLot.projectId, projectId)).orderBy(asc(schema.projectLot.position), asc(schema.projectLot.code));
    const requested = data.lotIds?.length ? [...new Set(data.lotIds)] : data.lotId ? [data.lotId] : [];
    if (requested.some((id) => !lotRows.some((l) => l.id === id))) throw new ValidationError({ lotIds: "Un des lots choisis n’appartient pas à cette affaire." });
    const chosen = requested.length ? lotRows.filter((l) => requested.includes(l.id)) : [null];
    const lots: DossierLot[] = [];
    const missing: string[] = [];
    for (const lot of chosen) {
      const name = lot ? `le lot ${lot.code} ${lot.name}` : "l’affaire";
      const scope = (column: typeof schema.cctpDocument.lotId | typeof schema.dpgf.lotId) => (lot ? eq(column, lot.id) : isNull(column));
      let cctpId: string | null = null;
      let dpgfId: string | null = null;
      if (has("dpgf") && !has("cctp")) {
        const [cctp] = await db
          .select({ id: schema.cctpDocument.id })
          .from(schema.cctpDocument)
          .where(and(eq(schema.cctpDocument.projectId, projectId), scope(schema.cctpDocument.lotId), notInArray(schema.cctpDocument.status, ["archive", "en_generation"])))
          .orderBy(desc(schema.cctpDocument.updatedAt))
          .limit(1);
        if (cctp) cctpId = cctp.id;
        else missing.push(`aucun CCTP pour ${name} : ajoutez le CCTP aux documents à produire`);
      }
      if ((has("sous_details") || has("prix") || has("devis")) && !has("dpgf")) {
        const [dpgf] = await db
          .select({ id: schema.dpgf.id })
          .from(schema.dpgf)
          .where(and(eq(schema.dpgf.projectId, projectId), scope(schema.dpgf.lotId), notInArray(schema.dpgf.status, ["archive", "en_generation"])))
          .orderBy(desc(schema.dpgf.updatedAt))
          .limit(1);
        if (dpgf) dpgfId = dpgf.id;
        else missing.push(`aucune DPGF pour ${name} : ajoutez la DPGF aux documents à produire`);
      }
      lots.push({ lotId: lot?.id ?? null, label: lot ? `lot ${lot.code} ${lot.name}` : null, cctpId, dpgfId });
    }
    if (missing.length) {
      const text = missing.join(" ; ");
      throw new ValidationError({ documents: `${text.charAt(0).toUpperCase()}${text.slice(1)}.` });
    }

    // Accord d'envoi, clé et modèles vérifiés seulement si un agent doit être appelé : un devis repris
    // d'une DPGF existante ne sollicite aucun modèle.
    const usesAi = documents.some((d) => d !== "devis");
    if (usesAi && data.consent !== true) throw new ValidationError({ consent: CONSENT_MESSAGE });
    if (has("metre")) await modelFor("extraction");
    if (usesAi) await modelFor("generation");
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
        lotId: lots[0]?.lotId ?? null,
        lots: lots as unknown as Record<string, unknown>[],
        documents,
        detailLevel: data.detailLevel,
        referenceIds: [...new Set(data.referenceIds)].sort(),
        vatRate: data.vatRate,
        instructions: data.instructions,
        withSousDetails: has("sous_details"),
      },
    });
    await auditAction(c, "dossier.generation", "project", projectId, { documents, lots: lots.length, plans: fileIds.length, references: data.referenceIds.length });
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
