/** Affaires : création (référence automatique), liste, fiche, lots, historique. */
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, ne, notInArray, or, type SQL, sql } from "drizzle-orm";
import { Hono } from "hono";
import { PROJECT_STATUSES, type ProjectStatus } from "../../../shared/enums.js";
import { deadlineInput, listQuery, projectInput, projectLotInput, projectPatch } from "../../../shared/schemas.js";
import type { AdminEnv } from "../../auth/guard.js";
import { getDb, schema } from "../../db/index.js";
import { auditAction } from "../../services/audit.js";
import { nextReference } from "../../services/references.js";
import { body, conflict, notFound, parse, patchBody, uuidParam } from "../validate.js";

const p = schema.project;

/** Les schémas partagés transportent les dates en ISO ; la base attend des Date. */
function projectValues<T extends { submissionDeadline?: string | null }>(data: T) {
  const { submissionDeadline, ...rest } = data;
  return submissionDeadline === undefined ? rest : { ...rest, submissionDeadline: submissionDeadline ? new Date(submissionDeadline) : null };
}

export const projectRoutes = new Hono<AdminEnv>()
  .get("/", async (c) => {
    const db = await getDb();
    const q = parse(listQuery, c.req.query());
    const filters: SQL[] = [];
    const status = c.req.query("statut");
    if (status && (PROJECT_STATUSES as readonly string[]).includes(status)) filters.push(eq(p.status, status as ProjectStatus));
    else if (c.req.query("archives") !== "1") filters.push(ne(p.status, "archive"));
    const country = c.req.query("pays");
    if (country === "MA" || country === "FR") filters.push(eq(p.country, country));
    const clientId = c.req.query("client");
    if (clientId && /^[0-9a-f-]{36}$/i.test(clientId)) filters.push(eq(p.clientId, clientId));
    if (q.q) {
      const like = `%${q.q}%`;
      filters.push(or(ilike(p.name, like), ilike(p.reference, like), ilike(p.city, like), ilike(schema.client.name, like))!);
    }
    const where = filters.length ? and(...filters) : undefined;
    const sortColumn =
      q.sort === "reference" ? p.reference : q.sort === "nom" ? p.name : q.sort === "echeance" ? p.submissionDeadline : q.sort === "statut" ? p.status : p.updatedAt;
    const [rows, total] = await Promise.all([
      db
        .select({
          id: p.id,
          reference: p.reference,
          name: p.name,
          status: p.status,
          country: p.country,
          city: p.city,
          currency: p.currency,
          marketType: p.marketType,
          sector: p.sector,
          submissionDeadline: p.submissionDeadline,
          manualEstimate: p.manualEstimate,
          updatedAt: p.updatedAt,
          clientId: p.clientId,
          clientName: schema.client.name,
          lotCount: sql<number>`(select count(*)::int from project_lot pl where pl.project_id = "project"."id")`,
        })
        .from(p)
        .leftJoin(schema.client, eq(schema.client.id, p.clientId))
        .where(where)
        .orderBy(q.dir === "asc" ? sql`${sortColumn} asc nulls last` : sql`${sortColumn} desc nulls last`)
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      db.select({ n: count() }).from(p).leftJoin(schema.client, eq(schema.client.id, p.clientId)).where(where),
    ]);
    return c.json({ items: rows, total: Number(total[0]?.n ?? 0), page: q.page, pageSize: q.pageSize });
  })
  .post("/", async (c) => {
    const db = await getDb();
    const data = await body(c, projectInput);
    if (data.clientId) {
      const [client] = await db.select({ id: schema.client.id }).from(schema.client).where(eq(schema.client.id, data.clientId));
      if (!client) notFound("Client introuvable.");
    }
    const reference = await nextReference(db, "project", "TAL");
    const [row] = await db.insert(p).values({ ...projectValues(data), reference, lastOpenedAt: new Date() }).returning();
    // La date de remise apparaît d'elle-même dans l'agenda (lue sur l'affaire, jamais recopiée).
    await auditAction(c, "affaire.creation", "project", row!.id, { reference, nom: row!.name });
    return c.json({ project: row }, 201);
  })
  .get("/:id", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const [row] = await db.select({ project: p, client: schema.client }).from(p).leftJoin(schema.client, eq(schema.client.id, p.clientId)).where(eq(p.id, id));
    if (!row) notFound("Affaire introuvable.");
    const [lots, deadlines, files, counts] = await Promise.all([
      db.select().from(schema.projectLot).where(eq(schema.projectLot.projectId, id)).orderBy(asc(schema.projectLot.position), asc(schema.projectLot.code)),
      db.select().from(schema.deadline).where(eq(schema.deadline.projectId, id)).orderBy(asc(schema.deadline.dueAt)),
      db
        .select({ kind: schema.sourceFile.kind, n: count() })
        .from(schema.sourceFile)
        // Fichiers utilisables seulement (ni en attente d'envoi, ni refusés).
        .where(and(eq(schema.sourceFile.projectId, id), isNull(schema.sourceFile.deletedAt), notInArray(schema.sourceFile.status, ["en_attente", "rejete"])))
        .groupBy(schema.sourceFile.kind),
      db
        .select({ n: count() })
        .from(schema.qualityIssue)
        .where(and(eq(schema.qualityIssue.projectId, id), eq(schema.qualityIssue.status, "ouverte"))),
    ]);
    return c.json({
      project: row.project,
      client: row.client,
      lots,
      deadlines,
      fileCounts: files.map((f) => ({ kind: f.kind, count: Number(f.n) })),
      openIssues: Number(counts[0]?.n ?? 0),
    });
  })
  .patch("/:id", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const data = await patchBody(c, projectPatch);
    if (data.clientId) {
      const [client] = await db.select({ id: schema.client.id }).from(schema.client).where(eq(schema.client.id, data.clientId));
      if (!client) notFound("Client introuvable.");
    }
    const [row] = await db
      .update(p)
      .set({ ...projectValues(data), ...(data.status === "archive" ? { archivedAt: new Date() } : data.status ? { archivedAt: null } : {}) })
      .where(eq(p.id, id))
      .returning();
    if (!row) notFound("Affaire introuvable.");
    await auditAction(c, data.status ? "affaire.changement_statut" : "affaire.modification", "project", id, { champs: Object.keys(data), statut: data.status });
    return c.json({ project: row });
  })
  .post("/:id/open", async (c) => {
    // « Reprendre mon travail » : dernière ouverture.
    const db = await getDb();
    const id = uuidParam(c);
    await db.update(p).set({ lastOpenedAt: new Date() }).where(eq(p.id, id));
    return c.json({ ok: true });
  })
  .get("/:id/history", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const rows = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, id))
      .orderBy(desc(schema.auditLog.occurredAt))
      .limit(200);
    return c.json({ entries: rows });
  })
  /* ---------- Lots ---------- */
  .post("/:id/lots", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const data = await body(c, projectLotInput);
    const [exists] = await db
      .select({ id: schema.projectLot.id })
      .from(schema.projectLot)
      .where(and(eq(schema.projectLot.projectId, id), eq(schema.projectLot.code, data.code)));
    if (exists) conflict(`Le lot ${data.code} existe déjà dans cette affaire.`);
    const [{ max } = { max: 0 }] = await db
      .select({ max: sql<number>`coalesce(max(${schema.projectLot.position}), 0)::int` })
      .from(schema.projectLot)
      .where(eq(schema.projectLot.projectId, id));
    const [row] = await db
      .insert(schema.projectLot)
      .values({ ...data, projectId: id, position: Number(max) + 1 })
      .returning();
    await auditAction(c, "affaire.lot_ajoute", "project", id, { lot: `${data.code} ${data.name}` });
    return c.json({ lot: row }, 201);
  })
  .patch("/:id/lots/:lotId", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const lotId = uuidParam(c, "lotId");
    const data = await patchBody(c, projectLotInput);
    const [row] = await db
      .update(schema.projectLot)
      .set(data)
      .where(and(eq(schema.projectLot.id, lotId), eq(schema.projectLot.projectId, id)))
      .returning();
    if (!row) notFound("Lot introuvable.");
    await auditAction(c, "affaire.lot_modifie", "project", id, { lot: row.code });
    return c.json({ lot: row });
  })
  .delete("/:id/lots/:lotId", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const lotId = uuidParam(c, "lotId");
    // Un lot déjà utilisé par un document (CCTP, DPGF, ouvrages) ne peut pas être supprimé.
    const [used] = await db
      .select({ n: count() })
      .from(schema.workItem)
      .where(eq(schema.workItem.lotId, lotId));
    if (Number(used?.n ?? 0) > 0) conflict("Ce lot contient déjà des ouvrages : il ne peut pas être supprimé.");
    const [row] = await db
      .delete(schema.projectLot)
      .where(and(eq(schema.projectLot.id, lotId), eq(schema.projectLot.projectId, id)))
      .returning();
    if (!row) notFound("Lot introuvable.");
    await auditAction(c, "affaire.lot_supprime", "project", id, { lot: row.code });
    return c.json({ ok: true });
  });

