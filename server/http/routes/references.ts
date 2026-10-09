/**
 * Référentiel technique et réglementaire : les seules références qu'un document peut citer.
 * Chaque référence porte son statut de vérification ; le catalogue de départ s'importe à la demande.
 */
import { and, asc, eq, ilike, or, type SQL, sql } from "drizzle-orm";
import { Hono } from "hono";
import { REFERENCE_SCOPES, type ReferenceScope } from "../../../shared/enums.js";
import { referenceInput } from "../../../shared/schemas.js";
import type { AdminEnv } from "../../auth/guard.js";
import { getDb, schema } from "../../db/index.js";
import { auditAction } from "../../services/audit.js";
import { STARTER_CATALOG } from "../../services/references-catalog.js";
import { body, conflict, notFound, patchBody, uuidParam, ValidationError } from "../validate.js";

const r = schema.technicalReference;

/** Nombre d'articles de CCTP qui citent une référence. */
const citedCount = sql<number>`(select count(*)::int from cctp_section cs where cs.reference_ids @> jsonb_build_array("technical_reference"."id"::text))`;

export const referenceRoutes = new Hono<AdminEnv>()
  .get("/", async (c) => {
    const db = await getDb();
    const filters: SQL[] = [];
    const scope = c.req.query("portee");
    if (scope && (REFERENCE_SCOPES as readonly string[]).includes(scope)) filters.push(eq(r.scope, scope as ReferenceScope));
    const q = c.req.query("q")?.trim();
    if (q) filters.push(or(ilike(r.code, `%${q}%`), ilike(r.title, `%${q}%`), ilike(r.domain, `%${q}%`))!);
    const rows = await db
      .select({ reference: r, cited: citedCount })
      .from(r)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(r.scope), asc(r.code));
    return c.json({ items: rows.map((row) => ({ ...row.reference, cited: Number(row.cited) })) });
  })
  .post("/", async (c) => {
    const db = await getDb();
    const data = await body(c, referenceInput);
    const [exists] = await db.select({ id: r.id }).from(r).where(and(eq(r.scope, data.scope), eq(r.code, data.code)));
    if (exists) conflict(`La référence ${data.code} existe déjà pour ce périmètre.`);
    const [row] = await db
      .insert(r)
      .values({ ...data, verificationStatus: "a_verifier" })
      .returning();
    await auditAction(c, "referentiel.ajout", "technical_reference", row!.id, { reference: row!.code });
    return c.json({ reference: row }, 201);
  })
  .patch("/:id", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const data = await patchBody(c, referenceInput);
    // Une référence modifiée doit être vérifiée de nouveau.
    const [row] = await db
      .update(r)
      .set({ ...data, verificationStatus: "a_verifier", verifiedAt: null })
      .where(eq(r.id, id))
      .returning();
    if (!row) notFound("Référence introuvable.");
    await auditAction(c, "referentiel.modification", "technical_reference", id, { reference: row.code });
    return c.json({ reference: row });
  })
  .post("/:id/verify", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const status = ((await c.req.json().catch(() => ({}))) as { status?: string }).status;
    if (status !== "verifie" && status !== "a_verifier" && status !== "rejete") throw new ValidationError({ status: "Statut invalide." });
    const [row] = await db
      .update(r)
      .set({ verificationStatus: status, verifiedAt: status === "verifie" ? new Date() : null })
      .where(eq(r.id, id))
      .returning();
    if (!row) notFound("Référence introuvable.");
    await auditAction(c, `referentiel.${status === "verifie" ? "verifiee" : status === "rejete" ? "rejetee" : "a_verifier"}`, "technical_reference", id, { reference: row.code });
    return c.json({ reference: row });
  })
  .delete("/:id", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const [row] = await db.select({ reference: r, cited: citedCount }).from(r).where(eq(r.id, id));
    if (!row) notFound("Référence introuvable.");
    if (Number(row.cited) > 0) conflict("Cette référence est citée dans un CCTP : retirez-la des articles avant de la supprimer, ou rejetez-la.");
    await db.transaction(async (tx) => {
      // Retirée aussi des références retenues par les documents.
      await tx.execute(sql`update ${schema.cctpDocument} set reference_ids = reference_ids - ${id}::text where reference_ids @> jsonb_build_array(${id}::text)`);
      await tx.delete(r).where(eq(r.id, id));
    });
    await auditAction(c, "referentiel.suppression", "technical_reference", id, { reference: row.reference.code });
    return c.json({ ok: true });
  })
  .post("/catalogue", async (c) => {
    // Import du catalogue de départ, « à vérifier », sans doublon.
    const db = await getDb();
    const existing = await db.select({ scope: r.scope, code: r.code }).from(r);
    const keys = new Set(existing.map((e) => `${e.scope}:${e.code.toUpperCase()}`));
    const fresh = STARTER_CATALOG.filter((item) => !keys.has(`${item.scope}:${item.code.toUpperCase()}`));
    if (fresh.length) {
      await db.insert(r).values(fresh.map((item) => ({ ...item, verificationStatus: "a_verifier" as const, notes: "Catalogue de départ : édition en vigueur et intitulé exact à confirmer avant citation." })));
    }
    await auditAction(c, "referentiel.catalogue_importe", "technical_reference", null, { ajoutees: fresh.length });
    return c.json({ imported: fresh.length, skipped: STARTER_CATALOG.length - fresh.length });
  });
