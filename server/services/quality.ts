/**
 * Contrôle qualité des documents produits : règles déterministes, vérifiables, rejouées à chaque
 * génération ou validation. Une anomalie bloquante ouverte empêche la validation du document.
 * Les anomalies que l'administrateur a choisi d'ignorer restent ignorées tant qu'elles sont identiques.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { DocumentType, IssueCategory, IssueSeverity } from "../../shared/enums.js";
import type { CctpBlock } from "../ai/schemas.js";
import { type Database, schema } from "../db/index.js";
import { normalizeUnit } from "./units.js";
import { readSetting } from "./settings.js";

export interface IssueDraft {
  severity: IssueSeverity;
  category: IssueCategory;
  message: string;
  targets: Array<{ type: string; id: string }>;
}

const keyOf = (i: { message: string }) => i.message;

/** Remplace les anomalies ouvertes d'un document par celles du dernier contrôle. */
export async function replaceIssues(db: Database, scope: { projectId: string; documentType: DocumentType; documentId: string }, drafts: IssueDraft[]): Promise<number> {
  const q = schema.qualityIssue;
  const where = and(eq(q.projectId, scope.projectId), eq(q.documentType, scope.documentType), eq(q.documentId, scope.documentId));
  const existing = await db.select().from(q).where(where);
  const ignored = new Set(existing.filter((i) => i.status === "ignoree").map(keyOf));
  const fresh = drafts.filter((d) => !ignored.has(keyOf(d)));
  await db.transaction(async (tx) => {
    await tx.delete(q).where(and(where, eq(q.status, "ouverte")));
    if (fresh.length) await tx.insert(q).values(fresh.map((d) => ({ ...scope, ...d })));
  });
  return fresh.length;
}

/** Codes normatifs reconnaissables dans un texte (NF EN 206, NF DTU 21, DTU 13.11, NM 10.1.008, EN 1992-1-1…). */
const NORM_PATTERN = /\b(?:NF\s?(?:EN|DTU|P|A|C)\s?[0-9][0-9.\-/]*(?:[-/][A-Z]{1,3})?|NF\s?DTU\s?[0-9][0-9.]*|DTU\s?[0-9][0-9.]*|NM\s?[0-9][0-9.]*|EN\s?[0-9]{3,5}(?:-[0-9]+)*)/g;

function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/\s+/g, "").replace(/\/CN$/, "");
}

export function blocksText(blocks: CctpBlock[]): string {
  return blocks.map((b) => [b.text ?? "", ...b.items].join("\n")).join("\n");
}

