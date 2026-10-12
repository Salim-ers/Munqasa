/**
 * Contrôle avant export (voir shared/audit.ts) : les quinze points vérifiés avant l'export d'un dossier
 * d'affaire ou d'un devis, chacun avec ses anomalies, les plus graves d'abord.
 *
 * Dossier : contrôles qualité rejoués sur l'état actuel (métré, CCTP, DPGF, sous-détails, dossier), puis
 * anomalies classées par point ; la mise en page et la pagination viennent du dernier contrôle des fichiers
 * produits, valable tant que le contenu n'a pas changé.
 * Devis : contrôles du devis, totaux enregistrés comparés au moteur, quantités comparées à leur source, et,
 * sur demande, rendu des trois formats relus comme à l'export.
 * Le verdict n'est jamais favorable tant qu'une anomalie bloquante subsiste.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  AUDIT_POINT_LABELS,
  AUDIT_POINTS,
  type AuditPoint,
  type AuditPointResult,
  type AuditPointState,
  type AuditVerdict,
  CATEGORY_POINT,
  type ExportAudit,
  PAGINATION_KINDS,
  type RenderedFileCheck,
  verdictLabel,
} from "../../shared/audit.js";
import type { IssueCategory } from "../../shared/enums.js";
import { type Database, schema } from "../db/index.js";
import type { DocTheme } from "../documents/brand.js";
import { renderQuote } from "../documents/builders/quote.js";
import { dossierFingerprint, runDossierChecks } from "./dossier.js";
import { computeQuote } from "./quote-calc.js";
import { EDITABLE, loadQuote, quoteChecks, settingsOf } from "./quotes.js";

type Severity = "bloquante" | "majeure" | "mineure" | "information";
interface Finding {
  point: AuditPoint;
  severity: Severity;
  message: string;
}

const RANK: Record<Severity, number> = { bloquante: 0, majeure: 1, mineure: 2, information: 3 };
const DETAILS = 6;
const RENDER_POINTS: AuditPoint[] = ["mise_en_page", "pagination"];

/** Points et verdict à partir des anomalies, de ce qui est contrôlable et de l'état du contrôle des fichiers. */
function assemble(findings: Finding[], applicable: Set<AuditPoint>, rendering: ExportAudit["rendering"], options: { renderingRequired: boolean }): ExportAudit {
  const points: AuditPointResult[] = AUDIT_POINTS.map((point) => {
    const own = findings.filter((f) => f.point === point).sort((a, b) => RANK[a.severity] - RANK[b.severity]);
    const counts = { bloquante: 0, majeure: 0, mineure: 0, information: 0 };
    for (const f of own) counts[f.severity]++;
    let state: AuditPointState;
    if (counts.bloquante) state = "bloquant";
    else if (counts.majeure || counts.mineure) state = "reserves";
    else if (!applicable.has(point)) state = "sans_objet";
    else if (RENDER_POINTS.includes(point) && !rendering.upToDate) state = "non_controle";
    else state = "conforme";
    // Une même anomalie relevée sur plusieurs documents (deux CCTP du même lot…) n'est dite qu'une fois.
    const repeats = new Map<string, number>();
    for (const f of own) repeats.set(f.message, (repeats.get(f.message) ?? 0) + 1);
    const messages = [...repeats].map(([message, n]) => (n > 1 ? `${message}, relevé dans ${n} documents` : message));
    const details = messages.length > DETAILS ? [...messages.slice(0, DETAILS - 1), `${messages.length - DETAILS + 1} autre(s) anomalie(s) du même point`] : messages;
    return { point, label: AUDIT_POINT_LABELS[point], state, counts, details };
  });
  const counts = { bloquante: 0, majeure: 0, mineure: 0, information: 0 };
  for (const f of findings) counts[f.severity]++;
  const verdict: AuditVerdict = counts.bloquante ? "bloquant" : counts.majeure || counts.mineure || (options.renderingRequired && !rendering.upToDate) ? "reserves" : "conforme";
  return { points, counts, verdict, verdictLabel: verdictLabel(verdict, counts), rendering, checkedAt: new Date().toISOString() };
}

/** Anomalies de rendu d'un ensemble de fichiers produits, rattachées à la mise en page ou à la pagination. */
export function renderFindings(files: RenderedFileCheck[]): Finding[] {
  return files.flatMap((file) =>
    file.issues.map((issue) => ({
      point: (PAGINATION_KINDS.includes(issue.kind) ? "pagination" : "mise_en_page") as AuditPoint,
      severity: (["contenu_manquant", "chevauchement", "marge", ...PAGINATION_KINDS].includes(issue.kind) ? "majeure" : "mineure") as Severity,
      message: `${file.document} en ${file.format.toUpperCase()}${issue.page ? `, page ${issue.page}` : ""} : ${issue.detail}`,
    })),
  );
}

