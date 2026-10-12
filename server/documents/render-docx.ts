/**
 * Rendu Word du modèle documentaire : mêmes contenus et même composition que le PDF. Couverture Talab
 * (logo, arche du site, sigle dans la niche, grille d'informations), vrais styles Word (titres 1 à 3,
 * listes, exigences, notes), sommaire actualisable, en-têtes et pieds de page paginés, tableaux dont
 * l'en-tête se répète et dont les lignes ne sont pas coupées, polices du site embarquées.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  FrameAnchorType,
  FrameWrap,
  Header,
  HeadingLevel,
  HorizontalPositionRelativeFrom,
  ImageRun,
  LevelFormat,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TabStopType,
  TextRun,
  TextWrappingType,
  VerticalPositionRelativeFrom,
  WidthType,
  type ParagraphChild,
} from "docx";
import JSZip from "jszip";
import sharp from "sharp";
import type { DocumentIdentity } from "../../shared/settings.js";
import { archSvg, asset, FONTS, hasArabic, LOGO_RATIO, logo, PAGE, type Palette, palette, printable, scriptRuns, TYPE } from "./brand.js";
import { fitColumns } from "./columns.js";
import { coverLayout } from "./cover.js";
import { type Block, type Cell, cellOf, type DocModel, type Inline, type RenderOptions, type Row } from "./model.js";

const twips = (mmValue: number) => Math.round((mmValue * 1440) / 25.4);
const ptTwips = (pt: number) => Math.round(pt * 20);
const half = (pt: number) => Math.round(pt * 2);
const emu = (pt: number) => Math.round(pt * 12700);
const px = (pt: number) => Math.round((pt * 96) / 72);
const hex = (color: string) => color.replace("#", "").toUpperCase();

const BODY = "Manrope";
const STRONG = "Manrope SemiBold";
const SERIF = "Instrument Serif";
const ARABIC = "Noto Sans Arabic";

const dateFr = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/** Image de l'arche (niche teintée), rendue une fois par jeu de couleurs. */
const archCache = new Map<string, Buffer>();
async function archPng(pal: Palette): Promise<Buffer> {
  const key = `${pal.secondary}${pal.primary}${pal.surfaceAlt}`;
  let png = archCache.get(key);
  if (!png) {
    png = await sharp(Buffer.from(archSvg(pal.secondary, pal.primary, 1.1, pal.surfaceAlt)), { density: 300 }).resize({ width: 900 }).png({ compressionLevel: 9 }).toBuffer();
    archCache.set(key, png);
  }
  return png;
}

function runs(content: Inline[], pal: Palette, base: { size?: number; color?: string; font?: string } = {}): TextRun[] {
  const out: TextRun[] = [];
  for (const piece of content) {
    const p = typeof piece === "string" ? { text: piece } : piece;
    const color = p.tone === "muted" ? pal.muted : p.tone === "primary" ? pal.primary : (base.color ?? pal.ink);
    for (const run of scriptRuns(printable(p.text))) {
      out.push(
        new TextRun({
          text: run.text,
          font: run.arabic ? { ascii: ARABIC, hAnsi: ARABIC, cs: ARABIC } : p.bold ? STRONG : (base.font ?? BODY),
          italics: p.italic,
          color: hex(color),
          size: base.size ? half(base.size) : undefined,
          rightToLeft: run.arabic || undefined,
        }),
      );
    }
  }
  return out;
}

function band(children: ParagraphChild[], border: string, fill: string, width = 16): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { left: 200 },
    spacing: { before: 60, after: 140 },
    border: { left: { color: hex(border), style: BorderStyle.SINGLE, size: width, space: 9 } },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: hex(fill) },
    children,
  });
}

const CALLOUT: Record<"info" | "warning" | "danger" | "success", (pal: Palette) => string> = {
  info: (pal) => pal.secondary,
  warning: (pal) => pal.primary,
  danger: () => "#B42318",
  success: () => "#5E7A3A",
};

