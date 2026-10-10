/**
 * Sous-détails de prix d'une DPGF : décomposition par l'agent, édition des composants et des taux,
 * validation (le sous-détail est alors figé), report des prix validés dans la DPGF, export Excel.
 * Le coût d'un composant relié à la bibliothèque est toujours celui du prix de la bibliothèque.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { MARGIN_MODES, RATE_BASES } from "../../../shared/enums.js";
import { breakdownComponentInput, sousDetailRequest } from "../../../shared/schemas.js";
import { pricingSettings } from "../../../shared/settings.js";
import { modelFor } from "../../ai/client.js";
import type { AdminEnv } from "../../auth/guard.js";
import { getDb, schema } from "../../db/index.js";
import { createJob } from "../../jobs/runner.js";
import { auditAction } from "../../services/audit.js";
import { defaultRates, recomputeBreakdown, resultOf } from "../../services/breakdowns.js";
import { lineAmount } from "../../services/dpgf.js";
import { checkBreakdowns, checkDpgf, replaceIssues } from "../../services/quality.js";
import { readSetting } from "../../services/settings.js";
import { sameUnit } from "../../services/units.js";
import { body, conflict, notFound, patchBody, uuidParam, ValidationError } from "../validate.js";
import { serializeJob } from "./agents.js";
import { exportResponse } from "./exports.js";

const bd = schema.priceBreakdown;
const comp = schema.priceBreakdownComponent;

async function loadBreakdown(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(bd).where(eq(bd.id, id));
  if (!row) notFound("Sous-détail introuvable.");
  return row;
}

async function dpgfOfBreakdown(breakdownId: string): Promise<{ dpgfId: string; projectId: string } | null> {
  const db = await getDb();
  const [row] = await db
    .select({ dpgfId: schema.dpgfLine.dpgfId, projectId: bd.projectId })
    .from(bd)
    .innerJoin(schema.dpgfLine, eq(schema.dpgfLine.id, bd.dpgfLineId))
    .where(eq(bd.id, breakdownId));
  return row ?? null;
}

async function recheck(dpgfId: string) {
  const db = await getDb();
  const [dpgf] = await db.select().from(schema.dpgf).where(eq(schema.dpgf.id, dpgfId));
  if (!dpgf) return;
  await replaceIssues(db, { projectId: dpgf.projectId, documentType: "sous_detail", documentId: dpgfId }, await checkBreakdowns(db, dpgfId));
}

/** Un sous-détail validé est figé : il faut le rouvrir avant de le modifier. */
function assertEditable(b: { locked: boolean }) {
  if (b.locked) conflict("Ce sous-détail est validé : rouvrez-le avant de le modifier.");
}

/** Coût d'un composant : celui du prix de la bibliothèque s'il est relié, sinon la valeur saisie. */
async function resolveCost(priceItemId: string | null, unitCost: string | null, currency: string) {
  if (!priceItemId) return { unitCost, priceItemId: null, unit: null as string | null };
  const db = await getDb();
  const [item] = await db.select().from(schema.priceItem).where(eq(schema.priceItem.id, priceItemId));
  if (!item) throw new ValidationError({ priceItemId: "Prix introuvable dans la bibliothèque." });
  if (item.currency !== currency) throw new ValidationError({ priceItemId: `Ce prix est en ${item.currency}, le sous-détail en ${currency}.` });
  return { unitCost: item.unitPrice, priceItemId: item.id, unit: item.unit };
}