/** Contrôle d'un CCTP : rédaction complète, références vérifiées, aucune norme hors référentiel, ouvrages couverts. */
export async function checkCctp(db: Database, documentId: string): Promise<IssueDraft[]> {
  const [doc] = await db.select().from(schema.cctpDocument).where(eq(schema.cctpDocument.id, documentId));
  if (!doc) return [];
  const sections = await db.select().from(schema.cctpSection).where(eq(schema.cctpSection.documentId, documentId));
  const articles = sections.filter((s) => s.kind === "article");
  const issues: IssueDraft[] = [];

  for (const a of articles) {
    const blocks = (a.content ?? []) as CctpBlock[];
    if (blocks.length === 0) issues.push({ severity: "majeure", category: "completude", message: `Article non rédigé : ${a.number} ${a.title}`, targets: [{ type: "cctp_section", id: a.id }] });
  }

  // Références citées : chacune doit exister et être vérifiée.
  const cited = new Map<string, string[]>();
  for (const a of articles) for (const id of a.referenceIds ?? []) cited.set(id, [...(cited.get(id) ?? []), a.id]);
  const refs = cited.size ? await db.select().from(schema.technicalReference).where(inArray(schema.technicalReference.id, [...cited.keys()])) : [];
  const allRefs = await db.select({ code: schema.technicalReference.code, status: schema.technicalReference.verificationStatus }).from(schema.technicalReference);
  const knownCodes = new Set(allRefs.filter((r) => r.status !== "rejete").map((r) => normalizeCode(r.code)));
  for (const [id, sectionIds] of cited) {
    const ref = refs.find((r) => r.id === id);
    const where = articles.filter((a) => sectionIds.includes(a.id)).map((a) => a.number).join(", ");
    const targets = sectionIds.map((sid) => ({ type: "cctp_section", id: sid }));
    if (!ref) issues.push({ severity: "bloquante", category: "reference", message: `Référence citée introuvable dans le référentiel (articles ${where}).`, targets });
    else if (ref.verificationStatus === "rejete") issues.push({ severity: "bloquante", category: "reference", message: `Référence rejetée citée : ${ref.code} (articles ${where}).`, targets });
    else if (ref.verificationStatus === "a_verifier") issues.push({ severity: "majeure", category: "reference", message: `Référence à vérifier avant diffusion : ${ref.code} (articles ${where}).`, targets });
  }

  // Normes écrites dans le texte sans figurer au référentiel : jamais de norme inventée.
  const unknown = new Map<string, string[]>();
  for (const a of articles) {
    const text = blocksText((a.content ?? []) as CctpBlock[]);
    for (const match of text.matchAll(NORM_PATTERN)) {
      const code = match[0].trim();
      const normalized = normalizeCode(code);
      const covered = [...knownCodes].some((k) => normalized === k || normalized.startsWith(k) || k.startsWith(normalized));
      if (!covered) unknown.set(code, [...new Set([...(unknown.get(code) ?? []), a.id])]);
    }
  }
  for (const [code, sectionIds] of unknown) {
    const where = articles.filter((a) => sectionIds.includes(a.id)).map((a) => a.number).join(", ");
    issues.push({
      severity: "majeure",
      category: "reference",
      message: `Norme citée hors référentiel : « ${code} » (articles ${where}). Ajoutez-la au référentiel après vérification, ou retirez-la.`,
      targets: sectionIds.map((id) => ({ type: "cctp_section", id })),
    });
  }

  // Ouvrages du métré non couverts par un article.
  const items = await db
    .select()
    .from(schema.workItem)
    .where(and(eq(schema.workItem.projectId, doc.projectId), doc.lotId ? eq(schema.workItem.lotId, doc.lotId) : undefined));
  const covered = new Set(articles.map((a) => a.workItemId).filter(Boolean));
  for (const item of items) {
    if (!covered.has(item.id)) {
      issues.push({ severity: "mineure", category: "completude", message: `Ouvrage du métré sans article dédié : ${[item.code, item.designation].filter(Boolean).join(" ")}`, targets: [{ type: "work_item", id: item.id }] });
    }
  }
  if (items.length === 0) {
    issues.push({ severity: "information", category: "source_manquante", message: "CCTP rédigé sans métré : consistance des travaux et dispositions à confirmer sur plans.", targets: [] });
  }
  return issues;
}

/** Une anomalie bloquante ouverte empêche la validation. */
export async function hasBlockingIssues(db: Database, documentType: DocumentType, documentId: string): Promise<boolean> {
  const q = schema.qualityIssue;
  const [row] = await db
    .select({ id: q.id })
    .from(q)
    .where(and(eq(q.documentType, documentType), eq(q.documentId, documentId), eq(q.status, "ouverte"), eq(q.severity, "bloquante")))
    .limit(1);
  return Boolean(row);
}