/**
 * Contrôle avant export du dossier d'une affaire. Par défaut, les contrôles qualité sont rejoués d'abord ;
 * « refresh: false » lit les anomalies telles qu'enregistrées (juste après un contrôle).
 */
export async function dossierExportAudit(db: Database, projectId: string, options: { refresh?: boolean } = {}): Promise<ExportAudit> {
  if (options.refresh !== false) await runDossierChecks(db, projectId);
  const issues = await db
    .select({ severity: schema.qualityIssue.severity, category: schema.qualityIssue.category, point: schema.qualityIssue.auditPoint, message: schema.qualityIssue.message })
    .from(schema.qualityIssue)
    .where(and(eq(schema.qualityIssue.projectId, projectId), eq(schema.qualityIssue.status, "ouverte")));
  const findings: Finding[] = issues.map((i) => ({ point: i.point ?? CATEGORY_POINT[i.category as IssueCategory], severity: i.severity, message: i.message }));

  const [items, cctps, dpgfs, breakdowns] = await Promise.all([
    db.select({ id: schema.workItem.id }).from(schema.workItem).where(eq(schema.workItem.projectId, projectId)).limit(1),
    db.select({ id: schema.cctpDocument.id, status: schema.cctpDocument.status }).from(schema.cctpDocument).where(eq(schema.cctpDocument.projectId, projectId)),
    db.select({ id: schema.dpgf.id, status: schema.dpgf.status }).from(schema.dpgf).where(eq(schema.dpgf.projectId, projectId)),
    db.select({ id: schema.priceBreakdown.id }).from(schema.priceBreakdown).where(eq(schema.priceBreakdown.projectId, projectId)).limit(1),
  ]);
  const has = {
    metre: items.length > 0,
    cctp: cctps.some((c) => c.status !== "archive"),
    dpgf: dpgfs.some((d) => d.status !== "archive"),
    breakdowns: breakdowns.length > 0,
  };
  const any = has.metre || has.cctp || has.dpgf;
  const applicable = new Set<AuditPoint>(["statuts"]);
  const add = (condition: boolean, ...points: AuditPoint[]) => condition && points.forEach((p) => applicable.add(p));
  add(any, "lots", "doublons", "mise_en_page", "pagination", "references_documents");
  add(has.metre || has.dpgf, "ouvrages", "unites", "quantites", "formules");
  add(has.dpgf, "prix", "taxes", "totaux");
  add(has.breakdowns, "pertes");
  add(has.cctp, "references_reglementaires");

  const [rendered] = await db.select().from(schema.exportCheck).where(eq(schema.exportCheck.projectId, projectId)).orderBy(desc(schema.exportCheck.createdAt)).limit(1);
  const upToDate = Boolean(rendered && rendered.fingerprint === (await dossierFingerprint(db, projectId)));
  const rendering = {
    checkedAt: rendered ? rendered.createdAt.toISOString() : null,
    upToDate,
    files: rendered?.files.length ?? 0,
    anomalies: rendered ? rendered.files.reduce((n, f) => n + f.issues.length, 0) : 0,
  };
  return assemble(findings, applicable, rendering, { renderingRequired: any });
}

/** Enregistre le contrôle des fichiers produits d'un dossier, avec l'empreinte du contenu rendu. */
export async function recordExportCheck(db: Database, projectId: string, files: RenderedFileCheck[], jobId: string | null, fingerprint?: string): Promise<void> {
  await db.insert(schema.exportCheck).values({ projectId, jobId, fingerprint: fingerprint ?? (await dossierFingerprint(db, projectId)), files });
}

/** Libellé court d'un format, pour un journal. */
const FORMATS = ["pdf", "xlsx", "docx"] as const;

/**
 * Contrôle avant export d'un devis. « render » produit les trois formats, comme à l'export, et en relit la
 * mise en page et la structure ; sans lui, la mise en page et la pagination restent « non contrôlées ».
 */