function tableOf(block: Extract<Block, { type: "table" }>, pal: Palette, contentTwips: number): Table {
  const size = block.dense ? TYPE.tableSmall : TYPE.table;
  // Largeurs communes au PDF : chaque colonne au moins aussi large que son plus long mot, somme = largeur utile.
  const widths = fitColumns(block, { contentWidth: contentTwips / 20, size, padding: 8 }).map((w) => Math.floor(w * 20));
  const none = { style: BorderStyle.NONE, size: 0, color: "auto" };
  const margins = { top: block.dense ? 40 : 60, bottom: block.dense ? 40 : 60, left: 80, right: 80 };
  const align = (a?: string) => (a === "right" ? AlignmentType.RIGHT : a === "center" ? AlignmentType.CENTER : AlignmentType.LEFT);
  const header = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: block.columns.map(
      (c) =>
        new TableCell({
          shading: { type: ShadingType.CLEAR, color: "auto", fill: hex(pal.surface) },
          margins,
          borders: { top: none, left: none, right: none, bottom: { style: BorderStyle.SINGLE, size: 8, color: hex(pal.secondary) } },
          children: [new Paragraph({ alignment: align(c.align), spacing: { after: 0 }, children: [new TextRun({ text: printable(c.label), font: STRONG, size: half(size), color: hex(pal.ink) })] })],
        }),
    ),
  });
  const body = block.rows.map((row: Row, rowIndex) => {
    // Tableau gardé d'un seul tenant : chaque ligne reste avec la suivante, la dernière exceptée.
    const keepNext = Boolean(block.keepTogether) && rowIndex < block.rows.length - 1;
    const strong = row.kind === "group" || row.kind === "subtotal" || row.kind === "total";
    const fill = row.kind === "group" ? pal.surfaceAlt : row.kind === "total" ? pal.surface : null;
    const topBorder = row.kind === "total" || row.kind === "subtotal" ? { style: BorderStyle.SINGLE, size: 8, color: hex(row.kind === "total" ? pal.ink : pal.rule) } : none;
    const cells: TableCell[] = [];
    let index = 0;
    for (const raw of row.cells) {
      const cell: Cell = cellOf(raw);
      const color = cell.tone === "muted" ? pal.muted : cell.tone === "primary" || (row.kind === "group" && index === 0) ? pal.primary : pal.ink;
      cells.push(
        new TableCell({
          columnSpan: cell.colSpan && cell.colSpan > 1 ? cell.colSpan : undefined,
          shading: fill ? { type: ShadingType.CLEAR, color: "auto", fill: hex(fill) } : undefined,
          margins,
          borders: { top: topBorder, left: none, right: none, bottom: { style: BorderStyle.SINGLE, size: 4, color: hex(pal.rule) } },
          children: printable(cell.text)
            .split("\n")
            .map(
              (line, i) =>
                new Paragraph({
                  alignment: align(cell.align ?? block.columns[index]?.align),
                  spacing: { after: 0 },
                  keepNext,
                  children: runs([{ text: line, bold: (cell.bold || strong) && i === 0 }], pal, { size: i === 0 ? size : size - 0.6, color: i === 0 ? color : pal.muted }),
                }),
            ),
        }),
      );
      index += cell.colSpan && cell.colSpan > 1 ? cell.colSpan : 1;
    }
    while (index < block.columns.length) {
      cells.push(new TableCell({ margins, borders: { top: topBorder, left: none, right: none, bottom: { style: BorderStyle.SINGLE, size: 4, color: hex(pal.rule) } }, children: [new Paragraph({ children: [] })] }));
      index++;
    }
    return new TableRow({ cantSplit: true, children: cells });
  });
  return new Table({
    width: { size: contentTwips, type: WidthType.DXA },
    columnWidths: widths,
    borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
    rows: [header, ...body],
  });
}

