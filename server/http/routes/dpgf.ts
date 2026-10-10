/**
 * DPGF : établie par l'agent à partir d'un CCTP, puis modifiable ligne par ligne (quantités, prix,
 * désignations), montants recalculés en décimal exact, contrôle qualité, validation, versions, export Excel.
 */
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { PRICE_ORIGIN_LABELS } from "../../../shared/enums.js";
import { appliesToDpgfLine } from "../../../shared/prices.js";
import { applyPricesRequest, dpgfGenerationRequest, dpgfLineInput, dpgfUpdate, priceMatchRequest } from "../../../shared/schemas.js";
import { modelFor } from "../../ai/client.js";
import type { AdminEnv } from "../../auth/guard.js";
import { getDb, schema } from "../../db/index.js";
import { createJob } from "../../jobs/runner.js";
import { auditAction } from "../../services/audit.js";
import { computeTotals, lineAmount, renumber } from "../../services/dpgf.js";
import { exclTax, findCandidates } from "../../services/pricing.js";
import { checkDpgf, hasBlockingIssues, replaceIssues } from "../../services/quality.js";
import { sameUnit } from "../../services/units.js";
import { listVersions, snapshotDpgf } from "../../services/versions.js";
import { body, conflict, notFound, patchBody, uuidParam, ValidationError } from "../validate.js";
import { serializeJob } from "./agents.js";
import { exportResponse } from "./exports.js";

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

/** Nombre de postes rapprochés par demande : chaque poste interroge la bibliothèque. */
const MATCH_LIMIT = 150;

export const dpgfRoutes = new Hono<AdminEnv>()
  /**
   * Prix de la bibliothèque applicables à chaque poste : prix d'ouvrage (fourniture et pose, ouvrage
   * complet) de même unité, même devise et même pays, classés par pertinence puis par proximité.
   * Sans candidat, le poste est signalé « prix non disponible dans la bibliothèque ».
   */
  .post("/dpgf/:id/price-matches", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const doc = await loadDpgf(id);
    const data = await body(c, priceMatchRequest);
    const [project] = await db.select().from(schema.project).where(eq(schema.project.id, doc.projectId));
    const postes = await db
      .select()
      .from(l)
      .where(and(eq(l.dpgfId, id), eq(l.kind, "poste")))
      .orderBy(asc(l.position));
    const wanted = new Set(data.lineIds ?? []);
    const targets = postes.filter((line) => (wanted.size ? wanted.has(line.id) : true) && (!data.onlyUnpriced || line.unitPrice === null));
    const items = [];
    for (const line of targets.slice(0, MATCH_LIMIT)) {
      const candidates = line.unit
        ? (await findCandidates(db, { text: `${line.designation} ${line.description ?? ""}`, currency: doc.currency, country: project!.country, city: project!.city, limit: 15, purpose: "ligne" })).filter((cand) => sameUnit(cand.unit, line.unit)).slice(0, 5)
        : [];
      items.push({ lineId: line.id, code: line.code, designation: line.designation, unit: line.unit, quantity: line.quantity, unitPrice: line.unitPrice, priceSource: line.priceSource, candidates });
    }
    return c.json({ items, total: targets.length, truncated: targets.length > MATCH_LIMIT });
  })
  /** Applique des prix de la bibliothèque aux postes : prix hors taxes, provenance inscrite, poste à vérifier. */
  .post("/dpgf/:id/apply-prices", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const doc = await loadDpgf(id);
    const data = await body(c, applyPricesRequest);
    const [project] = await db.select().from(schema.project).where(eq(schema.project.id, doc.projectId));
    const lines = await db.select().from(l).where(and(eq(l.dpgfId, id), inArray(l.id, data.assignments.map((a) => a.lineId))));
    const prices = await db
      .select({ price: schema.priceItem, sourceName: schema.priceSource.name })
      .from(schema.priceItem)
      .leftJoin(schema.priceSource, eq(schema.priceSource.id, schema.priceItem.sourceId))
      .where(inArray(schema.priceItem.id, data.assignments.map((a) => a.priceItemId)));
    const errors: Array<{ lineId: string; message: string }> = [];
    let applied = 0;
    for (const a of data.assignments) {
      const line = lines.find((x) => x.id === a.lineId);
      const found = prices.find((x) => x.price.id === a.priceItemId);
      const fail = (message: string) => errors.push({ lineId: a.lineId, message });
      if (!line || line.kind !== "poste") {
        fail("Poste introuvable dans cette DPGF.");
        continue;
      }
      if (!found || found.price.archivedAt || found.price.verificationStatus === "rejete") {
        fail("Prix introuvable, archivé ou rejeté.");
        continue;
      }
      const price = found.price;
      if (price.currency !== doc.currency || price.country !== project!.country) {
        fail(`Prix en ${price.currency} pour ${price.country}, DPGF en ${doc.currency}.`);
        continue;
      }
      if (!appliesToDpgfLine(price)) {
        fail("Prix de fourniture ou ratio d’opération : il sert aux sous-détails, pas au prix d’un poste.");
        continue;
      }
      if (!sameUnit(price.unit, line.unit)) {
        fail(`Unité du prix (${price.unit}) différente de celle du poste (${line.unit ?? "aucune"}).`);
        continue;
      }
      const ht = exclTax(price.unitPrice, price.taxBasis, price.vatRate);
      if (ht === null) {
        fail("Prix TTC sans taux de TVA : il ne peut pas être ramené hors taxes.");
        continue;
      }
      const zone = price.city ?? price.region;
      const when = price.period ? `valeur ${price.period}` : `prix du ${price.priceDate.split("-").reverse().join("/")}`;
      const priceSource = [`Bibliothèque : ${price.designation}`, zone, when, found.sourceName ?? PRICE_ORIGIN_LABELS[price.origin], price.taxBasis === "TTC" ? "TTC ramené HT" : null].filter(Boolean).join(", ");
      await db
        .update(l)
        .set({ unitPrice: ht, amount: lineAmount(line.quantity, ht), priceItemId: price.id, priceSource, status: "a_verifier" })
        .where(eq(l.id, line.id));
      applied++;
    }
    if (applied) {
      await touch(id);
      await rerunChecks(id);
      await auditAction(c, "dpgf.prix_bibliotheque", "project", doc.projectId, { document: doc.title, postes: applied, refuses: errors.length });
    }
    return c.json({ applied, errors });
  })
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
  .get("/dpgf/:id/export.xlsx", async (c) => exportResponse(c, "dpgf", uuidParam(c), "xlsx"))
  .get("/dpgf/:id/export.pdf", async (c) => exportResponse(c, "dpgf", uuidParam(c), "pdf"));