export async function quoteExportAudit(db: Database, quoteId: string, options: { render?: boolean; theme?: DocTheme } = {}): Promise<ExportAudit & { files: RenderedFileCheck[] }> {
  const { quote, lines } = await loadQuote(db, quoteId);
  const totals = computeQuote(lines, settingsOf(quote));
  const [company] = quote.companyProfileId ? await db.select({ country: schema.companyProfile.country }).from(schema.companyProfile).where(eq(schema.companyProfile.id, quote.companyProfileId)) : [];
  const findings: Finding[] = quoteChecks(quote, lines, totals, company?.country ?? null).map((c) => ({ point: c.point, severity: c.severity, message: c.message }));
  const label = (l: { designation: string }) => l.designation.slice(0, 80);

  // Totaux enregistrés : ceux du moteur, jamais une autre valeur.
  const same = (a: string | null, b: string | null) => (a === null ? b === null : b !== null && Number(a) === Number(b));
  const expectedHt = totals.state === "non_renseigne" ? null : totals.totalHt;
  if (!same(quote.totalHt, expectedHt) || !same(quote.totalVat, totals.totalVat) || !same(quote.totalTtc, totals.totalTtc)) {
    findings.push({ point: "totaux", severity: "bloquante", message: "Totaux enregistrés différents du calcul : rouvrez le devis pour les recalculer." });
  }
  for (const l of lines.filter((x) => x.kind === "ligne")) {
    const net = totals.lines[l.id]?.net ?? null;
    if (!same(l.amountHt, net)) findings.push({ point: "totaux", severity: "bloquante", message: `Montant enregistré différent du calcul : ${label(l)}` });
  }
  if (totals.state === "partiel") findings.push({ point: "totaux", severity: "information", message: `Total partiel : ${totals.missing.prices} prix et ${totals.missing.quantities} quantité(s) à compléter.` });

  // Quantités tirées de la DPGF : comparées au poste source tant que le devis se modifie.
  const linked = lines.filter((l) => l.kind === "ligne" && l.dpgfLineId && l.quantitySource !== "Saisie");
  if (linked.length && EDITABLE.includes(quote.status)) {
    const sources = await db.select({ id: schema.dpgfLine.id, quantity: schema.dpgfLine.quantity, unit: schema.dpgfLine.unit }).from(schema.dpgfLine).where(inArray(schema.dpgfLine.id, linked.map((l) => l.dpgfLineId!)));
    for (const l of linked) {
      const source = sources.find((s) => s.id === l.dpgfLineId);
      if (source && !same(l.quantity, source.quantity)) {
        findings.push({ point: "quantites", severity: "mineure", message: `Quantité de la DPGF modifiée depuis la création du devis (${source.quantity === null ? "à métrer" : Number(source.quantity)} ${source.unit ?? ""}) : ${label(l)}`.replace(/ \)/, ")") });
      }
    }
  }
  if (quote.dpgfId) {
    const [dpgf] = await db.select({ status: schema.dpgf.status, title: schema.dpgf.title }).from(schema.dpgf).where(eq(schema.dpgf.id, quote.dpgfId));
    if (dpgf?.status === "archive") findings.push({ point: "references_documents", severity: "mineure", message: `DPGF d’origine archivée : ${dpgf.title}` });
  }
  if (["valide", "envoye", "accepte"].includes(quote.status) && findings.some((f) => f.severity === "bloquante")) {
    findings.push({ point: "statuts", severity: "bloquante", message: "Statut du devis incompatible avec les points bloquants relevés : repassez-le en brouillon pour les corriger." });
  }

  const files: RenderedFileCheck[] = [];
  if (options.render) {
    for (const format of FORMATS) {
      const result = await renderQuote(db, quoteId, format, options.theme ?? "clair");
      if (result.layout) files.push({ document: `Devis ${quote.number}`, kind: "devis", format, pages: result.layout.pages, issues: result.layout.issues.map((i) => ({ kind: i.kind, page: i.page, detail: i.detail })) });
    }
    findings.push(...renderFindings(files));
  }
  const applicable = new Set<AuditPoint>(["prix", "quantites", "unites", "taxes", "totaux", "doublons", "statuts", "references_documents", "references_reglementaires", "mise_en_page", "pagination"]);
  if (lines.some((l) => l.workItemId || l.dpgfLineId)) applicable.add("ouvrages");
  if (quote.lotIds.length || lines.some((l) => l.lotId)) applicable.add("lots");
  const rendering = { checkedAt: options.render ? new Date().toISOString() : null, upToDate: Boolean(options.render), files: files.length, anomalies: files.reduce((n, f) => n + f.issues.length, 0) };
  return { ...assemble(findings, applicable, rendering, { renderingRequired: true }), files };
}