function blockElements(block: Block, pal: Palette, contentTwips: number, listCounter: { n: number }): Array<Paragraph | Table> {
  switch (block.type) {
    case "heading": {
      const level = block.level === 1 ? HeadingLevel.HEADING_1 : block.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
      const numberColor = block.level === 1 ? pal.secondary : pal.primary;
      return [
        new Paragraph({
          heading: level,
          pageBreakBefore: block.pageBreakBefore,
          children: [
            ...(block.number ? [new TextRun({ text: `${printable(block.number)} `, color: hex(numberColor) })] : []),
            ...scriptRuns(printable(block.text)).map((r) => new TextRun({ text: r.text, ...(r.arabic ? { font: { ascii: ARABIC, hAnsi: ARABIC, cs: ARABIC }, rightToLeft: true } : {}) })),
          ],
        }),
      ];
    }
    case "paragraph":
      return [
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          bidirectional: hasArabic(block.content.map((c) => (typeof c === "string" ? c : c.text)).join("")) || undefined,
          children: runs(block.content, pal, { size: block.tone === "small" ? TYPE.small : undefined, color: block.tone === "muted" ? pal.muted : undefined }),
        }),
      ];
    case "list": {
      const instance = ++listCounter.n;
      const reference = block.ordered === "letters" ? "lettres" : block.ordered === "numbers" ? "nombres" : "puces";
      return block.items.map(
        (item, i) =>
          new Paragraph({
            numbering: { reference, level: 0, instance },
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: i === block.items.length - 1 ? 140 : 50 },
            children: runs(item, pal),
          }),
      );
    }
    case "requirement":
      return [band(runs(block.content, pal), pal.primary, pal.surfaceAlt)];
    case "note":
      return [band([new TextRun({ text: `${block.label ?? "Note"} : `, font: STRONG, color: hex(pal.muted) }), ...runs(block.content, pal, { color: pal.muted, size: TYPE.body - 0.5 })], pal.secondary, pal.theme === "sombre" ? pal.surfaceAlt : "#FBF9F5", 10)];
    case "callout": {
      const color = CALLOUT[block.tone](pal);
      return [band([new TextRun({ text: printable(block.title), font: STRONG, color: hex(color), break: 0 }), new TextRun({ text: "", break: 1 }), ...runs(block.content, pal)], color, pal.surfaceAlt)];
    }
    case "keyValues": {
      const none = { style: BorderStyle.NONE, size: 0, color: "auto" };
      const line = { style: BorderStyle.SINGLE, size: 4, color: hex(pal.rule) };
      const first = Math.round(contentTwips * 0.32);
      return [
        new Table({
          width: { size: contentTwips, type: WidthType.DXA },
          columnWidths: [first, contentTwips - first],
          borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: line, insideVertical: none },
          rows: block.rows.map(
            ([k, v]) =>
              new TableRow({
                cantSplit: true,
                children: [
                  new TableCell({ margins: { top: 50, bottom: 50, left: 0, right: 80 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: printable(k), size: half(TYPE.small), color: hex(pal.muted) })] })] }),
                  new TableCell({ margins: { top: 50, bottom: 50, left: 0, right: 0 }, children: [new Paragraph({ spacing: { after: 0 }, children: runs([v], pal) })] }),
                ],
              }),
          ),
        }),
        new Paragraph({ spacing: { after: 80 }, children: [] }),
      ];
    }
    case "table":
      return [
        ...(block.caption ? [new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: printable(block.caption), size: half(TYPE.small), color: hex(pal.muted) })] })] : []),
        tableOf(block, pal, contentTwips),
        new Paragraph({ spacing: { after: 120 }, children: [] }),
      ];
    case "references":
      return block.codes.length
        ? [new Paragraph({ spacing: { after: 140 }, children: [new TextRun({ text: "Références : ", font: STRONG, size: half(TYPE.small), color: hex(pal.muted) }), new TextRun({ text: printable(block.codes.join(", ")), size: half(TYPE.small), color: hex(pal.muted) })] })]
        : [];
    case "pageBreak":
      return [new Paragraph({ pageBreakBefore: true, children: [] })];
  }
}

