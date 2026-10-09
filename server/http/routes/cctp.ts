/**
 * CCTP : rédaction par l'agent, consultation, édition article par article, réécriture ciblée,
 * contrôle qualité, validation (refusée tant qu'une anomalie bloquante est ouverte), versions et export Word.
 * Anomalies du contrôle qualité : consultation, mise de côté motivée, réouverture.
 */
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { COUNTRY_LABELS, DESIGN_PHASE_LABELS } from "../../../shared/enums.js";
import { cctpGenerationRequest, cctpRewriteRequest, cctpSectionUpdate } from "../../../shared/schemas.js";
import { modelFor } from "../../ai/client.js";
import type { CctpBlock } from "../../ai/schemas.js";
import type { AdminEnv } from "../../auth/guard.js";
import { getDb, schema } from "../../db/index.js";
import { cctpToDocx } from "../../exports/cctp-docx.js";
import { createJob } from "../../jobs/runner.js";
import { auditAction } from "../../services/audit.js";
import { checkCctp, hasBlockingIssues, replaceIssues } from "../../services/quality.js";
import { readSetting } from "../../services/settings.js";
import { listVersions, snapshotCctp } from "../../services/versions.js";
import { body, conflict, notFound, uuidParam, ValidationError } from "../validate.js";
import { serializeJob } from "./agents.js";

const doc = schema.cctpDocument;
const sec = schema.cctpSection;

async function loadDocument(id: string) {
  const db = await getDb();
  const [document] = await db.select().from(doc).where(eq(doc.id, id));
  if (!document) notFound("CCTP introuvable.");
  return document;
}

async function rerunChecks(documentId: string) {
  const db = await getDb();
  const document = await loadDocument(documentId);
  await replaceIssues(db, { projectId: document.projectId, documentType: "cctp", documentId }, await checkCctp(db, documentId));
}

async function launch(kind: "generation_cctp", projectId: string, input: Record<string, unknown>) {
  await modelFor("generation");
  const job = await createJob({ kind, projectId, input });
  const db = await getDb();
  const steps = await db.select().from(schema.generationStep).where(eq(schema.generationStep.jobId, job.id)).orderBy(asc(schema.generationStep.position));
  const [fresh] = await db.select().from(schema.generationJob).where(eq(schema.generationJob.id, job.id));
  return serializeJob(fresh ?? job, steps);
}

