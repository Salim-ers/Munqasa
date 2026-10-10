/**
 * Dossier d'une affaire : contrôle indépendant et niveau de validation.
 *
 * Le contrôle indépendant ne fait confiance à aucune valeur enregistrée : il recalcule les quantités du
 * métré à partir des formules, les quantités de DPGF reprises du métré, les prix reportés des sous-détails
 * validés, les montants et les sous-détails. Une erreur calculable est corrigée et journalisée ; une erreur
 * qui ne se calcule pas (donnée absente, valeur à vérifier) reste une anomalie à traiter. Le contenu contrôlé
 * est résumé par une empreinte : toute modification ultérieure rend le contrôle caduc.
 */
import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { type AuditFix, DOSSIER_LEVEL_LABELS, DOSSIER_LEVELS, type DossierLevel, type LevelCriterion } from "../../shared/dossier.js";
import { type Database, schema } from "../db/index.js";
import { recomputeBreakdown } from "./breakdowns.js";
import { lineAmount, metreQuantity } from "./dpgf.js";
import { FormulaError } from "./formula.js";
import { computeMeasure } from "./metre.js";
import { checkBreakdowns, checkCctp, checkDpgf, type IssueDraft, replaceIssues } from "./quality.js";

const fmt = (v: string | null) => (v === null ? "vide" : String(Number(v)));

/* ---------- Recalculs ---------- */

/** Recalcule tout ce qui se calcule et corrige les écarts ; renvoie les corrections et les volumes contrôlés. */
export async function recomputeDossier(db: Database, projectId: string): Promise<{ fixes: AuditFix[]; checked: { measurements: number; dpgfLines: number; breakdowns: number } }> {
  const fixes: AuditFix[] = [];
  const items = await db.select().from(schema.workItem).where(eq(schema.workItem.projectId, projectId));
  const codeOf = (id: string | null) => items.find((i) => i.id === id)?.code ?? "";

  // 1. Mesures : quantité brute, déductions et quantité nette depuis la formule et les valeurs enregistrées.
  const measures = await db.select().from(schema.measurement).where(eq(schema.measurement.projectId, projectId));
  for (const m of measures) {
    if (!m.formula) continue;
    let result: ReturnType<typeof computeMeasure>;
    try {
      result = computeMeasure(m.formula, m.inputs, m.deductions.map((d) => ({ label: d.label, formula: d.formula })));
    } catch (error) {
      if (error instanceof FormulaError) continue;
      throw error;
    }
    const same = (a: string | null, b: string | null) => (a === null ? b === null : b !== null && Number(a) === Number(b));
    const deductionsChanged = result.deductions.some((d, i) => !same(d.quantity, m.deductions[i]?.quantity ?? null));
    if (!same(m.quantity, result.net) || !same(m.grossQuantity, result.gross) || deductionsChanged) {
      await db.update(schema.measurement).set({ quantity: result.net, grossQuantity: result.gross, deductions: result.deductions }).where(eq(schema.measurement.id, m.id));
      fixes.push({ kind: "mesure", target: `${codeOf(m.workItemId)} ${m.label}`.trim(), before: m.quantity, after: result.net, note: `Quantité recalculée à partir de la formule et des valeurs enregistrées : ${fmt(m.quantity)} devient ${fmt(result.net)} ${m.unit}.` });
    }
  }

  // 2. DPGF : quantités reprises du métré, prix reportés des sous-détails validés, montants.
  const documents = await db.select().from(schema.dpgf).where(eq(schema.dpgf.projectId, projectId));
  const breakdowns = await db.select().from(schema.priceBreakdown).where(eq(schema.priceBreakdown.projectId, projectId));
  let lineCount = 0;
  for (const doc of documents) {
    const lines = await db
      .select()
      .from(schema.dpgfLine)
      .where(and(eq(schema.dpgfLine.dpgfId, doc.id), eq(schema.dpgfLine.kind, "poste")));
    let changed = false;
    for (const line of lines) {
      lineCount++;
      const label = [line.code, line.designation].filter(Boolean).join(" ");
      let quantity = line.quantity;
      let unitPrice = line.unitPrice;
      const patch: Partial<typeof schema.dpgfLine.$inferInsert> = {};
      if (line.workItemId && line.unit && line.quantitySource?.startsWith("Métré")) {
        const metre = await metreQuantity(db, line.workItemId, line.unit);
        if (metre && (quantity === null || Number(quantity) !== Number(metre.quantity))) {
          fixes.push({ kind: "quantite_dpgf", target: label, before: quantity, after: metre.quantity, note: `Quantité reprise du métré mise à jour : ${fmt(quantity)} devient ${fmt(metre.quantity)} ${line.unit}.` });
          quantity = metre.quantity;
          patch.quantity = metre.quantity;
          patch.quantitySource = metre.source;
        }
      }
      if (line.priceSource === "Sous-détail validé") {
        const b = breakdowns.find((x) => x.dpgfLineId === line.id && x.locked && x.computedUnitPrice !== null);
        if (b && (unitPrice === null || Number(unitPrice) !== Number(b.computedUnitPrice))) {
          fixes.push({ kind: "prix_sous_detail", target: label, before: unitPrice, after: b.computedUnitPrice, note: `Prix reporté du sous-détail validé : ${fmt(unitPrice)} devient ${fmt(b.computedUnitPrice)}.` });
          unitPrice = b.computedUnitPrice;
          patch.unitPrice = b.computedUnitPrice;
        }
      }
      const amount = lineAmount(quantity, unitPrice);
      if ((amount === null) !== (line.amount === null) || (amount !== null && Number(amount) !== Number(line.amount))) {
        if (!patch.quantity && !patch.unitPrice) fixes.push({ kind: "montant_dpgf", target: label, before: line.amount, after: amount, note: `Montant recalculé, quantité multipliée par le prix unitaire : ${fmt(line.amount)} devient ${fmt(amount)}.` });
        patch.amount = amount;
      }
      if (Object.keys(patch).length) {
        await db.update(schema.dpgfLine).set(patch).where(eq(schema.dpgfLine.id, line.id));
        changed = true;
      }
    }
    // Une DPGF corrigée n'est plus validée en l'état : elle repasse « à valider ».
    if (changed && doc.status === "valide") await db.update(schema.dpgf).set({ status: "a_valider" }).where(eq(schema.dpgf.id, doc.id));
  }

  // 3. Sous-détails : déboursés et prix de vente recalculés.
  for (const b of breakdowns) {
    await recomputeBreakdown(db, b.id);
    const [after] = await db.select({ price: schema.priceBreakdown.computedUnitPrice }).from(schema.priceBreakdown).where(eq(schema.priceBreakdown.id, b.id));
    const before = b.computedUnitPrice;
    const now = after?.price ?? null;
    if ((before === null) !== (now === null) || (before !== null && Number(before) !== Number(now))) {
      fixes.push({ kind: "sous_detail", target: b.designation, before, after: now, note: `Prix de vente du sous-détail recalculé : ${fmt(before)} devient ${fmt(now)}.` });
    }
  }
  return { fixes, checked: { measurements: measures.length, dpgfLines: lineCount, breakdowns: breakdowns.length } };
}

