/**
 * DPGF : établie par l'agent à partir d'un CCTP, puis modifiable ligne par ligne (quantités, prix,
 * désignations), montants recalculés en décimal exact, contrôle qualité, validation, versions, export Excel.
 */
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { dpgfGenerationRequest, dpgfLineInput, dpgfUpdate } from "../../../shared/schemas.js";
import { modelFor } from "../../ai/client.js";
import type { AdminEnv } from "../../auth/guard.js";
import { getDb, schema } from "../../db/index.js";
import { dpgfToXlsx } from "../../exports/dpgf-xlsx.js";
import { createJob } from "../../jobs/runner.js";
import { auditAction } from "../../services/audit.js";
import { computeTotals, lineAmount, renumber } from "../../services/dpgf.js";
import { checkDpgf, hasBlockingIssues, replaceIssues } from "../../services/quality.js";
import { readSetting } from "../../services/settings.js";
import { listVersions, snapshotDpgf } from "../../services/versions.js";
import { body, conflict, notFound, patchBody, uuidParam, ValidationError } from "../validate.js";
import { serializeJob } from "./agents.js";

const d = schema.dpgf;
const l = schema.dpgfLine;

/** Sous-détails dont le poste a disparu (poste ou DPGF supprimés) : ils ne servent plus à rien. */
async function dropOrphanBreakdowns(projectId: string) {
  const db = await getDb();
  await db.delete(schema.priceBreakdown).where(and(eq(schema.priceBreakdown.projectId, projectId), isNull(schema.priceBreakdown.dpgfLineId)));
}

async function loadDpgf(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(d).where(eq(d.id, id));
  if (!row) notFound("DPGF introuvable.");
  return row;
}

async function rerunChecks(dpgfId: string) {
  const db = await getDb();
  const doc = await loadDpgf(dpgfId);
  await replaceIssues(db, { projectId: doc.projectId, documentType: "dpgf", documentId: dpgfId }, await checkDpgf(db, dpgfId));
}

/** Une modification remet un document validé « à valider ». */
async function touch(dpgfId: string) {
  const db = await getDb();
  await db.update(d).set({ status: sql`case when ${d.status} = 'valide' then 'a_valider'::document_status else ${d.status} end` }).where(eq(d.id, dpgfId));
}

