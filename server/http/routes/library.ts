/**
 * Bibliothèque de prix : chaque prix a sa provenance, sa date, sa zone et son statut de vérification.
 * Toute modification de valeur est historisée. Import de fichiers CSV ou Excel avec correspondance des
 * colonnes, lignes refusées avec leur motif. Fournisseurs.
 */
import { and, asc, count, desc, eq, ilike, isNotNull, isNull, or, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { COUNTRIES, CURRENCIES, PRICE_KINDS, type PriceKind } from "../../../shared/enums.js";
import { listQuery, priceFile, priceImportRequest, priceItemInput, supplierInput } from "../../../shared/schemas.js";
import type { AdminEnv } from "../../auth/guard.js";
import { getDb, schema } from "../../db/index.js";
import { auditAction } from "../../services/audit.js";
import { MAX_ROWS, parseAmount, parseDate, parseKind, parsePriceFile } from "../../services/price-import.js";
import { body, notFound, parse, patchBody, uuidParam, ValidationError } from "../validate.js";

const p = schema.priceItem;

export const libraryRoutes = new Hono<AdminEnv>()
  .get("/prices", async (c) => {
    const db = await getDb();
    const q = parse(listQuery, c.req.query());
    const filters: SQL[] = [c.req.query("archives") === "1" ? isNotNull(p.archivedAt) : isNull(p.archivedAt)];
    if (q.q) filters.push(or(ilike(p.designation, `%${q.q}%`), ilike(p.code, `%${q.q}%`), ilike(p.subFamily, `%${q.q}%`))!);
    const kind = c.req.query("nature");
    if (kind && (PRICE_KINDS as readonly string[]).includes(kind)) filters.push(eq(p.kind, kind as PriceKind));
    const country = c.req.query("pays");
    if (country && (COUNTRIES as readonly string[]).includes(country)) filters.push(eq(p.country, country as "MA" | "FR"));
    const currency = c.req.query("devise");
    if (currency && (CURRENCIES as readonly string[]).includes(currency)) filters.push(eq(p.currency, currency as "MAD" | "EUR"));
    const status = c.req.query("statut");
    if (status === "a_verifier" || status === "verifie" || status === "rejete") filters.push(eq(p.verificationStatus, status));
    const where = and(...filters);
    const order = q.sort === "designation" ? (q.dir === "asc" ? asc(p.designation) : desc(p.designation)) : q.sort === "prix" ? (q.dir === "asc" ? asc(p.unitPrice) : desc(p.unitPrice)) : desc(p.priceDate);
    const [rows, total] = await Promise.all([
      db
        .select({ price: p, supplierName: schema.supplier.name })
        .from(p)
        .leftJoin(schema.supplier, eq(schema.supplier.id, p.supplierId))
        .where(where)
        .orderBy(order, asc(p.designation))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      db.select({ n: count() }).from(p).where(where),
    ]);
    return c.json({ items: rows.map((r) => ({ ...r.price, supplierName: r.supplierName })), total: Number(total[0]?.n ?? 0), page: q.page, pageSize: q.pageSize });
  })
  .post("/prices", async (c) => {
    const db = await getDb();
    const data = await body(c, priceItemInput);
    const [row] = await db
      .insert(p)
      .values({ ...data, verificationStatus: "a_verifier" })
      .returning();
    await db.insert(schema.priceHistory).values({ priceItemId: row!.id, unitPrice: row!.unitPrice, currency: row!.currency, priceDate: row!.priceDate, origin: row!.origin, note: "Création" });
    await auditAction(c, "bibliotheque.prix_ajoute", "price_item", row!.id, { prix: row!.designation });
    return c.json({ price: row }, 201);
  })
  .patch("/prices/:id", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const [current] = await db.select().from(p).where(eq(p.id, id));
    if (!current) notFound("Prix introuvable.");
    const data = await patchBody(c, priceItemInput);
    const valueChanged =
      (data.unitPrice !== undefined && Number(data.unitPrice) !== Number(current.unitPrice)) ||
      (data.currency !== undefined && data.currency !== current.currency) ||
      (data.priceDate !== undefined && data.priceDate !== current.priceDate);
    const [row] = await db
      .update(p)
      .set({ ...data, ...(valueChanged ? { verificationStatus: "a_verifier" as const } : {}) })
      .where(eq(p.id, id))
      .returning();
    // Une nouvelle valeur est historisée : l'ancienne reste consultable.
    if (valueChanged) await db.insert(schema.priceHistory).values({ priceItemId: id, unitPrice: row!.unitPrice, currency: row!.currency, priceDate: row!.priceDate, origin: row!.origin, note: "Nouvelle valeur" });
    await auditAction(c, "bibliotheque.prix_modifie", "price_item", id, { prix: row!.designation, champs: Object.keys(data) });
    return c.json({ price: row });
  })
  .post("/prices/:id/verify", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const status = ((await c.req.json().catch(() => ({}))) as { status?: string }).status;
    if (status !== "verifie" && status !== "a_verifier" && status !== "rejete") throw new ValidationError({ status: "Statut invalide." });
    const [row] = await db.update(p).set({ verificationStatus: status }).where(eq(p.id, id)).returning();
    if (!row) notFound("Prix introuvable.");
    await auditAction(c, `bibliotheque.prix_${status === "verifie" ? "verifie" : status === "rejete" ? "rejete" : "a_verifier"}`, "price_item", id, { prix: row.designation });
    return c.json({ price: row });
  })
  .post("/prices/:id/archive", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const archived = ((await c.req.json().catch(() => ({}))) as { archived?: boolean }).archived !== false;
    const [row] = await db
      .update(p)
      .set({ archivedAt: archived ? new Date() : null })
      .where(eq(p.id, id))
      .returning();
    if (!row) notFound("Prix introuvable.");
    await auditAction(c, archived ? "bibliotheque.prix_archive" : "bibliotheque.prix_restaure", "price_item", id, { prix: row.designation });
    return c.json({ price: row });
  })
  .get("/prices/:id/history", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const rows = await db.select().from(schema.priceHistory).where(eq(schema.priceHistory.priceItemId, id)).orderBy(desc(schema.priceHistory.recordedAt));
    return c.json({ items: rows });
  })
  .post("/prices/import/preview", async (c) => {
    const data = await body(c, priceFile.extend({ sheet: priceImportRequest.shape.sheet }));
    try {
      const table = await parsePriceFile(data.fileName, data.contentBase64, data.sheet);
      return c.json({ sheets: table.sheets, sheet: table.sheet, rows: table.rows.slice(0, 15), total: table.rows.length, truncated: table.rows.length >= MAX_ROWS });
    } catch (error) {
      throw new ValidationError({ fileName: error instanceof Error ? error.message : "Fichier illisible." });
    }
  })
  .post("/prices/import", async (c) => {
    const db = await getDb();
    const data = await body(c, priceImportRequest);
    let table;
    try {
      table = await parsePriceFile(data.fileName, data.contentBase64, data.sheet);
    } catch (error) {
      throw new ValidationError({ fileName: error instanceof Error ? error.message : "Fichier illisible." });
    }
    const rows = table.rows.slice(data.headerRow + 1);
    const accepted: Array<typeof p.$inferInsert> = [];
    const rejected: Array<{ row: number; reason: string }> = [];
    rows.forEach((cells, index) => {
      const line = data.headerRow + index + 2;
      const designation = cells[data.columns.designation]?.trim();
      const unit = cells[data.columns.unit]?.trim();
      const unitPrice = parseAmount(cells[data.columns.unitPrice]);
      if (!designation) return rejected.push({ row: line, reason: "désignation vide" });
      if (!unit) return rejected.push({ row: line, reason: "unité vide" });
      if (!unitPrice || Number(unitPrice) <= 0) return rejected.push({ row: line, reason: "prix illisible ou nul" });
      const kind = (data.columns.kind !== null ? parseKind(cells[data.columns.kind]) : null) ?? data.defaults.kind;
      const rawDate = data.columns.priceDate !== null ? cells[data.columns.priceDate]?.trim() : "";
      const priceDate = rawDate ? parseDate(rawDate) : data.defaults.priceDate;
      if (!priceDate) return rejected.push({ row: line, reason: `date illisible (${rawDate})` });
      accepted.push({
        code: data.columns.code !== null ? cells[data.columns.code]?.trim() || null : null,
        designation: designation.slice(0, 500),
        kind,
        unit: unit.slice(0, 20),
        unitPrice,
        currency: data.defaults.currency,
        country: data.defaults.country,
        tradeFamily: data.defaults.tradeFamily,
        origin: data.defaults.origin,
        supplierId: data.defaults.supplierId,
        sourceRef: `${data.fileName}, ligne ${line}`,
        priceDate,
        verificationStatus: "a_verifier",
      });
    });
    let imported = 0;
    for (let i = 0; i < accepted.length; i += 200) {
      const batch = accepted.slice(i, i + 200);
      const inserted = await db.insert(p).values(batch).returning({ id: p.id, unitPrice: p.unitPrice, currency: p.currency, priceDate: p.priceDate, origin: p.origin });
      await db.insert(schema.priceHistory).values(inserted.map((r) => ({ priceItemId: r.id, unitPrice: r.unitPrice, currency: r.currency, priceDate: r.priceDate, origin: r.origin, note: `Import ${data.fileName}` })));
      imported += inserted.length;
    }
    await auditAction(c, "bibliotheque.import", "price_item", null, { fichier: data.fileName, importes: imported, refuses: rejected.length });
    return c.json({ imported, rejected: rejected.slice(0, 50), rejectedCount: rejected.length });
  })
  .get("/suppliers", async (c) => {
    const db = await getDb();
    const rows = await db.select().from(schema.supplier).orderBy(asc(schema.supplier.name));
    return c.json({ items: rows });
  })
  .post("/suppliers", async (c) => {
    const db = await getDb();
    const data = await body(c, supplierInput);
    const [row] = await db.insert(schema.supplier).values(data).returning();
    await auditAction(c, "bibliotheque.fournisseur_ajoute", "supplier", row!.id, { fournisseur: row!.name });
    return c.json({ supplier: row }, 201);
  })
  .patch("/suppliers/:id", async (c) => {
    const db = await getDb();
    const id = uuidParam(c);
    const data = await patchBody(c, supplierInput);
    const [row] = await db.update(schema.supplier).set(data).where(eq(schema.supplier.id, id)).returning();
    if (!row) notFound("Fournisseur introuvable.");
    return c.json({ supplier: row });
  });
