/** Clients et prospects : listes paginées, création, modification, archivage, conversion. */
import { and, asc, count, desc, eq, ilike, isNotNull, isNull, or, type SQL, sql } from "drizzle-orm";
import { Hono } from "hono";
import { clientInput, listQuery, prospectInput } from "../../../shared/schemas.js";
import type { AdminEnv } from "../../auth/guard.js";
import { getDb, schema } from "../../db/index.js";
import { auditAction } from "../../services/audit.js";
import { body, conflict, notFound, parse, patchBody, uuidParam } from "../validate.js";

const c_ = schema.client;
const p_ = schema.prospect;

const projectCount = sql<number>`(select count(*)::int from ${schema.project} where ${schema.project.clientId} = ${c_.id})`.as("project_count");

export const clientRoutes = new Hono<AdminEnv>()
  .get("/", async (c) => {
    const db = await getDb();
    const q = parse(listQuery, c.req.query());
    const archived = c.req.query("archives") === "1";
    const filters: SQL[] = [archived ? isNotNull(c_.archivedAt) : isNull(c_.archivedAt)];
    if (q.q) {
      const like = `%${q.q}%`;
      filters.push(or(ilike(c_.name, like), ilike(c_.city, like), ilike(c_.contactName, like), ilike(c_.email, like))!);
    }
    const sortColumn = q.sort === "nom" ? c_.name : q.sort === "pays" ? c_.country : c_.createdAt;
    const order = q.dir === "asc" ? asc(sortColumn) : desc(sortColumn);
    const where = and(...filters);
    const [rows, total] = await Promise.all([
      db
        .select({ client: c_, projectCount })
        .from(c_)
        .where(where)
        .orderBy(order)
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      db.select({ n: count() }).from(c_).where(where),
    ]);
    return c.json({ items: rows.map((r) => ({ ...r.client, projectCount: Number(r.projectCount) })), total: Number(total[0]?.n ?? 0), page: q.page, pageSize: q.pageSize });
  })
  .get("/options", async (c) => {
    // Liste courte pour les sélecteurs (affaires, devis).
    const db = await getDb();
    const rows = await db.select({ id: c_.id, name: c_.name, country: c_.country, sector: c_.sector }).from(c_).where(isNull(c_.archivedAt)).orderBy(asc(c_.name)).limit(500);
    return c.json({ items: rows });
  })
  .get("/:id", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const [row] = await db.select().from(c_).where(eq(c_.id, id));
    if (!row) notFound();
    const projects = await db
      .select({ id: schema.project.id, reference: schema.project.reference, name: schema.project.name, status: schema.project.status, submissionDeadline: schema.project.submissionDeadline })
      .from(schema.project)
      .where(eq(schema.project.clientId, id))
      .orderBy(desc(schema.project.createdAt));
    return c.json({ client: row, projects });
  })
  .post("/", async (c) => {
    const db = await getDb();
    const data = await body(c, clientInput);
    const [row] = await db.insert(c_).values(data).returning();
    await auditAction(c, "client.creation", "client", row!.id, { nom: row!.name });
    return c.json({ client: row }, 201);
  })
  .patch("/:id", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const data = await patchBody(c, clientInput);
    const [row] = await db.update(c_).set(data).where(eq(c_.id, id)).returning();
    if (!row) notFound();
    await auditAction(c, "client.modification", "client", id, { champs: Object.keys(data) });
    return c.json({ client: row });
  })
  .post("/:id/archive", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const [row] = await db.update(c_).set({ archivedAt: new Date() }).where(eq(c_.id, id)).returning();
    if (!row) notFound();
    await auditAction(c, "client.archivage", "client", id);
    return c.json({ client: row });
  })
  .post("/:id/restore", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const [row] = await db.update(c_).set({ archivedAt: null }).where(eq(c_.id, id)).returning();
    if (!row) notFound();
    await auditAction(c, "client.restauration", "client", id);
    return c.json({ client: row });
  });

export const prospectRoutes = new Hono<AdminEnv>()
  .get("/", async (c) => {
    const db = await getDb();
    const q = parse(listQuery, c.req.query());
    const status = c.req.query("statut");
    const filters: SQL[] = [];
    if (q.q) {
      const like = `%${q.q}%`;
      filters.push(or(ilike(p_.name, like), ilike(p_.company, like), ilike(p_.city, like), ilike(p_.email, like))!);
    }
    if (status && ["nouveau", "qualifie", "converti", "perdu"].includes(status)) filters.push(eq(p_.status, status as "nouveau"));
    const where = filters.length ? and(...filters) : undefined;
    const sortColumn = q.sort === "nom" ? p_.name : q.sort === "statut" ? p_.status : p_.createdAt;
    const [rows, total] = await Promise.all([
      db
        .select()
        .from(p_)
        .where(where)
        .orderBy(q.dir === "asc" ? asc(sortColumn) : desc(sortColumn))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      db.select({ n: count() }).from(p_).where(where),
    ]);
    return c.json({ items: rows, total: Number(total[0]?.n ?? 0), page: q.page, pageSize: q.pageSize });
  })
  .post("/", async (c) => {
    const db = await getDb();
    const data = await body(c, prospectInput);
    const [row] = await db.insert(p_).values(data).returning();
    await auditAction(c, "prospect.creation", "prospect", row!.id, { nom: row!.name });
    return c.json({ prospect: row }, 201);
  })
  .patch("/:id", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const data = await patchBody(c, prospectInput);
    const [current] = await db.select({ convertedClientId: p_.convertedClientId }).from(p_).where(eq(p_.id, id));
    if (!current) notFound();
    // La conversion est définitive : le statut d'un prospect converti ne change plus.
    if (current.convertedClientId && data.status && data.status !== "converti") conflict("Ce prospect a été converti en client : son statut ne peut plus changer.");
    if (!current.convertedClientId && data.status === "converti") conflict("Utilisez la conversion en client pour ce statut.");
    const [row] = await db.update(p_).set(data).where(eq(p_.id, id)).returning();
    if (!row) notFound();
    await auditAction(c, "prospect.modification", "prospect", id, { champs: Object.keys(data) });
    return c.json({ prospect: row });
  })
  .post("/:id/convert", async (c) => {
    // Le prospect devient client : ses coordonnées sont reprises, rien n'est ressaisi.
    const db = await getDb();
    const id = uuidParam(c);
    const [prospect] = await db.select().from(p_).where(eq(p_.id, id));
    if (!prospect) notFound();
    if (prospect.convertedClientId) return c.json({ clientId: prospect.convertedClientId });
    const sector = parse(clientInput.shape.sector, (await c.req.json().catch(() => ({})) as { sector?: string }).sector ?? "prive");
    const result = await db.transaction(async (tx) => {
      const [client] = await tx
        .insert(c_)
        .values({
          name: prospect.company ?? prospect.name,
          sector,
          country: prospect.country,
          city: prospect.city,
          contactName: prospect.company ? prospect.name : null,
          email: prospect.email,
          phone: prospect.phone,
          notes: prospect.notes,
        })
        .returning();
      await tx.update(p_).set({ status: "converti", convertedClientId: client!.id }).where(eq(p_.id, id));
      return client!;
    });
    await auditAction(c, "prospect.conversion", "prospect", id, { clientId: result.id });
    return c.json({ clientId: result.id }, 201);
  });