/* ---------- Contrôles ---------- */

/** Métré : mesures incalculables ou de confiance faible, mesures à vérifier, ouvrages sans mesure. */
export async function checkMetre(db: Database, projectId: string): Promise<IssueDraft[]> {
  const items = await db.select().from(schema.workItem).where(eq(schema.workItem.projectId, projectId));
  const measures = await db.select().from(schema.measurement).where(eq(schema.measurement.projectId, projectId));
  const issues: IssueDraft[] = [];
  const label = (m: { label: string; workItemId: string | null }) => [items.find((i) => i.id === m.workItemId)?.code, m.label].filter(Boolean).join(" ");
  for (const m of measures) {
    if (m.status === "rejete") continue;
    const target = [{ type: "measurement", id: m.id }];
    if (m.quantity === null) issues.push({ severity: "majeure", category: "calcul", message: `Mesure incalculable : ${label(m)}`, targets: target });
    else if (m.confidence === "faible" && m.status === "a_verifier") issues.push({ severity: "majeure", category: "source_manquante", message: `Mesure de confiance faible à vérifier : ${label(m)}`, targets: target });
  }
  const pending = measures.filter((m) => m.status === "a_verifier").length;
  if (pending) issues.push({ severity: "information", category: "reserve", message: `${pending} mesure(s) à vérifier avant la validation professionnelle.`, targets: [] });
  for (const item of items) {
    if (!measures.some((m) => m.workItemId === item.id && m.status !== "rejete")) {
      issues.push({ severity: "mineure", category: "completude", message: `Ouvrage sans mesure : ${[item.code, item.designation].filter(Boolean).join(" ")}`, targets: [{ type: "work_item", id: item.id }] });
    }
  }
  return issues;
}