export const cctpRoutes = new Hono<AdminEnv>()
  .get("/projects/:id/cctp", async (c) => {
    const projectId = uuidParam(c);
    const db = await getDb();
    const documents = await db.select().from(doc).where(eq(doc.projectId, projectId)).orderBy(desc(doc.createdAt));
    const ids = documents.map((d) => d.id);
    const [sections, issues] = ids.length
      ? await Promise.all([
          db.select({ documentId: sec.documentId, status: sec.status, n: count() }).from(sec).where(and(inArray(sec.documentId, ids), eq(sec.kind, "article"))).groupBy(sec.documentId, sec.status),
          db
            .select({ documentId: schema.qualityIssue.documentId, n: count() })
            .from(schema.qualityIssue)
            .where(and(eq(schema.qualityIssue.documentType, "cctp"), inArray(schema.qualityIssue.documentId, ids), eq(schema.qualityIssue.status, "ouverte")))
            .groupBy(schema.qualityIssue.documentId),
        ])
      : [[], []];
    return c.json({
      items: documents.map((d) => {
        const own = sections.filter((s) => s.documentId === d.id);
        return {
          ...d,
          articles: own.reduce((n, s) => n + Number(s.n), 0),
          validatedArticles: own.filter((s) => s.status === "valide").reduce((n, s) => n + Number(s.n), 0),
          openIssues: Number(issues.find((i) => i.documentId === d.id)?.n ?? 0),
        };
      }),
    });
  })
  .post("/projects/:id/cctp", async (c) => {
    const projectId = uuidParam(c);
    const db = await getDb();
    const [project] = await db.select({ id: schema.project.id }).from(schema.project).where(eq(schema.project.id, projectId));
    if (!project) notFound("Affaire introuvable.");
    const data = await body(c, cctpGenerationRequest);
    if (data.lotId) {
      const [lot] = await db.select({ id: schema.projectLot.id }).from(schema.projectLot).where(and(eq(schema.projectLot.id, data.lotId), eq(schema.projectLot.projectId, projectId)));
      if (!lot) throw new ValidationError({ lotId: "Ce lot n’appartient pas à l’affaire." });
    }
    const job = await launch("generation_cctp", projectId, {
      mode: "generation",
      lotId: data.lotId,
      detailLevel: data.detailLevel,
      useMetre: data.useMetre,
      referenceIds: [...new Set(data.referenceIds)].sort(),
      instructions: data.instructions,
    });
    await auditAction(c, "agent.redaction_cctp", "project", projectId, { niveau: data.detailLevel, references: data.referenceIds.length });
    return c.json({ job }, 201);
  })
  .get("/cctp/:id", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const document = await loadDocument(id);
    const sections = await db.select().from(sec).where(eq(sec.documentId, id)).orderBy(asc(sec.position));
    const refIds = [...new Set([...document.referenceIds, ...sections.flatMap((s) => s.referenceIds)])];
    const [references, issues, versions, lot, workItems] = await Promise.all([
      refIds.length ? db.select().from(schema.technicalReference).where(inArray(schema.technicalReference.id, refIds)) : Promise.resolve([]),
      db
        .select()
        .from(schema.qualityIssue)
        .where(and(eq(schema.qualityIssue.documentType, "cctp"), eq(schema.qualityIssue.documentId, id)))
        .orderBy(sql`case ${schema.qualityIssue.severity} when 'bloquante' then 0 when 'majeure' then 1 when 'mineure' then 2 else 3 end`),
      listVersions(db, "cctp", id),
      document.lotId ? db.select().from(schema.projectLot).where(eq(schema.projectLot.id, document.lotId)) : Promise.resolve([]),
      db.select({ id: schema.workItem.id, code: schema.workItem.code, designation: schema.workItem.designation }).from(schema.workItem).where(eq(schema.workItem.projectId, document.projectId)),
    ]);
    return c.json({ document, sections, references, issues, versions, lot: lot[0] ?? null, workItems });
  })
  .patch("/cctp/sections/:id", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const [section] = await db.select().from(sec).where(eq(sec.id, id));
    if (!section) notFound("Article introuvable.");
    const document = await loadDocument(section.documentId);
    const data = await body(c, cctpSectionUpdate);
    // Seules les références retenues pour le document peuvent être citées.
    const allowed = new Set(document.referenceIds);
    const blocks: CctpBlock[] = data.blocks
      .map((b) => ({
        type: b.type,
        text: b.type === "liste" ? null : b.text?.trim() || null,
        items: b.type === "liste" ? b.items.filter(Boolean) : [],
        referenceIds: b.referenceIds.filter((r) => allowed.has(r)),
      }))
      .filter((b) => (b.type === "liste" ? b.items.length > 0 : Boolean(b.text)));
    const [row] = await db
      .update(sec)
      .set({ title: data.title, content: blocks, referenceIds: [...new Set(blocks.flatMap((b) => b.referenceIds))], status: blocks.length ? "a_valider" : "a_rediger", validatedAt: null })
      .where(eq(sec.id, id))
      .returning();
    if (document.status === "valide") await db.update(doc).set({ status: "a_valider" }).where(eq(doc.id, document.id));
    await rerunChecks(document.id);
    await auditAction(c, "cctp.article_modifie", "project", document.projectId, { article: `${row!.number} ${row!.title}` });
    return c.json({ section: row });
  })
  .post("/cctp/sections/:id/validate", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const validated = ((await c.req.json().catch(() => ({}))) as { validated?: boolean }).validated !== false;
    const [section] = await db.select().from(sec).where(eq(sec.id, id));
    if (!section) notFound("Article introuvable.");
    if (validated && (section.content as unknown[]).length === 0) conflict("Un article vide ne peut pas être validé.");
    const [row] = await db
      .update(sec)
      .set({ status: validated ? "valide" : "a_valider", validatedAt: validated ? new Date() : null })
      .where(eq(sec.id, id))
      .returning();
    const document = await loadDocument(section.documentId);
    await auditAction(c, validated ? "cctp.article_valide" : "cctp.article_a_revoir", "project", document.projectId, { article: `${section.number} ${section.title}` });
    return c.json({ section: row });
  })
  .post("/cctp/:id/rewrite", async (c) => {
    const id = uuidParam(c);
    const document = await loadDocument(id);
    const data = await body(c, cctpRewriteRequest);
    const job = await launch("generation_cctp", document.projectId, { mode: "reecriture", documentId: id, sectionIds: [...new Set(data.sectionIds)].sort(), instructions: data.instructions });
    await auditAction(c, "agent.reecriture_cctp", "project", document.projectId, { articles: data.sectionIds.length });
    return c.json({ job }, 201);
  })
  .post("/cctp/:id/check", async (c) => {
    const id = uuidParam(c);
    await rerunChecks(id);
    return c.json({ ok: true });
  })
  .post("/cctp/:id/validate", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    await rerunChecks(id);
    if (await hasBlockingIssues(db, "cctp", id)) conflict("Des anomalies bloquantes restent ouvertes : corrigez-les avant de valider le document.");
    const document = await loadDocument(id);
    await db.update(doc).set({ status: "valide" }).where(eq(doc.id, id));
    const version = await snapshotCctp(db, id, "Version validée", true);
    await auditAction(c, "cctp.valide", "project", document.projectId, { document: document.title, version });
    return c.json({ ok: true, version });
  })
  .post("/cctp/:id/versions", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const document = await loadDocument(id);
    const note = String(((await c.req.json().catch(() => ({}))) as { note?: string }).note ?? "").trim().slice(0, 300) || "Version enregistrée";
    const version = await snapshotCctp(db, id, note);
    await auditAction(c, "cctp.version", "project", document.projectId, { document: document.title, version });
    return c.json({ version }, 201);
  })
  .delete("/cctp/:id", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const document = await loadDocument(id);
    await db.transaction(async (tx) => {
      await tx.delete(schema.qualityIssue).where(and(eq(schema.qualityIssue.documentType, "cctp"), eq(schema.qualityIssue.documentId, id)));
      await tx.delete(schema.documentVersion).where(and(eq(schema.documentVersion.documentType, "cctp"), eq(schema.documentVersion.documentId, id)));
      await tx.delete(doc).where(eq(doc.id, id));
    });
    await auditAction(c, "cctp.suppression", "project", document.projectId, { document: document.title });
    return c.json({ ok: true });
  })
  .get("/cctp/:id/export.docx", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const document = await loadDocument(id);
    const sections = await db.select().from(sec).where(eq(sec.documentId, id)).orderBy(asc(sec.position));
    const [[row], [lot], [company], identity] = await Promise.all([
      db.select({ project: schema.project, client: schema.client }).from(schema.project).leftJoin(schema.client, eq(schema.client.id, schema.project.clientId)).where(eq(schema.project.id, document.projectId)),
      document.lotId ? db.select().from(schema.projectLot).where(eq(schema.projectLot.id, document.lotId)) : Promise.resolve([]),
      db.select().from(schema.companyProfile).orderBy(desc(schema.companyProfile.isDefault)).limit(1),
      readSetting("identite_documentaire"),
    ]);
    const refIds = [...new Set(sections.flatMap((s) => s.referenceIds))];
    const references = refIds.length ? await db.select().from(schema.technicalReference).where(inArray(schema.technicalReference.id, refIds)) : [];
    const buffer = await cctpToDocx({
      title: document.title,
      status: document.status,
      version: document.currentVersion,
      project: {
        reference: row!.project.reference,
        name: row!.project.name,
        city: row!.project.city,
        country: COUNTRY_LABELS[row!.project.country],
        phase: DESIGN_PHASE_LABELS[document.phase],
      },
      client: row!.client?.name ?? null,
      lot: lot ? `${lot.code} ${lot.name}` : null,
      company: company?.legalName ?? null,
      identity,
      sections: sections.map((s) => ({ number: s.number, title: s.title, kind: s.kind, content: s.content as CctpBlock[], referenceIds: s.referenceIds })),
      references: references.map((r) => ({ id: r.id, code: r.code, title: r.title, version: r.version, verified: r.verificationStatus === "verifie" })),
      date: new Date(),
    });
    await auditAction(c, "cctp.export", "project", document.projectId, { document: document.title, format: "docx" });
    const name = `${row!.project.reference} ${document.title}`.replace(/[^\p{L}\p{N} ._-]+/gu, " ").trim();
    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content-disposition": `attachment; filename="cctp.docx"; filename*=UTF-8''${encodeURIComponent(`${name}.docx`)}`,
        "cache-control": "private, no-store",
      },
    });
  });

