/**
 * Rendu contrôlé : chaque PDF produit est relu (coordonnées des textes) ; une anomalie corrigible relance la
 * composition avec des réglages adaptés (saut forcé avant un titre resté seul, sommaire ou espacements
 * resserrés), au plus quatre compositions. Ce qui persiste est remonté tel quel dans le rapport, jamais masqué.
 * Word et Excel : contrôle de structure après génération.
 */
import type { DocumentIdentity } from "../../shared/settings.js";
import { checkDocxStructure, checkPdfLayout, checkXlsxStructure, type LayoutReport } from "./layout-check.js";
import type { DocModel, RenderOptions } from "./model.js";
import { renderDocx } from "./render-docx.js";
import { type PdfLayoutOptions, renderPdf } from "./render-pdf.js";

/** Nombre maximal de compositions d'un même PDF. */
const MAX_ATTEMPTS = 4;

const comparable = (text: string) => text.normalize("NFKC").replace(/[’‘`´ʼ]/g, "'").replace(/\s+/g, "").toLowerCase();

/** Index du bloc de titre correspondant au titre signalé (texte relu dans le PDF). */
function headingIndex(model: DocModel, heading: string): number {
  const target = comparable(heading).slice(0, 40);
  if (!target) return -1;
  return model.blocks.findIndex((b) => {
    if (b.type !== "heading") return false;
    const text = comparable(`${b.number ?? ""}${b.text}`);
    return text.startsWith(target) || target.startsWith(text.slice(0, 40));
  });
}

/** Réglages de la composition suivante d'après les anomalies relevées, ou null si rien ne peut être corrigé. */
export function nextLayout(model: DocModel, layout: PdfLayoutOptions, report: LayoutReport): PdfLayoutOptions | null {
  const next: PdfLayoutOptions = { ...layout, forcedBreaks: [...(layout.forcedBreaks ?? [])] };
  let changed = false;
  for (const issue of report.issues) {
    if (issue.kind === "titre_isole" && issue.heading) {
      const index = headingIndex(model, issue.heading);
      if (index > 0 && !next.forcedBreaks!.includes(index)) {
        next.forcedBreaks!.push(index);
        changed = true;
      }
    } else if (issue.kind === "page_presque_vide" && issue.page !== null) {
      if (report.tocPages.includes(issue.page) && !next.compactToc) {
        next.compactToc = true;
        changed = true;
      } else if (!report.tocPages.includes(issue.page) && !next.compact) {
        next.compact = true;
        changed = true;
      }
    }
  }
  return changed ? next : null;
}

export async function renderPdfChecked(model: DocModel, identity: DocumentIdentity, options: RenderOptions): Promise<{ buffer: Buffer; layout: LayoutReport }> {
  let layout: PdfLayoutOptions = {};
  let best: { buffer: Buffer; layout: LayoutReport } | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const buffer = await renderPdf(model, identity, { ...options, layout });
    const report = await checkPdfLayout(buffer, model);
    if (!best || report.issues.length < best.layout.issues.length) best = { buffer, layout: { ...report, attempts: attempt } };
    if (report.issues.length === 0) break;
    const next = nextLayout(model, layout, report);
    if (!next) break;
    layout = next;
  }
  return best!;
}

export async function renderDocxChecked(model: DocModel, identity: DocumentIdentity, options: RenderOptions): Promise<{ buffer: Buffer; layout: LayoutReport }> {
  const buffer = await renderDocx(model, identity, options);
  return { buffer, layout: await checkDocxStructure(buffer, model) };
}

export async function checkedWorkbook(buffer: Buffer): Promise<{ buffer: Buffer; layout: LayoutReport }> {
  return { buffer, layout: await checkXlsxStructure(buffer) };
}

/** Résumé d'un rapport, pour un journal ou l'index d'un dossier. */
export function layoutSummary(report: LayoutReport | null): string {
  if (!report) return "non contrôlé";
  if (report.issues.length === 0) return report.pages ? `${report.pages} page(s), aucune anomalie de mise en page` : "aucune anomalie de structure";
  return `${report.issues.length} anomalie(s) : ${report.issues
    .slice(0, 3)
    .map((i) => `${i.page ? `p. ${i.page} ` : ""}${i.detail}`)
    .join(" ; ")}${report.issues.length > 3 ? " ; …" : ""}`;
}