/** Dossier : présence du CCTP et de la DPGF, postes sans prix. */
export async function checkDossier(db: Database, projectId: string): Promise<IssueDraft[]> {
  const issues: IssueDraft[] = [];
  const cctps = await db.select({ id: schema.cctpDocument.id }).from(schema.cctpDocument).where(and(eq(schema.cctpDocument.projectId, projectId), ne(schema.cctpDocument.status, "archive")));
  const dpgfs = await db.select({ id: schema.dpgf.id }).from(schema.dpgf).where(and(eq(schema.dpgf.projectId, projectId), ne(schema.dpgf.status, "archive")));
  if (cctps.length === 0) issues.push({ severity: "bloquante", category: "completude", message: "Aucun CCTP établi pour l’affaire.", targets: [] });
  if (dpgfs.length === 0) issues.push({ severity: "bloquante", category: "completude", message: "Aucune DPGF établie pour l’affaire.", targets: [] });
  return issues;
}

/** Rejoue tous les contrôles du dossier et renvoie le nombre d'anomalies ouvertes par gravité. */
export async function runDossierChecks(db: Database, projectId: string): Promise<{ counts: Record<"bloquante" | "majeure" | "mineure" | "information", number>; documents: number }> {
  const cctps = await db.select({ id: schema.cctpDocument.id }).from(schema.cctpDocument).where(and(eq(schema.cctpDocument.projectId, projectId), ne(schema.cctpDocument.status, "archive")));
  const dpgfs = await db.select({ id: schema.dpgf.id }).from(schema.dpgf).where(and(eq(schema.dpgf.projectId, projectId), ne(schema.dpgf.status, "archive")));
  for (const c of cctps) await replaceIssues(db, { projectId, documentType: "cctp", documentId: c.id }, await checkCctp(db, c.id));
  for (const d of dpgfs) {
    await replaceIssues(db, { projectId, documentType: "dpgf", documentId: d.id }, await checkDpgf(db, d.id));
    await replaceIssues(db, { projectId, documentType: "sous_detail", documentId: d.id }, await checkBreakdowns(db, d.id));
  }
  await replaceIssues(db, { projectId, documentType: "metre", documentId: projectId }, await checkMetre(db, projectId));
  await replaceIssues(db, { projectId, documentType: "dossier", documentId: projectId }, await checkDossier(db, projectId));
  return { counts: await openIssueCounts(db, projectId), documents: cctps.length + dpgfs.length };
}

async function openIssueCounts(db: Database, projectId: string) {
  const rows = await db
    .select({ severity: schema.qualityIssue.severity, n: sql<number>`count(*)::int` })
    .from(schema.qualityIssue)
    .where(and(eq(schema.qualityIssue.projectId, projectId), eq(schema.qualityIssue.status, "ouverte")))
    .groupBy(schema.qualityIssue.severity);
  const n = (s: string) => Number(rows.find((r) => r.severity === s)?.n ?? 0);
  return { bloquante: n("bloquante"), majeure: n("majeure"), mineure: n("mineure"), information: n("information") };
}

/* ---------- Empreinte et niveau ---------- */

/**
 * Empreinte du contenu du dossier (valeurs, pas les statuts de validation) : métré, CCTP, DPGF, sous-détails.
 * Un ajout, une suppression ou une modification la change.
 */
