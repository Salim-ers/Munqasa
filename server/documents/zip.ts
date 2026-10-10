/**
 * Dossier complet d'une affaire en un fichier ZIP : chaque document dans son format natif et en PDF,
 * les versions figées, le rapport de contrôle et un index. Un document qui ne peut pas être rendu est
 * signalé dans l'index, sans bloquer le reste du dossier.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import JSZip from "jszip";
import { type Database, schema } from "../db/index.js";
import type { DocTheme } from "./brand.js";
import { fileName } from "./context.js";
import { type ExportFormat, type ExportResult, renderExport, renderVersion } from "./registry.js";

export async function buildDossier(db: Database, projectId: string, theme: DocTheme): Promise<{ buffer: Buffer; fileName: string; files: number; failures: string[] }> {
  const [project] = await db.select().from(schema.project).where(eq(schema.project.id, projectId));
  if (!project) throw new Error("Affaire introuvable.");
  const [cctps, dpgfs, items, drawings] = await Promise.all([
    db.select().from(schema.cctpDocument).where(eq(schema.cctpDocument.projectId, projectId)).orderBy(asc(schema.cctpDocument.createdAt)),
    db.select().from(schema.dpgf).where(eq(schema.dpgf.projectId, projectId)).orderBy(asc(schema.dpgf.createdAt)),
    db.select({ id: schema.workItem.id }).from(schema.workItem).where(eq(schema.workItem.projectId, projectId)).limit(1),
    db.select({ id: schema.drawing.id }).from(schema.drawing).where(eq(schema.drawing.projectId, projectId)).limit(1),
  ]);
  const breakdowns = dpgfs.length
    ? await db
        .selectDistinct({ dpgfId: schema.dpgfLine.dpgfId })
        .from(schema.priceBreakdown)
        .innerJoin(schema.dpgfLine, eq(schema.dpgfLine.id, schema.priceBreakdown.dpgfLineId))
        .where(inArray(schema.dpgfLine.dpgfId, dpgfs.map((d) => d.id)))
    : [];
  const versions = await db
    .select()
    .from(schema.documentVersion)
    .where(and(eq(schema.documentVersion.projectId, projectId), inArray(schema.documentVersion.documentType, ["cctp", "dpgf"])))
    .orderBy(asc(schema.documentVersion.documentType), asc(schema.documentVersion.version));

  const zip = new JSZip();
  const root = zip.folder(fileName(project.reference, "Dossier", "zip").replace(/\.zip$/, ""))!;
  const index: string[] = [];
  const failures: string[] = [];
  let files = 0;

  const add = async (folder: string, label: string, render: () => Promise<ExportResult>) => {
    try {
      const result = await render();
      root.folder(folder)!.file(result.fileName, result.buffer);
      index.push(`${folder}/${result.fileName}`);
      files++;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "erreur inconnue";
      failures.push(`${label} : ${reason}`);
      index.push(`${folder}/${label} : non produit (${reason})`);
    }
  };
  const both = async (folder: string, label: string, formats: ExportFormat[], render: (format: ExportFormat) => Promise<ExportResult>) => {
    for (const format of formats) await add(folder, `${label} (${format})`, () => render(format));
  };

  for (const doc of cctps) await both("01 CCTP", doc.title, ["docx", "pdf"], (f) => renderExport(db, "cctp", doc.id, f, theme));
  for (const doc of dpgfs) {
    await both("02 DPGF", doc.title, ["xlsx", "pdf"], (f) => renderExport(db, "dpgf", doc.id, f, theme));
    await both("03 BPU", doc.title, ["xlsx", "pdf"], (f) => renderExport(db, "bpu", doc.id, f, theme));
    await both("04 DQE", doc.title, ["xlsx", "pdf"], (f) => renderExport(db, "dqe", doc.id, f, theme));
    await both("05 Estimation", doc.title, ["xlsx", "pdf"], (f) => renderExport(db, "estimation", doc.id, f, theme));
    if (breakdowns.some((b) => b.dpgfId === doc.id)) await both("06 Sous-détails", doc.title, ["xlsx", "pdf"], (f) => renderExport(db, "sous_details", doc.id, f, theme));
  }
  if (items.length) await both("07 Métrés", "Note de métrés", ["xlsx", "pdf"], (f) => renderExport(db, "metre", projectId, f, theme));
  if (drawings.length) await both("08 Rapports", "Rapport d’analyse des plans", ["pdf"], (f) => renderExport(db, "analyse", projectId, f, theme));
  await both("08 Rapports", "Rapport de contrôle qualité", ["pdf"], (f) => renderExport(db, "controle", projectId, f, theme));
  for (const v of versions) await add("09 Versions", `${v.documentType} version ${v.version}`, () => renderVersion(db, v.id, "pdf", theme));

  const date = new Date().toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: project.country === "FR" ? "Europe/Paris" : "Africa/Casablanca" });
  const readme = [
    `Dossier ${project.reference}, ${project.name}`,
    `Généré le ${date} par Talab Solutions, version ${theme === "sombre" ? "sombre" : "claire"}.`,
    "",
    "Contenu :",
    ...index.map((line) => `  ${line}`),
    "",
    "Les documents de travail restent à vérifier et à valider par un professionnel habilité avant tout usage contractuel.",
  ].join("\r\n");
  root.file("Contenu du dossier.txt", `﻿${readme}`);
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return { buffer, fileName: fileName(project.reference, "Dossier complet", "zip"), files, failures };
}
