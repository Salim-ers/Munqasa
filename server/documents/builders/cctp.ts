/** CCTP : chapitres, articles en blocs structurés, références citées et leur état de vérification. */
import { asc, eq, inArray } from "drizzle-orm";
import { DESIGN_PHASE_LABELS } from "../../../shared/enums.js";
import type { CctpBlock } from "../../ai/schemas.js";
import { type Database, schema } from "../../db/index.js";
import { baseMeta, COVER_STATUS, type ExportContext, exportContext, ExportNotFound } from "../context.js";
import type { Block, DocModel } from "../model.js";

export interface CctpExport {
  ctx: ExportContext;
  model: DocModel;
  title: string;
}

type CctpDocument = typeof schema.cctpDocument.$inferSelect;
type CctpSection = typeof schema.cctpSection.$inferSelect;

export async function buildCctp(db: Database, documentId: string): Promise<CctpExport> {
  const [document] = await db.select().from(schema.cctpDocument).where(eq(schema.cctpDocument.id, documentId));
  if (!document) throw new ExportNotFound("CCTP introuvable.");
  const sections = await db.select().from(schema.cctpSection).where(eq(schema.cctpSection.documentId, documentId)).orderBy(asc(schema.cctpSection.position));
  return cctpFrom(db, document, sections);
}

/** CCTP à partir de son document et de ses sections (base ou instantané d'une version figée). */
export async function cctpFrom(db: Database, document: CctpDocument, sections: CctpSection[], version?: { number: number; date: Date; validated: boolean }): Promise<CctpExport> {
  const ctx = await exportContext(db, document.projectId, document.lotId);
  const refIds = [...new Set(sections.flatMap((s) => s.referenceIds ?? []))];
  const references = refIds.length ? await db.select().from(schema.technicalReference).where(inArray(schema.technicalReference.id, refIds)) : [];
  const refById = new Map(references.map((r) => [r.id, r]));

  const blocks: Block[] = [];
  for (const section of sections) {
    if (section.kind === "chapitre") {
      blocks.push({ type: "heading", level: 1, number: section.number, text: section.title, pageBreakBefore: true });
      continue;
    }
    blocks.push({ type: "heading", level: 2, number: section.number, text: section.title });
    const content = (section.content ?? []) as CctpBlock[];
    if (content.length === 0) blocks.push({ type: "paragraph", content: [{ text: "Article à rédiger.", italic: true, tone: "muted" }] });
    for (const block of content) {
      if (block.type === "liste") blocks.push({ type: "list", ordered: "letters", items: block.items.map((item) => [item]) });
      else if (block.type === "exigence") blocks.push({ type: "requirement", content: [block.text ?? ""] });
      else if (block.type === "note") blocks.push({ type: "note", content: [block.text ?? ""] });
      else blocks.push({ type: "paragraph", content: [block.text ?? ""] });
    }
    const cited = (section.referenceIds ?? []).map((id) => refById.get(id)?.code).filter((code): code is string => Boolean(code));
    if (cited.length) blocks.push({ type: "references", codes: cited });
  }

  const cited = references.filter((r) => sections.some((s) => (s.referenceIds ?? []).includes(r.id)));
  if (cited.length) {
    blocks.push({ type: "heading", level: 1, text: "Annexe : références citées", pageBreakBefore: true });
    blocks.push({
      type: "paragraph",
      tone: "muted",
      content: ["Seules les références de cette liste sont citées. Une référence « à vérifier » doit être confirmée dans son édition en vigueur avant diffusion du dossier."],
    });
    blocks.push({
      type: "table",
      columns: [
        { label: "Code", width: 20 },
        { label: "Intitulé", width: "*" },
        { label: "Édition", width: 14 },
        { label: "Statut", width: 14 },
      ],
      rows: cited.map((r) => ({
        cells: [{ text: r.code, bold: true }, r.title, r.version ?? "", { text: r.verificationStatus === "verifie" ? "Vérifiée" : r.verificationStatus === "rejete" ? "Rejetée" : "À vérifier", tone: r.verificationStatus === "verifie" ? undefined : "primary" }],
      })),
    });
  }

  const model: DocModel = {
    meta: baseMeta(ctx, {
      kind: "cctp",
      typeLabel: "Cahier des clauses techniques particulières",
      shortLabel: "CCTP",
      title: document.title,
      version: version?.number ?? document.currentVersion,
      status: version ? (version.validated ? "Version validée" : "Version enregistrée") : COVER_STATUS[document.status],
      toc: true,
      phase: DESIGN_PHASE_LABELS[document.phase],
      date: version?.date,
    }),
    blocks,
  };
  return { ctx, model, title: document.title };
}