export async function dossierFingerprint(db: Database, projectId: string): Promise<string> {
  const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
  const items = byId(await db.select({ id: schema.workItem.id, code: schema.workItem.code, designation: schema.workItem.designation, unit: schema.workItem.unit }).from(schema.workItem).where(eq(schema.workItem.projectId, projectId)));
  const measures = byId(
    await db
      .select({ id: schema.measurement.id, w: schema.measurement.workItemId, f: schema.measurement.formula, i: schema.measurement.inputs, d: schema.measurement.deductions, q: schema.measurement.quantity, u: schema.measurement.unit })
      .from(schema.measurement)
      .where(eq(schema.measurement.projectId, projectId)),
  ).map((m) => ({ ...m, i: Object.entries(m.i).sort(), d: m.d.map((x) => [x.label, x.formula]) }));
  const cctps = await db.select({ id: schema.cctpDocument.id }).from(schema.cctpDocument).where(eq(schema.cctpDocument.projectId, projectId));
  const sections = cctps.length
    ? byId(
        await db
          .select({ id: schema.cctpSection.id, n: schema.cctpSection.number, t: schema.cctpSection.title, c: schema.cctpSection.content, r: schema.cctpSection.referenceIds })
          .from(schema.cctpSection)
          .where(inArray(schema.cctpSection.documentId, cctps.map((c) => c.id))),
      )
    : [];
  const dpgfs = byId(await db.select({ id: schema.dpgf.id, v: schema.dpgf.vatRate }).from(schema.dpgf).where(eq(schema.dpgf.projectId, projectId)));
  const lines = dpgfs.length
    ? byId(
        await db
          .select({ id: schema.dpgfLine.id, p: schema.dpgfLine.parentId, k: schema.dpgfLine.kind, d: schema.dpgfLine.designation, u: schema.dpgfLine.unit, q: schema.dpgfLine.quantity, pu: schema.dpgfLine.unitPrice, a: schema.dpgfLine.amount })
          .from(schema.dpgfLine)
          .where(inArray(schema.dpgfLine.dpgfId, dpgfs.map((d) => d.id))),
      )
    : [];
  const breakdowns = byId(await db.select({ id: schema.priceBreakdown.id, p: schema.priceBreakdown.computedUnitPrice }).from(schema.priceBreakdown).where(eq(schema.priceBreakdown.projectId, projectId)));
  const components = breakdowns.length
    ? byId(
        await db
          .select({ id: schema.priceBreakdownComponent.id, b: schema.priceBreakdownComponent.breakdownId, c: schema.priceBreakdownComponent.category, q: schema.priceBreakdownComponent.quantity, u: schema.priceBreakdownComponent.unitCost, l: schema.priceBreakdownComponent.lossRate })
          .from(schema.priceBreakdownComponent)
          .where(inArray(schema.priceBreakdownComponent.breakdownId, breakdowns.map((b) => b.id))),
      )
    : [];
  return createHash("sha256").update(JSON.stringify({ items, measures, sections, dpgfs, lines, breakdowns, components })).digest("hex");
}

export interface DossierStatus {
  level: DossierLevel;
  levelLabel: string;
  criteria: LevelCriterion[];
  issues: { bloquante: number; majeure: number; mineure: number; information: number };
  audit: { id: string; createdAt: Date; upToDate: boolean; fixes: number } | null;
  validation: { signedBy: string; qualification: string; createdAt: Date; current: boolean } | null;
  documents: Array<{ type: "cctp" | "dpgf"; id: string; title: string; status: string; version: number }>;
  running: boolean;
}

const CONTENT_JOBS = ["analyse_plans", "generation_cctp", "generation_dpgf", "sous_detail", "generation_dossier", "controle_qualite"] as const;