export const dpgfRoutes = new Hono<AdminEnv>()
  .get("/projects/:id/dpgf", async (c) => {
    const projectId = uuidParam(c);
    const db = await getDb();
    const documents = await db.select().from(d).where(eq(d.projectId, projectId)).orderBy(desc(d.createdAt));
    const ids = documents.map((x) => x.id);
    const lines = ids.length ? await db.select().from(l).where(inArray(l.dpgfId, ids)) : [];
    const issues = ids.length
      ? await db
          .select({ documentId: schema.qualityIssue.documentId, n: count() })
          .from(schema.qualityIssue)
          .where(and(eq(schema.qualityIssue.documentType, "dpgf"), inArray(schema.qualityIssue.documentId, ids), eq(schema.qualityIssue.status, "ouverte")))
          .groupBy(schema.qualityIssue.documentId)
      : [];
    return c.json({
      items: documents.map((doc) => {
        const totals = computeTotals(
          lines.filter((x) => x.dpgfId === doc.id),
          doc.vatRate,
        );
        return { ...doc, postes: totals.postes, priced: totals.priced, totalHt: totals.totalHt, openIssues: Number(issues.find((i) => i.documentId === doc.id)?.n ?? 0) };
      }),
    });
  })
  .post("/projects/:id/dpgf", async (c) => {
    const projectId = uuidParam(c);
    const db = await getDb();
    const data = await body(c, dpgfGenerationRequest);
    const [cctp] = await db.select().from(schema.cctpDocument).where(and(eq(schema.cctpDocument.id, data.cctpDocumentId), eq(schema.cctpDocument.projectId, projectId)));
    if (!cctp) throw new ValidationError({ cctpDocumentId: "Ce CCTP n’appartient pas à l’affaire." });
    const [sections] = await db.select({ n: count() }).from(schema.cctpSection).where(and(eq(schema.cctpSection.documentId, cctp.id), eq(schema.cctpSection.kind, "article")));
    if (Number(sections?.n ?? 0) === 0) conflict("Ce CCTP ne contient aucun article.");
    await modelFor("generation");
    const job = await createJob({ kind: "generation_dpgf", projectId, input: { cctpDocumentId: cctp.id, vatRate: data.vatRate, instructions: data.instructions } });
    const steps = await db.select().from(schema.generationStep).where(eq(schema.generationStep.jobId, job.id)).orderBy(asc(schema.generationStep.position));
    const [fresh] = await db.select().from(schema.generationJob).where(eq(schema.generationJob.id, job.id));
    await auditAction(c, "agent.dpgf", "project", projectId, { document: cctp.title });
    return c.json({ job: serializeJob(fresh ?? job, steps) }, 201);
  })
  .get("/dpgf/:id", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const doc = await loadDpgf(id);
    const lines = await db.select().from(l).where(eq(l.dpgfId, id)).orderBy(asc(l.position));
    const [issues, versions, cctp, lot] = await Promise.all([
      db
        .select()
        .from(schema.qualityIssue)
        .where(and(eq(schema.qualityIssue.documentType, "dpgf"), eq(schema.qualityIssue.documentId, id)))
        .orderBy(sql`case ${schema.qualityIssue.severity} when 'bloquante' then 0 when 'majeure' then 1 when 'mineure' then 2 else 3 end`),
      listVersions(db, "dpgf", id),
      doc.cctpDocumentId ? db.select({ id: schema.cctpDocument.id, title: schema.cctpDocument.title }).from(schema.cctpDocument).where(eq(schema.cctpDocument.id, doc.cctpDocumentId)) : Promise.resolve([]),
      doc.lotId ? db.select().from(schema.projectLot).where(eq(schema.projectLot.id, doc.lotId)) : Promise.resolve([]),
    ]);
    return c.json({ dpgf: doc, lines, totals: computeTotals(lines, doc.vatRate), issues, versions, cctp: cctp[0] ?? null, lot: lot[0] ?? null });
  })
  .patch("/dpgf/:id", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const doc = await loadDpgf(id);
    const data = await patchBody(c, dpgfUpdate);
    const [row] = await db.update(d).set(data).where(eq(d.id, id)).returning();
    await touch(id);
    await auditAction(c, "dpgf.modification", "project", doc.projectId, { document: row!.title, champs: Object.keys(data) });
    return c.json({ dpgf: row });
  })
  .post("/dpgf/:id/lines", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const doc = await loadDpgf(id);
    const data = await body(c, dpgfLineInput);
    if (data.parentId) {
      const [parent] = await db.select().from(l).where(and(eq(l.id, data.parentId), eq(l.dpgfId, id)));
      if (!parent) throw new ValidationError({ parentId: "Chapitre introuvable." });
      if (parent.kind === "poste") throw new ValidationError({ parentId: "Un poste ne peut pas contenir d’autres lignes." });
    } else if (data.kind !== "chapitre") {
      throw new ValidationError({ parentId: "Choisissez le chapitre de cette ligne." });
    }
    const [{ last } = { last: 0 }] = await db.select({ last: sql<number>`coalesce(max(${l.position}), 0)::int` }).from(l).where(eq(l.dpgfId, id));
    const isPoste = data.kind === "poste";
    const [row] = await db
      .insert(l)
      .values({
        dpgfId: id,
        parentId: data.parentId,
        position: Number(last) + 1,
        kind: data.kind,
        designation: data.designation,
        description: data.description,
        unit: isPoste ? data.unit : null,
        quantity: isPoste ? data.quantity : null,
        unitPrice: isPoste ? data.unitPrice : null,
        amount: isPoste ? lineAmount(data.quantity, data.unitPrice) : null,
        quantitySource: isPoste && data.quantity ? "Saisie" : null,
        priceSource: isPoste && data.unitPrice ? "Saisie" : null,
        cctpRef: data.cctpRef,
        status: isPoste && data.unitPrice ? "a_verifier" : "non_chiffre",
      })
      .returning();
    await renumber(db, id);
    await touch(id);
    await rerunChecks(id);
    await auditAction(c, "dpgf.ligne_ajoutee", "project", doc.projectId, { ligne: row!.designation });
    return c.json({ line: row }, 201);
  })
  .patch("/dpgf/lines/:id", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const [line] = await db.select().from(l).where(eq(l.id, id));
    if (!line) notFound("Ligne introuvable.");
    const doc = await loadDpgf(line.dpgfId);
    const data = await patchBody(c, dpgfLineInput);
    const { kind: _kind, parentId: _parent, ...fields } = data;
    const quantity = "quantity" in fields ? (fields.quantity ?? null) : line.quantity;
    const unitPrice = "unitPrice" in fields ? (fields.unitPrice ?? null) : line.unitPrice;
    const isPoste = line.kind === "poste";
    const [row] = await db
      .update(l)
      .set({
        ...fields,
        ...(isPoste
          ? {
              amount: lineAmount(quantity, unitPrice),
              ...("quantity" in fields && fields.quantity !== line.quantity ? { quantitySource: "Saisie", measurementId: null } : {}),
              ...("unitPrice" in fields && fields.unitPrice !== line.unitPrice ? { priceSource: unitPrice ? "Saisie" : null, priceItemId: null } : {}),
              status: unitPrice ? "a_verifier" : "non_chiffre",
            }
          : { unit: null, quantity: null, unitPrice: null, amount: null }),
      })
      .where(eq(l.id, id))
      .returning();
    await touch(line.dpgfId);
    await rerunChecks(line.dpgfId);
    await auditAction(c, "dpgf.ligne_modifiee", "project", doc.projectId, { ligne: row!.designation, champs: Object.keys(fields) });
    return c.json({ line: row });
  })
  .post("/dpgf/lines/:id/validate", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const validated = ((await c.req.json().catch(() => ({}))) as { validated?: boolean }).validated !== false;
    const [line] = await db.select().from(l).where(eq(l.id, id));
    if (!line) notFound("Ligne introuvable.");
    if (validated && (line.kind !== "poste" || line.quantity === null || line.unitPrice === null)) conflict("Seul un poste avec quantité et prix unitaire peut être validé.");
    const [row] = await db
      .update(l)
      .set({ status: validated ? "valide" : line.unitPrice ? "a_verifier" : "non_chiffre" })
      .where(eq(l.id, id))
      .returning();
    const doc = await loadDpgf(line.dpgfId);
    await auditAction(c, validated ? "dpgf.ligne_validee" : "dpgf.ligne_a_revoir", "project", doc.projectId, { ligne: line.designation });
    return c.json({ line: row });
  })
  .delete("/dpgf/lines/:id", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const [line] = await db.select().from(l).where(eq(l.id, id));
    if (!line) notFound("Ligne introuvable.");
    const doc = await loadDpgf(line.dpgfId);
    await db.delete(l).where(eq(l.id, id));
    await dropOrphanBreakdowns(doc.projectId);
    await renumber(db, line.dpgfId);
    await touch(line.dpgfId);
    await rerunChecks(line.dpgfId);
    await auditAction(c, "dpgf.ligne_supprimee", "project", doc.projectId, { ligne: line.designation });
    return c.json({ ok: true });
  })
  .post("/dpgf/:id/check", async (c) => {
    await rerunChecks(uuidParam(c));
    return c.json({ ok: true });
  })
  .post("/dpgf/:id/validate", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    await rerunChecks(id);
    if (await hasBlockingIssues(db, "dpgf", id)) conflict("Des anomalies bloquantes restent ouvertes : corrigez-les avant de valider la DPGF.");
    const doc = await loadDpgf(id);
    await db.update(d).set({ status: "valide" }).where(eq(d.id, id));
    const version = await snapshotDpgf(db, id, "Version validée", true);
    await auditAction(c, "dpgf.validee", "project", doc.projectId, { document: doc.title, version });
    return c.json({ ok: true, version });
  })
  .post("/dpgf/:id/versions", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const doc = await loadDpgf(id);
    const note = String(((await c.req.json().catch(() => ({}))) as { note?: string }).note ?? "").trim().slice(0, 300) || "Version enregistrée";
    const version = await snapshotDpgf(db, id, note);
    await auditAction(c, "dpgf.version", "project", doc.projectId, { document: doc.title, version });
    return c.json({ version }, 201);
  })
  .delete("/dpgf/:id", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const doc = await loadDpgf(id);
    await db.transaction(async (tx) => {
      await tx.delete(schema.qualityIssue).where(and(eq(schema.qualityIssue.documentType, "dpgf"), eq(schema.qualityIssue.documentId, id)));
      await tx.delete(schema.qualityIssue).where(and(eq(schema.qualityIssue.documentType, "sous_detail"), eq(schema.qualityIssue.documentId, id)));
      await tx.delete(schema.documentVersion).where(and(eq(schema.documentVersion.documentType, "dpgf"), eq(schema.documentVersion.documentId, id)));
      await tx.delete(d).where(eq(d.id, id));
    });
    await dropOrphanBreakdowns(doc.projectId);
    await auditAction(c, "dpgf.suppression", "project", doc.projectId, { document: doc.title });
    return c.json({ ok: true });
  })
  .get("/dpgf/:id/export.xlsx", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const doc = await loadDpgf(id);
    const lines = await db.select().from(l).where(eq(l.dpgfId, id)).orderBy(asc(l.position));
    const [[row], [lot], [company], identity] = await Promise.all([
      db.select({ project: schema.project, client: schema.client }).from(schema.project).leftJoin(schema.client, eq(schema.client.id, schema.project.clientId)).where(eq(schema.project.id, doc.projectId)),
      doc.lotId ? db.select().from(schema.projectLot).where(eq(schema.projectLot.id, doc.lotId)) : Promise.resolve([]),
      db.select().from(schema.companyProfile).orderBy(desc(schema.companyProfile.isDefault)).limit(1),
      readSetting("identite_documentaire"),
    ]);
    const buffer = await dpgfToXlsx({
      title: doc.title,
      status: doc.status,
      version: doc.currentVersion,
      currency: doc.currency,
      vatRate: doc.vatRate,
      project: { reference: row!.project.reference, name: row!.project.name },
      client: row!.client?.name ?? null,
      lot: lot ? `${lot.code} ${lot.name}` : null,
      company: company?.legalName ?? null,
      identity,
      lines,
      totals: computeTotals(lines, doc.vatRate),
      date: new Date(),
    });
    await auditAction(c, "dpgf.export", "project", doc.projectId, { document: doc.title, format: "xlsx" });
    const name = `${row!.project.reference} ${doc.title}`.replace(/[^\p{L}\p{N} ._-]+/gu, " ").trim();
    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="dpgf.xlsx"; filename*=UTF-8''${encodeURIComponent(`${name}.xlsx`)}`,
        "cache-control": "private, no-store",
      },
    });
  });
