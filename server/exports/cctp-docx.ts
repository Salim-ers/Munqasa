/**
 * Export Word du CCTP : couverture (identité documentaire), sommaire mis à jour à l'ouverture,
 * chapitres et articles numérotés, exigences mises en évidence, références citées en annexe,
 * en-tête et pied de page paginés. Document modifiable, prêt pour la mise au point finale.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { DocumentIdentity } from "../../shared/settings.js";
import type { CctpBlock } from "../ai/schemas.js";

export interface CctpExportData {
  title: string;
  status: string;
  version: number;
  project: { reference: string; name: string; city: string | null; country: string; phase: string };
  client: string | null;
  lot: string | null;
  company: string | null;
  identity: DocumentIdentity;
  sections: Array<{ number: string; title: string; kind: string; content: CctpBlock[]; referenceIds: string[] }>;
  references: Array<{ id: string; code: string; title: string; version: string | null; verified: boolean }>;
  date: Date;
}

const hex = (color: string) => color.replace("#", "").toUpperCase();
const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

function coverLine(label: string, value: string | null, ink: string): Paragraph | null {
  if (!value) return null;
  return new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text: `${label} : `, color: "7A7A7A", size: 20 }), new TextRun({ text: value, color: ink, size: 20, bold: true })],
  });
}

export async function cctpToDocx(data: CctpExportData): Promise<Buffer> {
  const { identity } = data;
  const primary = hex(identity.primaryColor);
  const secondary = hex(identity.secondaryColor);
  const ink = hex(identity.inkColor);
  const headingFont = identity.headingFont;
  const bodyFont = identity.bodyFont;
  const refById = new Map(data.references.map((r) => [r.id, r]));
  const draft = data.status !== "valide";

  const cover = [
    new Paragraph({ spacing: { before: 1800, after: 200 }, children: [new TextRun({ text: "CAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES", color: primary, size: 18, bold: true, characterSpacing: 60 })] }),
    new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: data.title, font: headingFont, size: 56, color: ink })] }),
    new Paragraph({
      spacing: { after: 600 },
      border: { bottom: { color: secondary, style: BorderStyle.SINGLE, size: 12, space: 8 } },
      children: [new TextRun({ text: data.project.name, size: 26, color: ink })],
    }),
    coverLine("Référence", data.project.reference, ink),
    coverLine("Maître d’ouvrage", data.client, ink),
    coverLine("Lot", data.lot, ink),
    coverLine("Localisation", [data.project.city, data.project.country].filter(Boolean).join(", "), ink),
    coverLine("Phase", data.project.phase, ink),
    coverLine("Version", `${data.version}, du ${dateFmt.format(data.date)}${draft ? ", document de travail" : ""}`, ink),
    coverLine("Établi par", data.company, ink),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "Sommaire", font: headingFont, size: 36, color: primary })] }),
    new TableOfContents("Sommaire", { hyperlink: true, headingStyleRange: "1-2" }),
    new Paragraph({ children: [new PageBreak()] }),
  ].filter((p): p is Paragraph | TableOfContents => p !== null);

  const body: Array<Paragraph | Table> = [];
  // Chaque liste repart à « a) ».
  let listInstance = 0;
  for (const section of data.sections) {
    if (section.kind === "chapitre") {
      body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: body.length > 0, children: [new TextRun(`${section.number} ${section.title}`)] }));
      continue;
    }
    body.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(`${section.number} ${section.title}`)] }));
    if (section.content.length === 0) {
      body.push(new Paragraph({ children: [new TextRun({ text: "Article à rédiger.", italics: true, color: "9A9A9A" })] }));
    }
    for (const block of section.content) {
      if (block.type === "liste") {
        const instance = ++listInstance;
        for (const item of block.items) body.push(new Paragraph({ numbering: { reference: "lettres", level: 0, instance }, spacing: { after: 60 }, children: [new TextRun(item)] }));
        body.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
      } else if (block.type === "exigence") {
        body.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            indent: { left: 240 },
            spacing: { before: 80, after: 160 },
            border: { left: { color: primary, style: BorderStyle.SINGLE, size: 18, space: 10 } },
            shading: { type: ShadingType.CLEAR, color: "auto", fill: "F7F3EE" },
            children: [new TextRun({ text: block.text ?? "", color: ink })],
          }),
        );
      } else if (block.type === "note") {
        body.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 160 }, children: [new TextRun({ text: `Note : ${block.text ?? ""}`, italics: true, color: "6B6B6B" })] }));
      } else {
        body.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 160 }, children: [new TextRun(block.text ?? "")] }));
      }
    }
    const cited = section.referenceIds.map((id) => refById.get(id)?.code).filter(Boolean);
    if (cited.length) {
      body.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: `Références : ${cited.join(", ")}`, size: 17, color: "7A7A7A" })] }));
    }
  }

  // Annexe : références citées, avec leur état de vérification.
  const cited = data.references.filter((r) => data.sections.some((s) => s.referenceIds.includes(r.id)));
  if (cited.length) {
    const cell = (text: string, bold = false, fill?: string) =>
      new TableCell({
        shading: fill ? { type: ShadingType.CLEAR, color: "auto", fill } : undefined,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text, bold, size: 18, color: fill ? "FFFFFF" : ink })] })],
      });
    body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun("Annexe : références citées")] }));
    body.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ tableHeader: true, children: [cell("Code", true, primary), cell("Intitulé", true, primary), cell("Édition", true, primary), cell("Statut", true, primary)] }),
          ...cited.map((r) => new TableRow({ children: [cell(r.code, true), cell(r.title), cell(r.version ?? ""), cell(r.verified ? "Vérifiée" : "À vérifier")] })),
        ],
      }),
    );
  }

  const document = new Document({
    creator: data.company ?? "Talab Solutions",
    title: data.title,
    description: `CCTP ${data.project.reference}`,
    features: { updateFields: true },
    styles: {
      default: {
        document: { run: { font: bodyFont, size: 21, color: ink }, paragraph: { spacing: { line: 300 } } },
        heading1: { run: { font: headingFont, size: 34, color: primary }, paragraph: { spacing: { before: 360, after: 200 } } },
        heading2: { run: { font: bodyFont, size: 24, bold: true, color: ink }, paragraph: { spacing: { before: 280, after: 120 }, keepNext: true } },
      },
    },
    numbering: {
      config: [
        {
          reference: "lettres",
          levels: [{ level: 0, format: LevelFormat.LOWER_LETTER, text: "%1)", alignment: AlignmentType.START, style: { paragraph: { indent: { left: 560, hanging: 320 } } } }],
        },
      ],
    },
    sections: [
      {
        properties: { page: { margin: { top: 1300, bottom: 1200, left: 1250, right: 1250 } } },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: [data.project.reference, data.lot, draft ? "Document de travail" : null].filter(Boolean).join("   |   "), size: 16, color: "8A8A8A" })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                border: { top: { color: secondary, style: BorderStyle.SINGLE, size: 6, space: 6 } },
                children: [
                  new TextRun({ text: `${identity.footerText}   |   ${data.title}   |   Page `, size: 16, color: "8A8A8A" }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "8A8A8A" }),
                  new TextRun({ text: " sur ", size: 16, color: "8A8A8A" }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "8A8A8A" }),
                ],
              }),
            ],
          }),
        },
        children: [...cover, ...body],
      },
    ],
  });
  return Packer.toBuffer(document);
}