/** Contrôle d'une DPGF : quantités, liens avec le CCTP et le métré, unités, doublons, chiffrage. */
export async function checkDpgf(db: Database, dpgfId: string): Promise<IssueDraft[]> {
  const [doc] = await db.select().from(schema.dpgf).where(eq(schema.dpgf.id, dpgfId));
  if (!doc) return [];
  const lines = await db.select().from(schema.dpgfLine).where(eq(schema.dpgfLine.dpgfId, dpgfId));
  const postes = lines.filter((l) => l.kind === "poste");
  const issues: IssueDraft[] = [];
  const label = (l: { code: string | null; designation: string }) => [l.code, l.designation].filter(Boolean).join(" ");
  const target = (id: string) => [{ type: "dpgf_line", id }];

  const items = await db.select().from(schema.workItem).where(eq(schema.workItem.projectId, doc.projectId));
  const measures = items.length
    ? await db
        .select()
        .from(schema.measurement)
        .where(inArray(schema.measurement.workItemId, items.map((i) => i.id)))
    : [];

  for (const p of postes) {
    if (p.quantity === null) issues.push({ severity: "majeure", category: "completude", message: `Quantité à métrer : ${label(p)}`, targets: target(p.id) });
    if (!p.cctpRef && !p.cctpSectionId) issues.push({ severity: "majeure", category: "tracabilite", message: `Poste sans article du CCTP : ${label(p)}`, targets: target(p.id) });
    if (p.workItemId) {
      const item = items.find((i) => i.id === p.workItemId);
      const own = measures.filter((m) => m.workItemId === p.workItemId && m.status !== "rejete");
      if (item?.unit && p.unit && normalizeUnit(item.unit) !== normalizeUnit(p.unit)) {
        issues.push({ severity: "majeure", category: "unite", message: `Unité différente du métré (${p.unit} au lieu de ${item.unit}) : ${label(p)}`, targets: target(p.id) });
      }
      if (p.quantity !== null && own.some((m) => m.status === "a_verifier")) {
        issues.push({ severity: "mineure", category: "source_manquante", message: `Quantité issue d’un métré non vérifié : ${label(p)}`, targets: target(p.id) });
      }
    }
  }

  // Doublons : même désignation dans le même chapitre.
  const seen = new Map<string, string>();
  for (const p of postes) {
    const key = `${p.parentId}:${p.designation.trim().toLowerCase()}`;
    const first = seen.get(key);
    if (first) issues.push({ severity: "mineure", category: "doublon", message: `Poste en double : ${label(p)}`, targets: [...target(first), ...target(p.id)] });
    else seen.set(key, p.id);
  }

  // Articles de mise en œuvre du CCTP sans poste correspondant.
  if (doc.cctpDocumentId) {
    const sections = await db.select().from(schema.cctpSection).where(eq(schema.cctpSection.documentId, doc.cctpDocumentId));
    const referenced = new Set(postes.map((p) => p.cctpSectionId).filter(Boolean));
    for (const s of sections) {
      if (s.kind === "article" && s.workItemId && !referenced.has(s.id)) {
        issues.push({ severity: "mineure", category: "completude", message: `Article du CCTP sans poste dans la DPGF : ${s.number} ${s.title}`, targets: [{ type: "cctp_section", id: s.id }] });
      }
    }
  }

  const unpriced = postes.filter((p) => p.unitPrice === null).length;
  if (unpriced) issues.push({ severity: "information", category: "completude", message: `${unpriced} poste(s) sans prix unitaire : à chiffrer (sous-détails ou saisie).`, targets: [] });
  return issues;
}