export async function renderDocx(doc: DocModel, identity: DocumentIdentity, options: RenderOptions): Promise<Buffer> {
  const pal = palette(options.theme, identity);
  const m = doc.meta;
  const landscape = m.orientation === "landscape";
  // Dimensions de la page en points (A4), identiques au PDF.
  const pageW = landscape ? 841.89 : 595.28;
  const pageH = landscape ? 595.28 : 841.89;
  const sidePt = (PAGE.marginSide * 72) / 25.4;
  const contentTwips = ptTwips(pageW - sidePt * 2);
  const g = coverLayout(m, { width: pageW, height: pageH });
  const logoW = (46 * 72) / 25.4;
  // Retrait à droite du bloc de titre : il garde la largeur calculée (il ne croise pas l'arche en paysage).
  const titleIndent = ptTwips(pageW - sidePt * 2 - g.textWidth);

  const absoluteFrame = (x: number, y: number, width: number) => ({
    type: "absolute" as const,
    position: { x: ptTwips(x), y: ptTwips(y) },
    width: ptTwips(width),
    wrap: FrameWrap.THROUGH,
    anchor: { horizontal: FrameAnchorType.PAGE, vertical: FrameAnchorType.PAGE },
  });

  const halfRows = Math.ceil(g.rows.length / 2);
  const gridTwips = ptTwips(g.gridWidth);
  const none = { style: BorderStyle.NONE, size: 0, color: "auto" };
  const infoCell = (items: Array<[string, string]>) =>
    new TableCell({
      borders: { top: none, bottom: none, left: none, right: none },
      margins: { top: 0, bottom: 0, left: 0, right: 200 },
      children: items.flatMap(([label, value]) => [
        new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: printable(label.toUpperCase()), size: 13, characterSpacing: 18, color: hex(pal.faint) })] }),
        new Paragraph({ spacing: { after: 170 }, children: runs([{ text: value, bold: true }], pal, { size: 9.2 }) }),
      ]),
    });

  // Titre et grille dans le flux de la page 1, l'un sous l'autre : aucune position absolue pour un texte variable.
  const anchorHeight = 12;
  const cover: Array<Paragraph | Table> = [
    new Paragraph({
      spacing: { after: 0, line: ptTwips(anchorHeight), lineRule: "exact" as never },
      children: [
        new ImageRun({
          type: "png",
          data: logo("logo", pal.theme),
          transformation: { width: px(logoW), height: px(logoW / LOGO_RATIO.logo) },
          floating: {
            horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: emu(sidePt) },
            verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: emu((18 * 72) / 25.4) },
            wrap: { type: TextWrappingType.NONE },
            behindDocument: true,
          },
        }),
        new ImageRun({
          type: "png",
          data: await archPng(pal),
          transformation: { width: px(g.arch.width), height: px(g.arch.width * 1.2) },
          floating: {
            horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: emu(g.arch.x) },
            verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: emu(g.arch.y) },
            wrap: { type: TextWrappingType.NONE },
            behindDocument: true,
          },
        }),
      ],
    }),
    new Paragraph({
      frame: absoluteFrame(sidePt, (24 * 72) / 25.4, pageW - sidePt * 2),
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: printable((m.project.phase ?? "Dossier de consultation").toUpperCase()), size: 14, characterSpacing: 28, color: hex(pal.muted) })],
    }),
    new Paragraph({
      frame: absoluteFrame(g.arch.x + g.arch.width * 0.35, g.arch.y + g.arch.width * 1.2 * 0.68, g.arch.width * 0.3),
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: printable(m.shortLabel), font: SERIF, size: half(Math.min(26, (g.arch.width * 0.28) / (0.52 * Math.max(m.shortLabel.length, 1)))), color: hex(pal.primary) })],
    }),
    new Paragraph({
      indent: { right: titleIndent },
      spacing: { before: ptTwips(Math.max(g.top - (PAGE.marginTop * 72) / 25.4 - anchorHeight, 0)), after: 200 },
      children: [new TextRun({ text: printable(m.typeLabel.toUpperCase()), font: STRONG, size: half(TYPE.coverKicker), characterSpacing: 32, color: hex(pal.primary) })],
    }),
    new Paragraph({
      indent: { right: titleIndent },
      spacing: { after: 240, line: Math.round(240 * 1.05) },
      children: runs([m.title], pal, { size: g.titleSize, font: SERIF }),
    }),
    new Paragraph({
      indent: { right: titleIndent },
      spacing: { after: m.disclaimer ? 120 : 440 },
      border: { bottom: { color: hex(pal.secondary), style: BorderStyle.SINGLE, size: 8, space: 10 } },
      children: runs([m.project.name], pal, { size: TYPE.coverProject }),
    }),
    ...(m.disclaimer ? [new Paragraph({ indent: { right: titleIndent }, spacing: { before: 120, after: 440 }, children: runs([m.disclaimer], pal, { size: 7.6, color: pal.muted }) })] : []),
    new Table({
      width: { size: gridTwips, type: WidthType.DXA },
      columnWidths: [Math.round(gridTwips / 2), gridTwips - Math.round(gridTwips / 2)],
      borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
      rows: [new TableRow({ cantSplit: true, children: [infoCell(g.rows.slice(0, halfRows)), infoCell(g.rows.slice(halfRows))] })],
    }),
    new Paragraph({ pageBreakBefore: true, children: [] }),
  ];

  const toc: Array<Paragraph | TableOfContents> = m.toc
    ? [
        new Paragraph({ spacing: { after: 280 }, children: [new TextRun({ text: "Sommaire", font: SERIF, size: 44, color: hex(pal.primary) })] }),
        new TableOfContents("Sommaire", { hyperlink: true, headingStyleRange: "1-2" }),
        new Paragraph({ pageBreakBefore: true, children: [] }),
      ]
    : [];

  const listCounter = { n: 0 };
  const body: Array<Paragraph | Table> = [];
  doc.blocks.forEach((block, i) => {
    const elements = blockElements(block, pal, contentTwips, listCounter);
    // Premier chapitre : la page précédente est déjà le sommaire ou la couverture.
    if (i === 0 && block.type === "heading" && block.pageBreakBefore) {
      body.push(...blockElements({ ...block, pageBreakBefore: false }, pal, contentTwips, listCounter));
    } else body.push(...elements);
  });

  const runningLeft = printable(m.title.startsWith(m.shortLabel) ? m.title : `${m.shortLabel}  |  ${m.title}`);
  const symbolW = 21;
  const document = new Document({
    creator: m.company ?? "Talab Solutions",
    title: m.title,
    description: `${m.typeLabel}, ${m.project.reference}`,
    background: pal.theme === "sombre" ? { color: hex(pal.page) } : undefined,
    features: { updateFields: m.toc },
    fonts: [
      { name: BODY, data: asset(FONTS.regular) },
      { name: STRONG, data: asset(FONTS.semibold) },
      { name: SERIF, data: asset(FONTS.serif) },
      { name: ARABIC, data: asset(FONTS.arabic) },
    ],
    styles: {
      default: {
        document: { run: { font: BODY, size: half(TYPE.body), color: hex(pal.ink) }, paragraph: { spacing: { line: 288, after: 110 } } },
        heading1: { run: { font: SERIF, size: half(TYPE.h1), color: hex(pal.primary) }, paragraph: { spacing: { before: 360, after: 200 }, keepNext: true, border: { bottom: { color: hex(pal.secondary), style: BorderStyle.SINGLE, size: 6, space: 6 } } } },
        heading2: { run: { font: STRONG, size: half(TYPE.h2), color: hex(pal.ink) }, paragraph: { spacing: { before: 240, after: 90 }, keepNext: true } },
        heading3: { run: { font: STRONG, size: half(TYPE.h3), color: hex(pal.muted) }, paragraph: { spacing: { before: 160, after: 70 }, keepNext: true } },
        listParagraph: { run: { font: BODY } },
      },
      paragraphStyles: [
        { id: "TOC1", name: "toc 1", basedOn: "Normal", next: "Normal", run: { font: STRONG, size: half(TYPE.body), color: hex(pal.ink) }, paragraph: { spacing: { before: 140, after: 40 } } },
        { id: "TOC2", name: "toc 2", basedOn: "Normal", next: "Normal", run: { font: BODY, size: half(TYPE.body), color: hex(pal.muted) }, paragraph: { indent: { left: 280 }, spacing: { after: 30 } } },
      ],
    },
    numbering: {
      config: [
        { reference: "lettres", levels: [{ level: 0, format: LevelFormat.LOWER_LETTER, text: "%1)", alignment: AlignmentType.START, style: { paragraph: { indent: { left: 560, hanging: 320 } }, run: { color: hex(pal.primary) } } }] },
        { reference: "nombres", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START, style: { paragraph: { indent: { left: 560, hanging: 320 } }, run: { color: hex(pal.primary) } } }] },
        { reference: "puces", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.START, style: { paragraph: { indent: { left: 560, hanging: 280 } }, run: { color: hex(pal.secondary) } } }] },
      ],
    },
    sections: [
      {
        properties: {
          titlePage: true,
          page: {
            size: { orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT, width: twips(210), height: twips(297) },
            margin: { top: twips(PAGE.marginTop), bottom: twips(PAGE.marginBottom), left: twips(PAGE.marginSide), right: twips(PAGE.marginSide), header: twips(PAGE.headerTop), footer: twips(PAGE.footerBottom) },
          },
        },
        headers: {
          first: new Header({ children: [new Paragraph({ children: [] })] }),
          default: new Header({
            children: [
              new Paragraph({
                tabStops: [{ type: TabStopType.RIGHT, position: contentTwips }],
                border: { bottom: { color: hex(pal.rule), style: BorderStyle.SINGLE, size: 4, space: 4 } },
                children: [
                  new ImageRun({ type: "png", data: logo("symbole", pal.theme), transformation: { width: px(symbolW), height: px(symbolW / LOGO_RATIO.symbole) } }),
                  new TextRun({ text: `   ${runningLeft}`, size: half(TYPE.running), color: hex(pal.muted) }),
                  new TextRun({ text: `\t${printable([m.project.reference, m.lot].filter(Boolean).join("  |  "))}`, size: half(TYPE.running), color: hex(pal.muted) }),
                ],
              }),
            ],
          }),
        },
        footers: {
          first: new Footer({
            children: [
              new Paragraph({
                tabStops: [{ type: TabStopType.RIGHT, position: contentTwips }],
                border: { top: { color: hex(pal.primary), style: BorderStyle.SINGLE, size: 8, space: 6 } },
                children: [
                  new TextRun({ text: printable(m.footerText), size: 14, color: hex(pal.muted) }),
                  new TextRun({ text: `\t${printable(`${m.project.reference}  |  ${dateFr.format(m.date)}`)}`, size: 14, color: hex(pal.muted) }),
                ],
              }),
            ],
          }),
          default: new Footer({
            children: [
              new Paragraph({
                tabStops: [{ type: TabStopType.RIGHT, position: contentTwips }],
                border: { top: { color: hex(pal.rule), style: BorderStyle.SINGLE, size: 4, space: 4 } },
                children: [
                  new TextRun({ text: printable(`${m.footerText}  |  ${m.project.name}`), size: half(TYPE.running), color: hex(pal.faint) }),
                  new TextRun({ text: "\tPage ", size: half(TYPE.running), color: hex(pal.muted) }),
                  new TextRun({ children: [PageNumber.CURRENT], size: half(TYPE.running), color: hex(pal.muted) }),
                  new TextRun({ text: " sur ", size: half(TYPE.running), color: hex(pal.muted) }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: half(TYPE.running), color: hex(pal.muted) }),
                ],
              }),
            ],
          }),
        },
        children: [...cover, ...toc, ...body],
      },
    ],
  });
  return finish(await Packer.toBuffer(document), pal.theme === "sombre");
}

/**
 * Réglages complétés dans le fichier produit : contrôle des veuves et orphelines pour tous les paragraphes
 * (propriété par défaut du document), affichage de la couleur de page en thème sombre (displayBackgroundShape).
 */
async function finish(buffer: Buffer, dark: boolean): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const styles = zip.file("word/styles.xml");
  if (styles) {
    const xml = await styles.async("string");
    if (!xml.includes("<w:widowControl")) {
      const withDefault = /<w:pPrDefault>\s*<w:pPr>/.test(xml)
        ? xml.replace(/<w:pPrDefault>(\s*)<w:pPr>/, "<w:pPrDefault>$1<w:pPr><w:widowControl/>")
        : xml.replace(/<w:docDefaults>/, "<w:docDefaults><w:pPrDefault><w:pPr><w:widowControl/></w:pPr></w:pPrDefault>");
      zip.file("word/styles.xml", withDefault);
    }
  }
  if (dark) {
    const settings = zip.file("word/settings.xml");
    const xml = settings ? await settings.async("string") : null;
    if (xml && !xml.includes("displayBackgroundShape")) zip.file("word/settings.xml", xml.replace(/<w:settings([^>]*)>/, "<w:settings$1><w:displayBackgroundShape/>"));
  }
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}
