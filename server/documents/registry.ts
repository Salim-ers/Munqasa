/**
 * Moteur d'export centralisé : pour chaque type de document, les formats disponibles et leur rendu.
 * Toutes les versions d'un même document (Word, PDF, Excel) partent de la même lecture de la base.
 * Un échec de rendu n'affecte jamais les données : il suffit de relancer l'export.
 */
import { eq } from "drizzle-orm";
import type { DocumentIdentity } from "../../shared/settings.js";
import { type Database, schema } from "../db/index.js";
import type { DocTheme } from "./brand.js";
import { breakdownsModel, breakdownsWorkbook, loadBreakdowns } from "./builders/breakdowns.js";
import { buildCctp, cctpFrom } from "./builders/cctp.js";
import { bpuModel, bpuWorkbook, type DpgfData, dpgfFrom, dpgfModel, dpgfWorkbook, dqeModel, dqeWorkbook, estimationModel, estimationWorkbook, loadDpgf } from "./builders/dpgf.js";
import { type LibraryFilters, libraryCsv, libraryModel, libraryWorkbook, loadPrices } from "./builders/library.js";
import { loadMetre, metreModel, metreWorkbook } from "./builders/metre.js";
import { analysisModel, controlModel } from "./builders/reports.js";
import { readSetting } from "../services/settings.js";
import { ExportNotFound, fileName } from "./context.js";
import type { DocModel, DocumentKind } from "./model.js";
import { renderDocx } from "./render-docx.js";
import { renderPdf } from "./render-pdf.js";

export type ExportFormat = "pdf" | "docx" | "xlsx" | "csv";

export const CONTENT_TYPES: Record<ExportFormat | "zip", string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
  zip: "application/zip",
};

/** Formats proposés pour chaque type de document. */
export const FORMATS: Record<DocumentKind, ExportFormat[]> = {
  cctp: ["docx", "pdf"],
  dpgf: ["xlsx", "pdf"],
  bpu: ["xlsx", "pdf"],
  dqe: ["xlsx", "pdf"],
  estimation: ["xlsx", "pdf"],
  metre: ["xlsx", "docx", "pdf"],
  analyse: ["docx", "pdf"],
  controle: ["docx", "pdf"],
  bibliotheque: ["xlsx", "csv", "pdf"],
  sous_details: ["xlsx", "pdf"],
};

/** Ce que désigne l'identifiant de l'export : un document, une DPGF ou l'affaire entière. */
export const ID_SCOPE: Record<Exclude<DocumentKind, "bibliotheque">, "cctp" | "dpgf" | "affaire"> = {
  cctp: "cctp",
  dpgf: "dpgf",
  bpu: "dpgf",
  dqe: "dpgf",
  estimation: "dpgf",
  sous_details: "dpgf",
  metre: "affaire",
  analyse: "affaire",
  controle: "affaire",
};

export interface ExportResult {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  projectId: string | null;
  title: string;
}

export class UnsupportedFormat extends Error {}

async function fromModel(model: DocModel, format: ExportFormat, theme: DocTheme, identity: DocumentIdentity): Promise<Buffer> {
  if (format === "pdf") return renderPdf(model, identity, { theme });
  if (format === "docx") return renderDocx(model, identity, { theme });
  throw new UnsupportedFormat(`Format ${format} indisponible pour ce document.`);
}

const DPGF_BUILDERS = {
  dpgf: [dpgfModel, dpgfWorkbook],
  bpu: [bpuModel, bpuWorkbook],
  dqe: [dqeModel, dqeWorkbook],
  estimation: [estimationModel, estimationWorkbook],
} as const;

async function dpgfFamily(data: DpgfData, kind: keyof typeof DPGF_BUILDERS, format: ExportFormat, theme: DocTheme): Promise<ExportResult> {
  const [model, workbook] = DPGF_BUILDERS[kind];
  const doc = model(data);
  const buffer = format === "xlsx" ? await workbook(data, theme) : await fromModel(doc, format, theme, data.ctx.identity);
  return { buffer, fileName: fileName(data.ctx.project.reference, doc.meta.title, format), contentType: CONTENT_TYPES[format], projectId: data.ctx.project.id, title: doc.meta.title };
}

