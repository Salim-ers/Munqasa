/**
 * Contrôle qualité des documents produits : règles déterministes, vérifiables, rejouées à chaque
 * génération ou validation. Une anomalie bloquante ouverte empêche la validation du document.
 * Les anomalies que l'administrateur a choisi d'ignorer restent ignorées tant qu'elles sont identiques.
 * Chaque anomalie est rattachée à l'un des quinze points du contrôle avant export (shared/audit.ts).
 */
import { and, eq, inArray } from "drizzle-orm";
import type { AuditPoint } from "../../shared/audit.js";
import type { DocumentType, IssueCategory, IssueSeverity } from "../../shared/enums.js";
import { isHistoricalPrice } from "../../shared/prices.js";
import type { CctpBlock } from "../ai/schemas.js";
import { type Database, schema } from "../db/index.js";
import { Dec } from "./decimal.js";
import { lineAmount } from "./dpgf.js";
import { lossesAlreadyIncluded } from "./pricing.js";
import { isKnownUnit, normalizeUnit, sameUnit } from "./units.js";
import { readSetting } from "./settings.js";

export interface IssueDraft {
  severity: IssueSeverity;
  category: IssueCategory;
  point: AuditPoint;
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
    if (fresh.length) await tx.insert(q).values(fresh.map(({ point, ...d }) => ({ ...scope, ...d, auditPoint: point })));
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

const fmt = (v: string | null) => (v === null ? "vide" : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 }).format(Number(v)).replace(/[\u00a0\u202f]/g, " "));

/**
 * Taux de TVA courants : France (métropole, Corse, départements d'outre-mer : CGI, art. 278 et suivants,
 * 297 et 296) et Maroc (CGI marocain, art. 98 et 99). Un autre taux n'est pas refusé : il est à confirmer.
 */
const USUAL_VAT: Record<string, string[]> = { FR: ["20", "10", "5.5", "2.1", "13", "8.5", "1.75", "1.05", "0.9"], MA: ["20", "14", "10", "7"] };
const VAT_COUNTRY: Record<string, string> = { FR: "en France", MA: "au Maroc" };

/** Taux de TVA à confirmer pour le pays, ou null s'il est courant. */
export function unusualVat(rate: string | null, country: string): string | null {
  if (rate === null || !USUAL_VAT[country]) return null;
  return USUAL_VAT[country]!.includes(new Dec(rate).toFixed()) ? null : `Taux de TVA de ${fmt(rate)} % inhabituel ${VAT_COUNTRY[country]} : à confirmer.`;
}

/** Au-delà de ce taux, des pertes sont à confirmer (chutes de découpe, casse) : elles ne sont pas refusées. */
const HIGH_LOSS_RATE = 25;