/** Niveau de validation du dossier, calculé sur son état réel. */
export async function dossierStatus(db: Database, projectId: string, options: { ignoreJobId?: string } = {}): Promise<DossierStatus> {
  const cctps = await db.select().from(schema.cctpDocument).where(and(eq(schema.cctpDocument.projectId, projectId), ne(schema.cctpDocument.status, "archive"))).orderBy(asc(schema.cctpDocument.createdAt));
  const dpgfs = await db.select().from(schema.dpgf).where(and(eq(schema.dpgf.projectId, projectId), ne(schema.dpgf.status, "archive"))).orderBy(asc(schema.dpgf.createdAt));
  const running = (
    await db
      .select({ id: schema.generationJob.id })
      .from(schema.generationJob)
      .where(
        and(
          eq(schema.generationJob.projectId, projectId),
          inArray(schema.generationJob.kind, [...CONTENT_JOBS]),
          inArray(schema.generationJob.status, ["en_attente", "en_cours"]),
          // Le traitement qui calcule le niveau (contrôle, génération du dossier) ne se compte pas lui-même.
          options.ignoreJobId ? ne(schema.generationJob.id, options.ignoreJobId) : undefined,
        ),
      )
      .limit(1)
  ).length > 0;
  const issues = await openIssueCounts(db, projectId);
  const [lastAudit] = await db.select().from(schema.dossierAudit).where(eq(schema.dossierAudit.projectId, projectId)).orderBy(desc(schema.dossierAudit.createdAt)).limit(1);
  const fingerprint = await dossierFingerprint(db, projectId);
  const auditUpToDate = Boolean(lastAudit && lastAudit.summary.fingerprint === fingerprint);

  const measures = await db.select({ status: schema.measurement.status }).from(schema.measurement).where(eq(schema.measurement.projectId, projectId));
  const pendingMeasures = measures.filter((m) => m.status === "a_verifier").length;
  const unpriced = dpgfs.length
    ? Number(
        (
          await db
            .select({ n: sql<number>`count(*)::int` })
            .from(schema.dpgfLine)
            .where(and(inArray(schema.dpgfLine.dpgfId, dpgfs.map((d) => d.id)), eq(schema.dpgfLine.kind, "poste"), sql`${schema.dpgfLine.unitPrice} is null`))
        )[0]?.n ?? 0,
      )
    : 0;
  const unwritten = cctps.length
    ? Number(
        (
          await db
            .select({ n: sql<number>`count(*)::int` })
            .from(schema.cctpSection)
            .where(and(inArray(schema.cctpSection.documentId, cctps.map((c) => c.id)), eq(schema.cctpSection.kind, "article"), eq(schema.cctpSection.status, "a_rediger")))
        )[0]?.n ?? 0,
      )
    : 0;

  const documents = [
    ...cctps.map((c) => ({ type: "cctp" as const, id: c.id, title: c.title, status: c.status, version: c.currentVersion })),
    ...dpgfs.map((d) => ({ type: "dpgf" as const, id: d.id, title: d.title, status: d.status, version: d.currentVersion })),
  ];
  const allValidated = documents.length > 0 && cctps.length > 0 && dpgfs.length > 0 && documents.every((d) => d.status === "valide");
  const [lastValidatedVersion] = documents.length
    ? await db
        .select({ createdAt: schema.documentVersion.createdAt })
        .from(schema.documentVersion)
        .where(and(eq(schema.documentVersion.projectId, projectId), eq(schema.documentVersion.validated, true), inArray(schema.documentVersion.documentId, documents.map((d) => d.id))))
        .orderBy(desc(schema.documentVersion.createdAt))
        .limit(1)
    : [];
  const [declaration] = await db.select().from(schema.dossierValidation).where(eq(schema.dossierValidation.projectId, projectId)).orderBy(desc(schema.dossierValidation.createdAt)).limit(1);
  const declarationCurrent = Boolean(declaration && allValidated && (!lastValidatedVersion || declaration.createdAt >= lastValidatedVersion.createdAt) && auditUpToDate);

  const missing2: string[] = [];
  if (cctps.length === 0) missing2.push("aucun CCTP");
  if (dpgfs.length === 0) missing2.push("aucune DPGF");
  if (running) missing2.push("traitement en cours");
  if (issues.bloquante) missing2.push(`${issues.bloquante} anomalie(s) bloquante(s)`);
  const missing3: string[] = [];
  if (!lastAudit) missing3.push("contrôle indépendant jamais lancé");
  else if (!auditUpToDate) missing3.push("dossier modifié depuis le dernier contrôle indépendant");
  if (issues.majeure) missing3.push(`${issues.majeure} anomalie(s) majeure(s)`);
  const missing4: string[] = [];
  if (pendingMeasures) missing4.push(`${pendingMeasures} mesure(s) à vérifier`);
  if (unpriced) missing4.push(`${unpriced} poste(s) sans prix`);
  if (unwritten) missing4.push(`${unwritten} article(s) à rédiger`);
  const missing5: string[] = [];
  if (!allValidated) missing5.push("CCTP et DPGF à valider");
  if (!declarationCurrent) missing5.push(declaration ? "déclaration à renouveler après les dernières modifications" : "déclaration de validation à signer");

  const criteria: LevelCriterion[] = [
    { level: "terminee_avec_reserves", label: "CCTP et DPGF établis, sans anomalie bloquante ni traitement en cours", met: missing2.length === 0, detail: missing2.join(", ") || null },
    { level: "verification_automatique_reussie", label: "Contrôle indépendant à jour, sans anomalie majeure", met: missing3.length === 0, detail: missing3.join(", ") || null },
    { level: "pret_pour_validation", label: "Mesures vérifiées, postes chiffrés, articles rédigés", met: missing4.length === 0, detail: missing4.join(", ") || null },
    { level: "valide_professionnel", label: "Documents validés et déclaration signée", met: missing5.length === 0, detail: missing5.join(", ") || null },
  ];
  let level: DossierLevel = "brouillon";
  for (const c of criteria) {
    if (!c.met) break;
    level = c.level;
  }
  return {
    level,
    levelLabel: DOSSIER_LEVEL_LABELS[level],
    criteria,
    issues,
    audit: lastAudit ? { id: lastAudit.id, createdAt: lastAudit.createdAt, upToDate: auditUpToDate, fixes: lastAudit.summary.fixes.length } : null,
    validation: declaration ? { signedBy: declaration.signedBy, qualification: declaration.qualification, createdAt: declaration.createdAt, current: declarationCurrent } : null,
    documents,
    running,
  };
}

/** Rang d'un niveau, pour comparer. */
export const levelRank = (level: DossierLevel) => DOSSIER_LEVELS.indexOf(level);