/** Rend un document : CCTP par son identifiant, documents de la DPGF par celui de la DPGF, rapports et métré par celui de l'affaire. */
export async function renderExport(db: Database, kind: Exclude<DocumentKind, "bibliotheque">, id: string, format: ExportFormat, theme: DocTheme, options: { lotId?: string | null } = {}): Promise<ExportResult> {
  if (!FORMATS[kind]?.includes(format)) throw new UnsupportedFormat(`Format ${format} indisponible pour ce document.`);
  switch (kind) {
    case "cctp": {
      const { ctx, model, title } = await buildCctp(db, id);
      return { buffer: await fromModel(model, format, theme, ctx.identity), fileName: fileName(ctx.project.reference, title, format), contentType: CONTENT_TYPES[format], projectId: ctx.project.id, title };
    }
    case "dpgf":
    case "bpu":
    case "dqe":
    case "estimation":
      return dpgfFamily(await loadDpgf(db, id), kind, format, theme);
    case "sous_details": {
      const data = await loadBreakdowns(db, id);
      const model = breakdownsModel(data);
      const buffer = format === "xlsx" ? await breakdownsWorkbook(data, theme) : await fromModel(model, format, theme, data.ctx.identity);
      return { buffer, fileName: fileName(data.ctx.project.reference, model.meta.title, format), contentType: CONTENT_TYPES[format], projectId: data.ctx.project.id, title: model.meta.title };
    }
    case "metre": {
      const data = await loadMetre(db, id, options.lotId ?? null);
      const model = metreModel(data);
      const buffer = format === "xlsx" ? await metreWorkbook(data, theme) : await fromModel(model, format, theme, data.ctx.identity);
      return { buffer, fileName: fileName(data.ctx.project.reference, model.meta.title, format), contentType: CONTENT_TYPES[format], projectId: id, title: model.meta.title };
    }
    case "analyse":
    case "controle": {
      const { ctx, model } = kind === "analyse" ? await analysisModel(db, id) : await controlModel(db, id);
      return { buffer: await fromModel(model, format, theme, ctx.identity), fileName: fileName(ctx.project.reference, model.meta.title, format), contentType: CONTENT_TYPES[format], projectId: id, title: model.meta.title };
    }
  }
}

/** Bibliothèque de prix, filtrée comme à l'écran. */
export async function renderLibrary(db: Database, filters: LibraryFilters, format: ExportFormat, theme: DocTheme): Promise<ExportResult> {
  if (!FORMATS.bibliotheque.includes(format)) throw new UnsupportedFormat(`Format ${format} indisponible pour la bibliothèque.`);
  const prices = await loadPrices(db, filters);
  const model = await libraryModel(prices, filters);
  const buffer = format === "csv" ? libraryCsv(prices) : format === "xlsx" ? await libraryWorkbook(prices, filters, theme) : await renderPdf(model, await readSetting("identite_documentaire"), { theme });
  const stamp = new Date().toISOString().slice(0, 10);
  return { buffer, fileName: fileName("Talab Solutions", `${model.meta.title} ${stamp}`, format), contentType: CONTENT_TYPES[format], projectId: null, title: model.meta.title };
}

/** Version figée d'un CCTP ou d'une DPGF, rendue telle qu'elle était à son enregistrement. */
export async function renderVersion(db: Database, versionId: string, format: ExportFormat, theme: DocTheme): Promise<ExportResult> {
  const [version] = await db.select().from(schema.documentVersion).where(eq(schema.documentVersion.id, versionId));
  if (!version) throw new ExportNotFound("Version introuvable.");
  const info = { number: version.version, date: new Date(version.createdAt), validated: version.validated };
  const suffix = `version ${version.version}${version.validated ? " validée" : ""}`;
  if (version.documentType === "cctp") {
    if (format !== "pdf" && format !== "docx") throw new UnsupportedFormat("Une version de CCTP s’exporte en Word ou en PDF.");
    const snapshot = version.snapshot as { document: Parameters<typeof cctpFrom>[1]; sections: Parameters<typeof cctpFrom>[2] };
    const { ctx, model, title } = await cctpFrom(db, snapshot.document, snapshot.sections, info);
    return { buffer: await fromModel(model, format, theme, ctx.identity), fileName: fileName(ctx.project.reference, `${title} ${suffix}`, format), contentType: CONTENT_TYPES[format], projectId: ctx.project.id, title: `${title}, ${suffix}` };
  }
  if (version.documentType === "dpgf") {
    if (format !== "pdf" && format !== "xlsx") throw new UnsupportedFormat("Une version de DPGF s’exporte en Excel ou en PDF.");
    const snapshot = version.snapshot as { document: Parameters<typeof dpgfFrom>[1]; lines: Parameters<typeof dpgfFrom>[2] };
    const data = await dpgfFrom(db, snapshot.document, snapshot.lines, info);
    const result = await dpgfFamily(data, "dpgf", format, theme);
    return { ...result, fileName: fileName(data.ctx.project.reference, `${data.doc.title} ${suffix}`, format), title: `${data.doc.title}, ${suffix}` };
  }
  throw new UnsupportedFormat("Cette version n’est pas exportable.");
}
