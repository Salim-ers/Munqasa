/**
 * Contrôle des fichiers produits d'un dossier, avant export : chaque document est rendu comme au
 * téléchargement (mêmes fonctions, version claire), le PDF relu, le Word et l'Excel contrôlés.
 * 1. préparation : documents du dossier complet (hors versions figées) et empreinte du contenu rendu ;
 * 2. une étape par document : ses formats rendus et contrôlés ;
 * 3. bilan : contrôle enregistré avec l'empreinte, anomalies de rendu reportées au contrôle qualité du dossier.
 * Utilisé par la génération du dossier et par le contrôle indépendant.
 */
import type { RenderedFileCheck } from "../../../shared/audit.js";
import { DOSSIER_FORMATS, DOSSIER_KIND_LABELS, type DossierDocumentKind, dossierDocuments } from "../../documents/dossier-files.js";
import { renderExport } from "../../documents/registry.js";
import { checkDossier, dossierFingerprint } from "../../services/dossier.js";
import { recordExportCheck } from "../../services/export-audit.js";
import { replaceIssues } from "../../services/quality.js";
import type { StepContext, StepOutcome } from "../types.js";

export const RENDER_LABEL = "Contrôle des fichiers produits";

export function renderStepLabel(name: string): string {
  if (name === "preparation") return "Documents à rendre";
  if (name === "bilan") return "Bilan de mise en page et de pagination";
  if (name.startsWith("doc:")) {
    const kind = name.split(":")[1] as DossierDocumentKind;
    return DOSSIER_KIND_LABELS[kind] ?? "Document";
  }
  return name;
}

/** Étape du contrôle des fichiers ; « results » ne contient que les résultats de ce contrôle, sous leurs propres noms. */
export async function renderStep(name: string, ctx: StepContext): Promise<StepOutcome> {
  const { db } = ctx;
  const projectId = ctx.job.projectId!;

  if (name === "preparation") {
    const documents = await dossierDocuments(db, projectId);
    const fingerprint = await dossierFingerprint(db, projectId);
    if (documents.length === 0) await ctx.log("Aucun document à rendre.");
    return { result: { fingerprint, documents: documents.length }, addSteps: documents.map((d) => `doc:${d.kind}:${d.id}`) };
  }

  if (name.startsWith("doc:")) {
    const [, kind, id] = name.split(":") as [string, DossierDocumentKind, string];
    const files: RenderedFileCheck[] = [];
    for (const format of DOSSIER_FORMATS[kind] ?? []) {
      try {
        const result = await renderExport(db, kind, id, format, "clair");
        if (result.layout && format !== "csv") {
          files.push({ document: result.title, kind, format, pages: result.layout.pages, issues: result.layout.issues.map((i) => ({ kind: i.kind, page: i.page, detail: i.detail })) });
        }
      } catch (error) {
        // Un document qui ne se rend pas est une anomalie de structure, dite telle quelle.
        const reason = error instanceof Error ? error.message : "erreur inconnue";
        if (format !== "csv") files.push({ document: DOSSIER_KIND_LABELS[kind] ?? kind, kind, format, pages: null, issues: [{ kind: "structure", page: null, detail: `rendu impossible : ${reason}` }] });
      }
    }
    const anomalies = files.reduce((n, f) => n + f.issues.length, 0);
    const pages = files.filter((f) => f.format === "pdf").map((f) => f.pages ?? 0)[0];
    await ctx.log(`${files[0]?.document ?? DOSSIER_KIND_LABELS[kind]} : ${files.map((f) => f.format.toUpperCase()).join(", ")}${pages ? `, ${pages} page(s) en PDF` : ""}, ${anomalies ? `${anomalies} anomalie(s) de rendu` : "aucune anomalie de rendu"}.`);
    return { result: { files } };
  }

  if (name === "bilan") {
    const prepared = ctx.results.get("preparation") as { fingerprint?: string } | undefined;
    const files = [...ctx.results.entries()].filter(([k]) => k.startsWith("doc:")).flatMap(([, v]) => (v as { files?: RenderedFileCheck[] }).files ?? []);
    await recordExportCheck(db, projectId, files, ctx.job.id, prepared?.fingerprint);
    // Les anomalies de rendu rejoignent le contrôle qualité du dossier (mise en page, pagination).
    await replaceIssues(db, { projectId, documentType: "dossier", documentId: projectId }, await checkDossier(db, projectId));
    const anomalies = files.reduce((n, f) => n + f.issues.length, 0);
    await ctx.log(files.length ? `${files.length} fichier(s) contrôlé(s) : ${anomalies ? `${anomalies} anomalie(s) de mise en page ou de pagination à traiter` : "aucune anomalie de mise en page ni de pagination"}.` : "Aucun fichier à contrôler.");
    return { result: { files: files.length, anomalies } };
  }
  return { result: {} };
}