/** Agenda : échéances libres et dates de remise des affaires. */
export const deadlineRoutes = new Hono<AdminEnv>()
  .get("/", async (c) => {
    const db = await getDb();
    const from = c.req.query("du") ? new Date(String(c.req.query("du"))) : new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const to = c.req.query("au") ? new Date(String(c.req.query("au"))) : new Date(Date.now() + 120 * 24 * 3600 * 1000);
    const includeDone = c.req.query("faites") === "1";
    const [items, submissions] = await Promise.all([
      db
        .select({ deadline: schema.deadline, projectReference: p.reference, projectName: p.name })
        .from(schema.deadline)
        .leftJoin(p, eq(p.id, schema.deadline.projectId))
        .where(and(gte(schema.deadline.dueAt, from), lte(schema.deadline.dueAt, to), includeDone ? undefined : isNull(schema.deadline.doneAt)))
        .orderBy(asc(schema.deadline.dueAt)),
      db
        .select({ id: p.id, reference: p.reference, name: p.name, dueAt: p.submissionDeadline, status: p.status })
        .from(p)
        .where(and(gte(p.submissionDeadline, from), lte(p.submissionDeadline, to), inArray(p.status, ["brouillon", "analyse", "etude_technique", "chiffrage", "controle_qualite", "pret_a_remettre"])))
        .orderBy(asc(p.submissionDeadline)),
    ]);
    return c.json({
      items: items.map((r) => ({ ...r.deadline, projectReference: r.projectReference, projectName: r.projectName })),
      submissions,
    });
  })
  .post("/", async (c) => {
    const db = await getDb();
    const data = await body(c, deadlineInput);
    const [row] = await db.insert(schema.deadline).values({ ...data, dueAt: new Date(data.dueAt) }).returning();
    // Rattachée à une affaire, l'échéance figure dans l'historique de celle-ci.
    await auditAction(c, "echeance.creation", row!.projectId ? "project" : "deadline", row!.projectId ?? row!.id, { titre: row!.title, echeance: row!.id });
    return c.json({ deadline: row }, 201);
  })
  .patch("/:id", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const data = await patchBody(c, deadlineInput);
    const [row] = await db
      .update(schema.deadline)
      .set({ ...data, dueAt: data.dueAt ? new Date(data.dueAt) : undefined })
      .where(eq(schema.deadline.id, id))
      .returning();
    if (!row) notFound("Échéance introuvable.");
    await auditAction(c, "echeance.modification", row.projectId ? "project" : "deadline", row.projectId ?? id, { titre: row.title, echeance: id });
    return c.json({ deadline: row });
  })
  .post("/:id/done", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const done = ((await c.req.json().catch(() => ({}))) as { done?: boolean }).done !== false;
    const [row] = await db
      .update(schema.deadline)
      .set({ doneAt: done ? new Date() : null })
      .where(eq(schema.deadline.id, id))
      .returning();
    if (!row) notFound("Échéance introuvable.");
    await auditAction(c, done ? "echeance.terminee" : "echeance.rouverte", row.projectId ? "project" : "deadline", row.projectId ?? id, { titre: row.title, echeance: id });
    return c.json({ deadline: row });
  })
  .delete("/:id", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const [row] = await db.delete(schema.deadline).where(eq(schema.deadline.id, id)).returning();
    if (!row) notFound("Échéance introuvable.");
    await auditAction(c, "echeance.suppression", row.projectId ? "project" : "deadline", row.projectId ?? id, { titre: row.title, echeance: id });
    return c.json({ ok: true });
  });