/** Anomalies du contrôle qualité : mise de côté motivée, réouverture. */
export const qualityRoutes = new Hono<AdminEnv>()
  .post("/:id/ignore", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const note = String(((await c.req.json().catch(() => ({}))) as { note?: string }).note ?? "").trim();
    if (note.length < 3) throw new ValidationError({ note: "Indiquez pourquoi ce point est mis de côté." });
    const [row] = await db.select().from(schema.qualityIssue).where(eq(schema.qualityIssue.id, id));
    if (!row) notFound("Anomalie introuvable.");
    if (row.severity === "bloquante") conflict("Une anomalie bloquante doit être corrigée, pas mise de côté.");
    const [updated] = await db
      .update(schema.qualityIssue)
      .set({ status: "ignoree", resolutionNote: note.slice(0, 1000), resolvedAt: new Date() })
      .where(eq(schema.qualityIssue.id, id))
      .returning();
    await auditAction(c, "qualite.point_ecarte", "project", row.projectId, { motif: note.slice(0, 200) });
    return c.json({ issue: updated });
  })
  .post("/:id/reopen", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const [updated] = await db
      .update(schema.qualityIssue)
      .set({ status: "ouverte", resolutionNote: null, resolvedAt: null })
      .where(eq(schema.qualityIssue.id, id))
      .returning();
    if (!updated) notFound("Anomalie introuvable.");
    return c.json({ issue: updated });
  });