/** Lot de l'affaire : son numéro et son libellé, ou la mention d'un lot étranger à l'affaire. */
async function projectLots(db: Database, projectId: string) {
  return db.select().from(schema.projectLot).where(eq(schema.projectLot.projectId, projectId));
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
    if (blocks.length === 0) issues.push({ severity: "majeure", category: "completude", point: "statuts", message: `Article non rédigé : ${a.number} ${a.title}`, targets: [{ type: "cctp_section", id: a.id }] });
  }

  // Numéros d'article en double : la DPGF et les renvois ne désigneraient plus un article unique.
  const byNumber = new Map<string, typeof articles>();
  for (const a of articles) if (a.number.trim()) byNumber.set(a.number.trim(), [...(byNumber.get(a.number.trim()) ?? []), a]);
  for (const [number, list] of byNumber) {
    if (list.length > 1) issues.push({ severity: "majeure", category: "doublon", point: "doublons", message: `Numéro d’article en double : ${number} (${list.map((a) => a.title).join(", ")})`, targets: list.map((a) => ({ type: "cctp_section", id: a.id })) });
  }

  if (doc.lotId && !(await projectLots(db, doc.projectId)).some((l) => l.id === doc.lotId)) {
    issues.push({ severity: "bloquante", category: "incoherence", point: "lots", message: "CCTP rattaché à un lot qui n’appartient pas à l’affaire.", targets: [] });
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
    if (!ref) issues.push({ severity: "bloquante", category: "reference", point: "references_reglementaires", message: `Référence citée introuvable dans le référentiel (articles ${where}).`, targets });
    else if (ref.verificationStatus === "rejete") issues.push({ severity: "bloquante", category: "reference", point: "references_reglementaires", message: `Référence rejetée citée : ${ref.code} (articles ${where}).`, targets });
    else if (ref.verificationStatus === "a_verifier") issues.push({ severity: "majeure", category: "reference", point: "references_reglementaires", message: `Référence à vérifier avant diffusion : ${ref.code} (articles ${where}).`, targets });
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
      point: "references_reglementaires",
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
      issues.push({ severity: "mineure", category: "completude", point: "ouvrages", message: `Ouvrage du métré sans article dédié : ${[item.code, item.designation].filter(Boolean).join(" ")}`, targets: [{ type: "work_item", id: item.id }] });
    }
  }
  if (items.length === 0) {
    issues.push({ severity: "information", category: "source_manquante", point: "ouvrages", message: "CCTP rédigé sans métré : consistance des travaux et dispositions à confirmer sur plans.", targets: [] });
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

/** Quantité du métré d'un ouvrage dans une unité : somme des mesures non rejetées (comme services/dpgf.ts, metreQuantity). */
function metreSum(measures: Array<{ workItemId: string | null; status: string; quantity: string | null; unit: string }>, workItemId: string, unit: string): string | null {
  const matching = measures.filter((m) => m.workItemId === workItemId && m.status !== "rejete" && m.quantity !== null && sameUnit(m.unit, unit));
  if (matching.length === 0) return null;
  return matching.reduce((sum, m) => sum.plus(m.quantity!), new Dec(0)).toDecimalPlaces(4).toFixed(4);
}

/** Contrôle d'une DPGF : quantités, liens avec le CCTP et le métré, unités, doublons, montants, lots, taxes, chiffrage. */
export async function checkDpgf(db: Database, dpgfId: string): Promise<IssueDraft[]> {
  const [doc] = await db.select().from(schema.dpgf).where(eq(schema.dpgf.id, dpgfId));
  if (!doc) return [];
  const [project] = await db.select({ country: schema.project.country }).from(schema.project).where(eq(schema.project.id, doc.projectId));
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
  const lots = await projectLots(db, doc.projectId);
  const lotName = (id: string | null) => {
    const lot = lots.find((l) => l.id === id);
    return lot ? `lot ${lot.code}` : "sans lot";
  };
  if (doc.lotId && !lots.some((l) => l.id === doc.lotId)) issues.push({ severity: "bloquante", category: "incoherence", point: "lots", message: "DPGF rattachée à un lot qui n’appartient pas à l’affaire.", targets: [] });

  for (const p of postes) {
    if (p.quantity === null) issues.push({ severity: "majeure", category: "completude", point: "quantites", message: `Quantité à métrer : ${label(p)}`, targets: target(p.id) });
    else if (new Dec(p.quantity).lte(0)) issues.push({ severity: "majeure", category: "calcul", point: "quantites", message: `Quantité nulle ou négative (${fmt(p.quantity)}) : ${label(p)}`, targets: target(p.id) });
    if (!p.cctpRef && !p.cctpSectionId) issues.push({ severity: "majeure", category: "tracabilite", point: "references_documents", message: `Poste sans article du CCTP : ${label(p)}`, targets: target(p.id) });
    if (!p.unit?.trim()) issues.push({ severity: "majeure", category: "unite", point: "unites", message: `Poste sans unité : ${label(p)}`, targets: target(p.id) });
    else if (!isKnownUnit(p.unit)) issues.push({ severity: "mineure", category: "unite", point: "unites", message: `Unité non reconnue « ${p.unit} » : ${label(p)}`, targets: target(p.id) });
    if (p.unitPrice !== null && new Dec(p.unitPrice).lte(0)) issues.push({ severity: "majeure", category: "calcul", point: "prix", message: `Prix unitaire nul ou négatif (${fmt(p.unitPrice)}) : ${label(p)}`, targets: target(p.id) });
    // Montant enregistré : il doit être la quantité multipliée par le prix unitaire, arrondie au centime.
    const amount = lineAmount(p.quantity, p.unitPrice);
    if ((amount === null) !== (p.amount === null) || (amount !== null && !new Dec(amount).eq(p.amount!))) {
      issues.push({ severity: "bloquante", category: "calcul", point: "totaux", message: `Montant enregistré différent de la quantité multipliée par le prix (${fmt(p.amount)} au lieu de ${fmt(amount)}) : ${label(p)}`, targets: target(p.id) });
    }
    if (p.workItemId) {
      const item = items.find((i) => i.id === p.workItemId);
      const own = measures.filter((m) => m.workItemId === p.workItemId && m.status !== "rejete");
      if (item?.unit && p.unit && normalizeUnit(item.unit) !== normalizeUnit(p.unit)) {
        issues.push({ severity: "majeure", category: "unite", point: "unites", message: `Unité différente du métré (${p.unit} au lieu de ${item.unit}) : ${label(p)}`, targets: target(p.id) });
      }
      if (p.quantity !== null && own.some((m) => m.status === "a_verifier")) {
        issues.push({ severity: "mineure", category: "source_manquante", point: "quantites", message: `Quantité issue d’un métré non vérifié : ${label(p)}`, targets: target(p.id) });
      }
      // Quantité reprise du métré : elle doit être celle du métré actuel, jamais une autre valeur.
      if (p.unit && p.quantitySource?.startsWith("Métré")) {
        const current = metreSum(measures, p.workItemId, p.unit);
        if (current !== null && (p.quantity === null || !new Dec(p.quantity).eq(current))) {
          issues.push({ severity: "majeure", category: "incoherence", point: "quantites", message: `Quantité reprise du métré à mettre à jour (${fmt(p.quantity)} au lieu de ${fmt(current)} ${p.unit}) : ${label(p)}`, targets: target(p.id) });
        }
      }
      if (item && doc.lotId && item.lotId && item.lotId !== doc.lotId) {
        issues.push({ severity: "majeure", category: "incoherence", point: "lots", message: `Ouvrage d’un autre lot (${lotName(item.lotId)}) dans la DPGF du ${lotName(doc.lotId)} : ${label(p)}`, targets: target(p.id) });
      }
    }
  }

  // Doublons : même désignation dans le même chapitre, ou même code.
  const seen = new Map<string, string>();
  for (const p of postes) {
    const key = `${p.parentId}:${p.designation.trim().toLowerCase()}`;
    const first = seen.get(key);
    if (first) issues.push({ severity: "mineure", category: "doublon", point: "doublons", message: `Poste en double : ${label(p)}`, targets: [...target(first), ...target(p.id)] });
    else seen.set(key, p.id);
  }
  const byCode = new Map<string, typeof lines>();
  for (const l of lines) if (l.code?.trim()) byCode.set(l.code.trim(), [...(byCode.get(l.code.trim()) ?? []), l]);
  for (const [code, list] of byCode) {
    if (list.length > 1) issues.push({ severity: "majeure", category: "doublon", point: "doublons", message: `Code en double dans la DPGF : ${code} (${list.map((l) => l.designation).join(", ")})`, targets: list.map((l) => ({ type: "dpgf_line", id: l.id })) });
  }

  // Ouvrages mesurés du lot absents d'une DPGF établie depuis le métré.
  if (postes.some((p) => p.workItemId)) {
    const listed = new Set(postes.map((p) => p.workItemId).filter(Boolean));
    for (const item of items.filter((i) => (doc.lotId ? i.lotId === doc.lotId : true) && !listed.has(i.id))) {
      if (measures.some((m) => m.workItemId === item.id && m.status !== "rejete" && m.quantity !== null)) {
        issues.push({ severity: "mineure", category: "completude", point: "ouvrages", message: `Ouvrage mesuré absent de la DPGF : ${[item.code, item.designation].filter(Boolean).join(" ")}`, targets: [{ type: "work_item", id: item.id }] });
      }
    }
  }

  // Articles du CCTP : ceux qui demandent un poste, et les renvois des postes vers un article existant.
  if (doc.cctpDocumentId) {
    const sections = await db.select().from(schema.cctpSection).where(eq(schema.cctpSection.documentId, doc.cctpDocumentId));
    const referenced = new Set(postes.map((p) => p.cctpSectionId).filter(Boolean));
    for (const s of sections) {
      if (s.kind === "article" && s.workItemId && !referenced.has(s.id)) {
        issues.push({ severity: "mineure", category: "completude", point: "references_documents", message: `Article du CCTP sans poste dans la DPGF : ${s.number} ${s.title}`, targets: [{ type: "cctp_section", id: s.id }] });
      }
    }
    const numbers = new Set(sections.filter((s) => s.kind === "article").map((s) => s.number.trim()));
    for (const p of postes) {
      if (p.cctpSectionId && !sections.some((s) => s.id === p.cctpSectionId)) {
        issues.push({ severity: "majeure", category: "tracabilite", point: "references_documents", message: `Article du CCTP désigné par le poste absent du CCTP de la DPGF : ${label(p)}`, targets: target(p.id) });
      } else if (!p.cctpSectionId && p.cctpRef && !numbers.has(p.cctpRef.trim())) {
        issues.push({ severity: "mineure", category: "tracabilite", point: "references_documents", message: `Renvoi à l’article ${p.cctpRef} introuvable dans le CCTP : ${label(p)}`, targets: target(p.id) });
      }
    }
  }

  // Prix repris de la bibliothèque : à vérifier, ancien, archivé, de fiabilité faible, ou incohérent avec le poste.
  const priceIds = [...new Set(postes.map((p) => p.priceItemId).filter((v): v is string => Boolean(v)))];
  if (priceIds.length) {
    const prices = await db.select().from(schema.priceItem).where(inArray(schema.priceItem.id, priceIds));
    const { stalePriceMonths } = await readSetting("alertes");
    for (const p of postes) {
      const price = prices.find((x) => x.id === p.priceItemId);
      if (!price) continue;
      if (price.archivedAt) issues.push({ severity: "majeure", category: "source_manquante", point: "prix", message: `Prix de bibliothèque archivé : ${price.designation}, poste ${label(p)}`, targets: target(p.id) });
      if (price.verificationStatus === "rejete") issues.push({ severity: "bloquante", category: "source_manquante", point: "prix", message: `Prix de bibliothèque rejeté : ${price.designation}, poste ${label(p)}`, targets: target(p.id) });
      if (price.verificationStatus === "a_verifier") issues.push({ severity: "mineure", category: "source_manquante", point: "prix", message: `Prix de bibliothèque à vérifier : ${price.designation}, poste ${label(p)}`, targets: target(p.id) });
      if (isHistoricalPrice(price, stalePriceMonths)) issues.push({ severity: "mineure", category: "version", point: "prix", message: `Prix historique de la bibliothèque, plus de ${stalePriceMonths} mois : ${price.designation}, ${price.period ?? price.priceDate.split("-").reverse().join("/")}, poste ${label(p)}`, targets: target(p.id) });
      if (price.reliability === "faible") issues.push({ severity: "mineure", category: "reserve", point: "prix", message: `Prix de bibliothèque de fiabilité faible : ${price.designation}, poste ${label(p)}`, targets: target(p.id) });
      if (price.currency !== doc.currency) issues.push({ severity: "bloquante", category: "incoherence", point: "prix", message: `Prix de bibliothèque en ${price.currency} dans une DPGF en ${doc.currency} : poste ${label(p)}`, targets: target(p.id) });
      if (p.unit && !sameUnit(price.unit, p.unit)) issues.push({ severity: "majeure", category: "unite", point: "unites", message: `Unité du prix de bibliothèque différente de celle du poste (${price.unit} au lieu de ${p.unit}) : ${label(p)}`, targets: target(p.id) });
    }
  }

  // Taxe : taux saisi par l'utilisateur, jamais supposé ; un taux inhabituel pour le pays est à confirmer.
  if (doc.vatRate === null) {
    if (postes.some((p) => p.unitPrice !== null)) issues.push({ severity: "mineure", category: "completude", point: "taxes", message: "Taux de TVA de la DPGF non renseigné : total TTC non calculé.", targets: [] });
  } else {
    const unusual = project ? unusualVat(doc.vatRate, project.country) : null;
    if (unusual) issues.push({ severity: "mineure", category: "reserve", point: "taxes", message: unusual, targets: [] });
  }

  const unpriced = postes.filter((p) => p.unitPrice === null).length;
  if (unpriced) issues.push({ severity: "information", category: "completude", point: "prix", message: `${unpriced} poste(s) sans prix unitaire : à chiffrer (sous-détails, bibliothèque ou saisie).`, targets: [] });
  return issues;
}

/** Contrôle des sous-détails d'une DPGF : prix manquants, prix à vérifier ou anciens, pertes, hypothèses, cohérence avec la DPGF. */
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
  const issues: IssueDraft[] = [];
  const label = (l: { code: string | null; designation: string }) => [l.code, l.designation].filter(Boolean).join(" ");

  const without = lines.filter((l) => !breakdowns.some((b) => b.dpgfLineId === l.id));
  if (without.length) issues.push({ severity: "information", category: "completude", point: "prix", message: `${without.length} poste(s) sans sous-détail.`, targets: [] });

  let hypotheses = 0;
  let toApply = 0;
  for (const b of breakdowns) {
    const line = lines.find((l) => l.id === b.dpgfLineId)!;
    const own = components.filter((c) => c.breakdownId === b.id);
    const target = [{ type: "dpgf_line", id: line.id }];
    if (b.decomposition === "impossible" || own.length === 0) {
      const missing = b.missingCharacteristics.length ? ` (${b.missingCharacteristics.join(", ")})` : "";
      issues.push({ severity: "majeure", category: "completude", point: "prix", message: `Décomposition impossible, caractéristiques à confirmer${missing} : poste ${label(line)}`, targets: target });
    }
    for (const c of own) {
      // Pertes comptées deux fois : consommation qui les comprend déjà, avec un taux encore appliqué.
      if (c.lossMode === "appliquee" && c.isHypothesis && lossesAlreadyIncluded(c.quantity, c.lossRate, c.sourceNote)) {
        issues.push({ severity: "majeure", category: "calcul", point: "pertes", message: `Pertes comptées deux fois pour ${c.designation} : la consommation de ${Number(c.quantity)} comprend déjà ${Number(c.lossRate)} %, poste ${label(line)}`, targets: target });
      }
      if (c.lossRate !== null && c.lossMode === "appliquee" && Number(c.lossRate) > HIGH_LOSS_RATE) {
        issues.push({ severity: "mineure", category: "reserve", point: "pertes", message: `Taux de pertes de ${fmt(c.lossRate)} % à confirmer pour ${c.designation}, poste ${label(line)}`, targets: target });
      }
      if (c.lossRate !== null && Number(c.lossRate) > 0 && c.lossMode === "appliquee" && c.category === "main_oeuvre") {
        issues.push({ severity: "mineure", category: "incoherence", point: "pertes", message: `Pertes appliquées à de la main-d’œuvre (${c.designation}) : un temps unitaire s’exprime sans pertes, poste ${label(line)}`, targets: target });
      }
    }
    const missing = own.filter((c) => c.unitCost === null);
    if (missing.length) {
      issues.push({ severity: "majeure", category: "source_manquante", point: "prix", message: `Prix manquant pour ${missing.map((c) => c.designation).join(", ")}, poste ${label(line)}`, targets: target });
    }
    for (const c of own) {
      if (c.isHypothesis) hypotheses++;
      const item = items.find((i) => i.id === c.priceItemId);
      if (!item) continue;
      if (item.verificationStatus === "a_verifier") issues.push({ severity: "mineure", category: "source_manquante", point: "prix", message: `Prix à vérifier utilisé : ${item.designation}, poste ${label(line)}`, targets: target });
      if (isHistoricalPrice(item, stalePriceMonths)) issues.push({ severity: "mineure", category: "version", point: "prix", message: `Prix historique, plus de ${stalePriceMonths} mois : ${item.designation} du ${item.priceDate.split("-").reverse().join("/")}, poste ${label(line)}`, targets: target });
      if (item.archivedAt) issues.push({ severity: "majeure", category: "source_manquante", point: "prix", message: `Prix archivé utilisé : ${item.designation}, poste ${label(line)}`, targets: target });
    }
    if (b.locked && b.computedUnitPrice !== null) {
      if (line.unitPrice === null) toApply++;
      else if (Number(line.unitPrice) !== Number(b.computedUnitPrice)) {
        issues.push(
          line.priceSource === "Sous-détail validé"
            ? { severity: "majeure", category: "incoherence", point: "prix", message: `Prix de la DPGF différent du sous-détail validé, à reporter de nouveau : poste ${label(line)}`, targets: target }
            : { severity: "mineure", category: "incoherence", point: "prix", message: `Prix saisi dans la DPGF différent du sous-détail validé : poste ${label(line)}`, targets: target },
        );
      }
    }
  }
  if (toApply) issues.push({ severity: "information", category: "completude", point: "prix", message: `${toApply} sous-détail(s) validé(s) dont le prix n’est pas encore reporté dans la DPGF.`, targets: [] });
  if (hypotheses) issues.push({ severity: "information", category: "reserve", point: "quantites", message: `${hypotheses} consommation(s) proposée(s) par l’agent : hypothèses à confirmer.`, targets: [] });
  const rates = await readSetting("chiffrage");
  if (!rates.overheadRate && !rates.contingencyRate && !rates.marginRate) {
    issues.push({ severity: "information", category: "completude", point: "prix", message: "Frais généraux, aléas et marge non saisis dans Paramètres, Chiffrage : le prix de vente est égal au déboursé.", targets: [] });
  }
  return issues;
}
