/**
 * Contrôle qualité des documents produits : règles déterministes, vérifiables, rejouées à chaque
 * génération ou validation. Une anomalie bloquante ouverte empêche la validation du document.
 * Les anomalies que l'administrateur a choisi d'ignorer restent ignorées tant qu'elles sont identiques.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { DocumentType, IssueCategory, IssueSeverity } from "../../shared/enums.js";
import type { CctpBlock } from "../ai/schemas.js";
import { type Database, schema } from "../db/index.js";

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
