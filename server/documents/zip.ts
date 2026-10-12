/**
 * Dossier complet d'une affaire en un fichier ZIP : chaque document dans son format natif et en PDF,
 * les versions figées, le rapport de contrôle et un index. Un document qui ne peut pas être rendu est
 * signalé dans l'index, sans bloquer le reste du dossier.
 *
 * Contrôle avant export : chaque fichier produit est relu (mise en page, pagination, structure), ce contrôle
 * est enregistré avec l'empreinte du contenu, les contrôles qualité sont rejoués, et l'index reprend les
 * quinze points vérifiés avec leurs anomalies. Le dossier n'est jamais dit validé tant qu'une anomalie
 * bloquante subsiste.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import JSZip from "jszip";
import { AUDIT_STATE_LABELS, type RenderedFileCheck } from "../../shared/audit.js";
import { type Database, schema } from "../db/index.js";
import { dossierFingerprint } from "../services/dossier.js";
import { dossierExportAudit, recordExportCheck } from "../services/export-audit.js";
import type { DocTheme } from "./brand.js";
import { fileName } from "./context.js";
import { dossierDocuments } from "./dossier-files.js";
import { type ExportResult, renderExport, renderVersion } from "./registry.js";
import { layoutSummary } from "./render-checked.js";

export async function buildDossier(db: Database, projectId: string, theme: DocTheme): Promise<{ buffer: Buffer; fileName: string; files: number; failures: string[]; verdict: string }> {
  const [project] = await db.select().from(schema.project).where(eq(schema.project.id, projectId));
  if (!project) throw new Error("Affaire introuvable.");
  // Empreinte du contenu au moment du rendu : une modification pendant l'export rend ce contrôle caduc.
  const fingerprint = await dossierFingerprint(db, projectId);
  const documents = await dossierDocuments(db, projectId);
  const versions = await db
    .select()
    .from(schema.documentVersion)
    .where(and(eq(schema.documentVersion.projectId, projectId), inArray(schema.documentVersion.documentType, ["cctp", "dpgf"])))
    .orderBy(asc(schema.documentVersion.documentType), asc(schema.documentVersion.version));

  const zip = new JSZip();
  const root = zip.folder(fileName(project.reference, "Dossier", "zip").replace(/\.zip$/, ""))!;
  const index: string[] = [];
  const failures: string[] = [];
  const layout: string[] = [];
  const checks: RenderedFileCheck[] = [];
  let checked = 0;
  let files = 0;

  const add = async (folder: string, label: string, render: () => Promise<ExportResult>, record: { kind: string; format: "pdf" | "docx" | "xlsx" } | null) => {
    try {
      const result = await render();
      root.folder(folder)!.file(result.fileName, result.buffer);
      index.push(`${folder}/${result.fileName}`);
      if (result.layout) {
        checked++;
        if (result.layout.issues.length) layout.push(`${folder}/${result.fileName} : ${layoutSummary(result.layout)}`);
        if (record) checks.push({ document: result.title, kind: record.kind, format: record.format, pages: result.layout.pages, issues: result.layout.issues.map((i) => ({ kind: i.kind, page: i.page, detail: i.detail })) });
      }
      files++;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "erreur inconnue";
      failures.push(`${label} : ${reason}`);
      index.push(`${folder}/${label} : non produit (${reason})`);
    }
  };

  for (const doc of documents) {
    for (const format of doc.formats) {
      await add(doc.folder, `${doc.label} (${format})`, () => renderExport(db, doc.kind, doc.id, format, theme), format === "csv" ? null : { kind: doc.kind, format });
    }
  }

  // Contrôle avant export : fichiers relus, contrôles qualité rejoués, quinze points.
  await recordExportCheck(db, projectId, checks, null, fingerprint);
  const audit = await dossierExportAudit(db, projectId);

  await add("08 Rapports", "Rapport de contrôle qualité (pdf)", () => renderExport(db, "controle", projectId, "pdf", theme), null);
  for (const v of versions) await add("09 Versions", `${v.documentType} version ${v.version}`, () => renderVersion(db, v.id, "pdf", theme), null);

  const date = new Date().toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: project.country === "FR" ? "Europe/Paris" : "Africa/Casablanca" });
  const readme = [
    `Dossier ${project.reference}, ${project.name}`,
    `Généré le ${date} par Talab Solutions, version ${theme === "sombre" ? "sombre" : "claire"}.`,
    "",
    "Contenu :",
    ...index.map((line) => `  ${line}`),
    "",
    "Contrôle avant export :",
    `  ${audit.verdictLabel}.`,
    ...audit.points.map((p) => `  ${p.label} : ${AUDIT_STATE_LABELS[p.state].toLowerCase()}${p.details.length ? `, ${p.details.join(" ; ")}` : ""}`),
    "",
    "Contrôle de mise en page :",
    ...(layout.length ? layout.map((line) => `  ${line}`) : [`  ${checked} fichier(s) contrôlé(s) après génération : aucune anomalie détectée (marges, superpositions, pages presque vides, titres isolés, en-têtes, pieds et numérotation, couverture, contenu complet).`]),
    "",
    "Les documents de travail restent à vérifier et à valider par un professionnel habilité avant tout usage contractuel.",
  ].join("\r\n");
  root.file("Contenu du dossier.txt", `﻿${readme}`);
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return { buffer, fileName: fileName(project.reference, "Dossier complet", "zip"), files, failures, verdict: audit.verdict };
}