export const breakdownRoutes = new Hono<AdminEnv>()
  .get("/dpgf/:id/breakdowns", async (c) => {
    const dpgfId = uuidParam(c);
    const db = await getDb();
    const [dpgf] = await db.select().from(schema.dpgf).where(eq(schema.dpgf.id, dpgfId));
    if (!dpgf) notFound("DPGF introuvable.");
    const lines = await db
      .select()
      .from(schema.dpgfLine)
      .where(and(eq(schema.dpgfLine.dpgfId, dpgfId), eq(schema.dpgfLine.kind, "poste")))
      .orderBy(asc(schema.dpgfLine.position));
    const breakdowns = lines.length ? await db.select().from(bd).where(inArray(bd.dpgfLineId, lines.map((l) => l.id))) : [];
    const components = breakdowns.length ? await db.select().from(comp).where(inArray(comp.breakdownId, breakdowns.map((b) => b.id))).orderBy(asc(comp.position)) : [];
    const issues = await db
      .select()
      .from(schema.qualityIssue)
      .where(and(eq(schema.qualityIssue.documentType, "sous_detail"), eq(schema.qualityIssue.documentId, dpgfId)))
      .orderBy(sql`case ${schema.qualityIssue.severity} when 'bloquante' then 0 when 'majeure' then 1 when 'mineure' then 2 else 3 end`);
    return c.json({
      dpgf,
      rates: await readSetting("chiffrage"),
      postes: lines.map((line) => {
        const b = breakdowns.find((x) => x.dpgfLineId === line.id);
        const own = b ? components.filter((x) => x.breakdownId === b.id) : [];
        return { line, breakdown: b ? { ...b, components: own, result: resultOf(b, own) } : null };
      }),
      issues,
    });
  })
  .post("/dpgf/:id/breakdowns/generate", async (c) => {
    const dpgfId = uuidParam(c);
    const db = await getDb();
    const [dpgf] = await db.select().from(schema.dpgf).where(eq(schema.dpgf.id, dpgfId));
    if (!dpgf) notFound("DPGF introuvable.");
    const data = await body(c, sousDetailRequest);
    await modelFor("generation");
    const job = await createJob({ kind: "sous_detail", projectId: dpgf.projectId, input: { dpgfId, lineIds: [...new Set(data.lineIds)].sort(), instructions: data.instructions } });
    const steps = await db.select().from(schema.generationStep).where(eq(schema.generationStep.jobId, job.id)).orderBy(asc(schema.generationStep.position));
    const [fresh] = await db.select().from(schema.generationJob).where(eq(schema.generationJob.id, job.id));
    await auditAction(c, "agent.sous_details", "project", dpgf.projectId, { document: dpgf.title, postes: data.lineIds.length || "tous" });
    return c.json({ job: serializeJob(fresh ?? job, steps) }, 201);
  })
  .post("/dpgf/:id/breakdowns/apply-rates", async (c) => {
    // Taux des paramètres recopiés dans les sous-détails non validés de la DPGF.
    const dpgfId = uuidParam(c);
    const db = await getDb();
    const [dpgf] = await db.select().from(schema.dpgf).where(eq(schema.dpgf.id, dpgfId));
    if (!dpgf) notFound("DPGF introuvable.");
    const lines = await db.select({ id: schema.dpgfLine.id }).from(schema.dpgfLine).where(and(eq(schema.dpgfLine.dpgfId, dpgfId), eq(schema.dpgfLine.kind, "poste")));
    const targets = lines.length ? await db.select({ id: bd.id }).from(bd).where(and(inArray(bd.dpgfLineId, lines.map((l) => l.id)), eq(bd.locked, false))) : [];
    if (targets.length) {
      await db.update(bd).set(await defaultRates()).where(inArray(bd.id, targets.map((t) => t.id)));
      for (const t of targets) await recomputeBreakdown(db, t.id);
    }
    await recheck(dpgfId);
    return c.json({ updated: targets.length });
  })
  .post("/dpgf/lines/:id/breakdown", async (c) => {
    // Sous-détail saisi entièrement à la main pour un poste.
    const lineId = uuidParam(c);
    const db = await getDb();
    const [line] = await db.select().from(schema.dpgfLine).where(eq(schema.dpgfLine.id, lineId));
    if (!line || line.kind !== "poste") notFound("Poste introuvable.");
    const [existing] = await db.select().from(bd).where(eq(bd.dpgfLineId, lineId));
    if (existing) return c.json({ breakdown: existing });
    const [dpgf] = await db.select().from(schema.dpgf).where(eq(schema.dpgf.id, line.dpgfId));
    const [row] = await db
      .insert(bd)
      .values({ projectId: dpgf!.projectId, dpgfLineId: lineId, workItemId: line.workItemId, designation: line.designation, unit: line.unit ?? "u", currency: dpgf!.currency, ...(await defaultRates()) })
      .returning();
    return c.json({ breakdown: row }, 201);
  })
  .patch("/breakdowns/:id", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const b = await loadBreakdown(id);
    assertEditable(b);
    const json = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const rates = pricingSettings.partial().safeParse(json);
    if (!rates.success) throw new ValidationError(Object.fromEntries(rates.error.issues.map((i) => [i.path.join("."), i.message])));
    // Zod réinjecte les valeurs par défaut : seules les clés présentes dans la requête sont appliquées.
    const r = rates.data;
    const update: Partial<typeof bd.$inferInsert> = {};
    if ("overheadRate" in json) update.overheadRate = r.overheadRate || null;
    if ("contingencyRate" in json) update.contingencyRate = r.contingencyRate || null;
    if ("marginRate" in json) update.marginRate = r.marginRate || null;
    if ("overheadBase" in json && r.overheadBase && (RATE_BASES as readonly string[]).includes(r.overheadBase)) update.overheadBase = r.overheadBase;
    if ("contingencyBase" in json && r.contingencyBase && (RATE_BASES as readonly string[]).includes(r.contingencyBase)) update.contingencyBase = r.contingencyBase;
    if ("marginMode" in json && r.marginMode && (MARGIN_MODES as readonly string[]).includes(r.marginMode)) update.marginMode = r.marginMode;
    if (typeof json.notes === "string") update.notes = json.notes.slice(0, 3000) || null;
    if (Object.keys(update).length) await db.update(bd).set(update).where(eq(bd.id, id));
    await recomputeBreakdown(db, id);
    const owner = await dpgfOfBreakdown(id);
    if (owner) await recheck(owner.dpgfId);
    return c.json({ ok: true });
  })
  .post("/breakdowns/:id/components", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const b = await loadBreakdown(id);
    assertEditable(b);
    const data = await body(c, breakdownComponentInput);
    const cost = await resolveCost(data.priceItemId, data.unitCost, b.currency);
    const [{ last } = { last: 0 }] = await db.select({ last: sql<number>`coalesce(max(${comp.position}), -1)::int` }).from(comp).where(eq(comp.breakdownId, id));
    const [row] = await db
      .insert(comp)
      .values({
        breakdownId: id,
        position: Number(last) + 1,
        category: data.category,
        designation: data.designation,
        unit: cost.unit ?? data.unit,
        quantity: data.quantity,
        unitCost: cost.unitCost,
        lossRate: data.lossRate,
        priceItemId: cost.priceItemId,
        isHypothesis: false,
        sourceNote: data.sourceNote ?? (cost.priceItemId ? "Prix de la bibliothèque" : "Saisie"),
      })
      .returning();
    await recomputeBreakdown(db, id);
    const owner = await dpgfOfBreakdown(id);
    if (owner) await recheck(owner.dpgfId);
    return c.json({ component: row }, 201);
  })
  .patch("/breakdown-components/:id", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const [current] = await db.select().from(comp).where(eq(comp.id, id));
    if (!current) notFound("Composant introuvable.");
    const b = await loadBreakdown(current.breakdownId);
    assertEditable(b);
    const data = await patchBody(c, breakdownComponentInput);
    const relinked = "priceItemId" in data || "unitCost" in data;
    // Le coût d'un prix de la bibliothèque s'entend dans son unité : elle ne se change pas seule.
    if (!relinked && current.priceItemId && data.unit !== undefined && !sameUnit(data.unit, current.unit)) {
      throw new ValidationError({ unit: "L’unité est celle du prix retenu dans la bibliothèque : choisissez un autre prix ou saisissez un coût." });
    }
    const cost = relinked ? await resolveCost(data.priceItemId ?? null, data.unitCost ?? null, b.currency) : null;
    const [row] = await db
      .update(comp)
      .set({
        ...data,
        ...(cost ? { unitCost: cost.unitCost, priceItemId: cost.priceItemId, ...(cost.unit ? { unit: cost.unit } : {}), sourceNote: data.sourceNote ?? (cost.priceItemId ? "Prix de la bibliothèque" : "Saisie") } : {}),
        // Une consommation modifiée par l'administrateur n'est plus une hypothèse de l'agent.
        ...("quantity" in data ? { isHypothesis: false } : {}),
      })
      .where(eq(comp.id, id))
      .returning();
    await recomputeBreakdown(db, current.breakdownId);
    const owner = await dpgfOfBreakdown(current.breakdownId);
    if (owner) await recheck(owner.dpgfId);
    return c.json({ component: row });
  })
  .delete("/breakdown-components/:id", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const [current] = await db.select().from(comp).where(eq(comp.id, id));
    if (!current) notFound("Composant introuvable.");
    assertEditable(await loadBreakdown(current.breakdownId));
    await db.delete(comp).where(eq(comp.id, id));
    await recomputeBreakdown(db, current.breakdownId);
    const owner = await dpgfOfBreakdown(current.breakdownId);
    if (owner) await recheck(owner.dpgfId);
    return c.json({ ok: true });
  })
  .post("/breakdowns/:id/validate", async (c) => {
    const id = uuidParam(c);
    const db = await getDb();
    const validated = ((await c.req.json().catch(() => ({}))) as { validated?: boolean }).validated !== false;
    const b = await loadBreakdown(id);
    if (validated && b.computedUnitPrice === null) conflict("Un sous-détail incomplet (prix manquant) ne peut pas être validé.");
    await db
      .update(bd)
      .set({ locked: validated, status: validated ? "valide" : b.computedUnitPrice ? "a_valider" : "brouillon" })
      .where(eq(bd.id, id));
    const owner = await dpgfOfBreakdown(id);
    if (owner) await recheck(owner.dpgfId);
    await auditAction(c, validated ? "sous_detail.valide" : "sous_detail.rouvert", "project", b.projectId, { poste: b.designation });
    return c.json({ ok: true });
  })
  .post("/dpgf/:id/apply-breakdowns", async (c) => {
    // Les prix des sous-détails validés sont reportés dans la DPGF.
    const dpgfId = uuidParam(c);
    const db = await getDb();
    const [dpgf] = await db.select().from(schema.dpgf).where(eq(schema.dpgf.id, dpgfId));
    if (!dpgf) notFound("DPGF introuvable.");
    const lines = await db.select().from(schema.dpgfLine).where(and(eq(schema.dpgfLine.dpgfId, dpgfId), eq(schema.dpgfLine.kind, "poste")));
    const breakdowns = lines.length ? await db.select().from(bd).where(and(inArray(bd.dpgfLineId, lines.map((l) => l.id)), eq(bd.locked, true))) : [];
    let applied = 0;
    for (const b of breakdowns) {
      const line = lines.find((l) => l.id === b.dpgfLineId)!;
      if (b.computedUnitPrice === null || (line.unitPrice !== null && Number(line.unitPrice) === Number(b.computedUnitPrice) && line.priceSource === "Sous-détail validé")) continue;
      await db
        .update(schema.dpgfLine)
        .set({ unitPrice: b.computedUnitPrice, amount: lineAmount(line.quantity, b.computedUnitPrice), priceSource: "Sous-détail validé", status: "a_verifier" })
        .where(eq(schema.dpgfLine.id, line.id));
      applied++;
    }
    if (applied) {
      await db.update(schema.dpgf).set({ status: sql`case when ${schema.dpgf.status} = 'valide' then 'a_valider'::document_status else ${schema.dpgf.status} end` }).where(eq(schema.dpgf.id, dpgfId));
      await replaceIssues(db, { projectId: dpgf.projectId, documentType: "dpgf", documentId: dpgfId }, await checkDpgf(db, dpgfId));
    }
    await recheck(dpgfId);
    await auditAction(c, "sous_detail.prix_reportes", "project", dpgf.projectId, { document: dpgf.title, postes: applied });
    return c.json({ applied });
  })
  .get("/dpgf/:id/breakdowns/export.xlsx", async (c) => exportResponse(c, "sous_details", uuidParam(c), "xlsx"))
  .get("/dpgf/:id/breakdowns/export.pdf", async (c) => exportResponse(c, "sous_details", uuidParam(c), "pdf"));