/** Contrôle des sous-détails d'une DPGF : prix manquants, prix à vérifier ou anciens, hypothèses, cohérence avec la DPGF. */
export async function checkBreakdowns(db: Database, dpgfId: string): Promise<IssueDraft[]> {
  const lines = await db
    .select()
    .from(schema.dpgfLine)
    .where(and(eq(schema.dpgfLine.dpgfId, dpgfId), eq(schema.dpgfLine.kind, "poste")));
  if (lines.length === 0) return [];
  const breakdowns = await db.select().from(schema.priceBreakdown).where(inArray(schema.priceBreakdown.dpgfLineId, lines.map((l) => l.id)));
  const components = breakdowns.length
    ? await db.select().from(schema.priceBreakdownComponent).where(inArray(schema.priceBreakdownComponent.breakdownId, breakdowns.map((b) => b.id)))
    : [];
  const itemIds = [...new Set(components.map((c) => c.priceItemId).filter((v): v is string => Boolean(v)))];
  const items = itemIds.length ? await db.select().from(schema.priceItem).where(inArray(schema.priceItem.id, itemIds)) : [];
  const { stalePriceMonths } = await readSetting("alertes");
  const stale = new Date();
  stale.setMonth(stale.getMonth() - stalePriceMonths);
  const staleDate = stale.toISOString().slice(0, 10);
  const issues: IssueDraft[] = [];
  const label = (l: { code: string | null; designation: string }) => [l.code, l.designation].filter(Boolean).join(" ");

  const without = lines.filter((l) => !breakdowns.some((b) => b.dpgfLineId === l.id));
  if (without.length) issues.push({ severity: "information", category: "completude", message: `${without.length} poste(s) sans sous-détail.`, targets: [] });

  let hypotheses = 0;
  let toApply = 0;
  for (const b of breakdowns) {
    const line = lines.find((l) => l.id === b.dpgfLineId)!;
    const own = components.filter((c) => c.breakdownId === b.id);
    const target = [{ type: "dpgf_line", id: line.id }];
    if (own.length === 0) issues.push({ severity: "majeure", category: "completude", message: `Sous-détail vide, poste ${label(line)}`, targets: target });
    const missing = own.filter((c) => c.unitCost === null);
    if (missing.length) {
      issues.push({ severity: "majeure", category: "source_manquante", message: `Prix manquant pour ${missing.map((c) => c.designation).join(", ")}, poste ${label(line)}`, targets: target });
    }
    for (const c of own) {
      if (c.isHypothesis) hypotheses++;
      const item = items.find((i) => i.id === c.priceItemId);
      if (!item) continue;
      if (item.verificationStatus === "a_verifier") issues.push({ severity: "mineure", category: "source_manquante", message: `Prix à vérifier utilisé : ${item.designation}, poste ${label(line)}`, targets: target });
      if (item.priceDate < staleDate) issues.push({ severity: "mineure", category: "version", message: `Prix de plus de ${stalePriceMonths} mois : ${item.designation} du ${item.priceDate.split("-").reverse().join("/")}, poste ${label(line)}`, targets: target });
      if (item.archivedAt) issues.push({ severity: "majeure", category: "source_manquante", message: `Prix archivé utilisé : ${item.designation}, poste ${label(line)}`, targets: target });
    }
    if (b.locked && b.computedUnitPrice !== null) {
      if (line.unitPrice === null) toApply++;
      else if (Number(line.unitPrice) !== Number(b.computedUnitPrice)) {
        issues.push(
          line.priceSource === "Sous-détail validé"
            ? { severity: "majeure", category: "incoherence", message: `Prix de la DPGF différent du sous-détail validé, à reporter de nouveau : poste ${label(line)}`, targets: target }
            : { severity: "mineure", category: "incoherence", message: `Prix saisi dans la DPGF différent du sous-détail validé : poste ${label(line)}`, targets: target },
        );
      }
    }
  }
  if (toApply) issues.push({ severity: "information", category: "completude", message: `${toApply} sous-détail(s) validé(s) dont le prix n’est pas encore reporté dans la DPGF.`, targets: [] });
  if (hypotheses) issues.push({ severity: "information", category: "reserve", message: `${hypotheses} consommation(s) proposée(s) par l’agent : hypothèses à confirmer.`, targets: [] });
  const rates = await readSetting("chiffrage");
  if (!rates.overheadRate && !rates.contingencyRate && !rates.marginRate) {
    issues.push({ severity: "information", category: "completude", message: "Frais généraux, aléas et marge non saisis dans Paramètres, Chiffrage : le prix de vente est égal au déboursé.", targets: [] });
  }
  return issues;
}
