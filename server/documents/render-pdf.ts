/**
 * Rendu PDF du modèle documentaire (pdfmake, sans navigateur) : couverture Talab avec l'arche du site,
 * en-têtes et pieds de page, sommaire automatique, titres jamais isolés en bas de page, tableaux dont
 * l'en-tête se répète à chaque page et dont les lignes ne sont pas coupées, polices embarquées.
 * Les polices et logos sont lus en mémoire : aucun accès au disque ni au réseau pendant le rendu.
 */
import pdfmake from "pdfmake";
import type { Content, ContentTable, CustomTableLayout, TDocumentDefinitions } from "pdfmake/interfaces.js";
import { archSvg, asset, FONTS, LOGO_RATIO, logo, mm, PAGE, type Palette, palette, printable, scriptRuns, TYPE } from "./brand.js";
import { type Block, type Cell, cellOf, type DocModel, type Inline, plain, type RenderOptions, type Row } from "./model.js";
import type { DocumentIdentity } from "../../shared/settings.js";

type Pdf = typeof pdfmake & { virtualfs: { writeFileSync(name: string, data: Buffer): void } };
let configured = false;

function configure() {
  if (configured) return;
  const pdf = pdfmake as Pdf;
  for (const file of Object.values(FONTS)) pdf.virtualfs.writeFileSync(file.replace("fonts/", ""), asset(file));
  pdf.setFonts({
    Manrope: { normal: "Manrope-Regular.ttf", bold: "Manrope-SemiBold.ttf", italics: "Manrope-Regular.ttf", bolditalics: "Manrope-SemiBold.ttf" },
    ManropeBold: { normal: "Manrope-Bold.ttf", bold: "Manrope-Bold.ttf", italics: "Manrope-Bold.ttf", bolditalics: "Manrope-Bold.ttf" },
    Serif: { normal: "InstrumentSerif-Regular.ttf", bold: "InstrumentSerif-Regular.ttf", italics: "InstrumentSerif-Italic.ttf", bolditalics: "InstrumentSerif-Italic.ttf" },
    Arabic: { normal: "NotoSansArabic-Regular.ttf", bold: "NotoSansArabic-SemiBold.ttf", italics: "NotoSansArabic-Regular.ttf", bolditalics: "NotoSansArabic-SemiBold.ttf" },
  });
  // Rendu fermé : ni téléchargement, ni lecture de fichiers en dehors du système virtuel.
  pdf.setUrlAccessPolicy(() => false);
  pdf.setLocalAccessPolicy(() => false);
  configured = true;
}

/** Caractères absents d'Instrument Serif : rendus en Manrope dans les titres. */
const SERIF_MISSING = /[²³±≤≥µ‰]/;

type TextNode = { text: string; bold?: boolean; italics?: boolean; color?: string; font?: string };

function textNodes(content: Inline[], pal: Palette, font?: string): TextNode[] {
  const nodes: TextNode[] = [];
  for (const piece of content) {
    const p = typeof piece === "string" ? { text: piece } : piece;
    const color = p.tone === "muted" ? pal.muted : p.tone === "primary" ? pal.primary : undefined;
    for (const run of scriptRuns(printable(p.text))) {
      if (run.arabic) {
        nodes.push({ text: run.text, bold: p.bold, color, font: "Arabic" });
      } else if (font === "Serif" && SERIF_MISSING.test(run.text)) {
        for (const part of run.text.split(/([²³±≤≥µ‰])/).filter(Boolean)) {
          nodes.push({ text: part, color, italics: p.italic, ...(SERIF_MISSING.test(part) ? { font: "Manrope" } : {}) });
        }
      } else {
        nodes.push({ text: run.text, bold: p.bold, italics: p.italic, color });
      }
    }
  }
  return nodes;
}

/** Filet horizontal pleine largeur. */
function rule(width: number, color: string, thickness = 0.6, margin: [number, number, number, number] = [0, 2, 0, 6]): Content {
  return { canvas: [{ type: "line", x1: 0, y1: 0, x2: width, y2: 0, lineWidth: thickness, lineColor: color }], margin };
}

function bandLayout(border: string, fill: string, width = 2): CustomTableLayout {
  return {
    hLineWidth: () => 0,
    vLineWidth: (i: number) => (i === 0 ? width : 0),
    vLineColor: () => border,
    fillColor: () => fill,
    paddingLeft: () => 9,
    paddingRight: () => 8,
    paddingTop: () => 5,
    paddingBottom: () => 5,
  };
}

const CALLOUT: Record<"info" | "warning" | "danger" | "success", (pal: Palette) => string> = {
  info: (pal) => pal.secondary,
  warning: (pal) => pal.primary,
  danger: () => "#B42318",
  success: () => "#5E7A3A",
};

function tableNode(block: Extract<Block, { type: "table" }>, pal: Palette, contentWidth: number): Content {
  const size = block.dense ? TYPE.tableSmall : TYPE.table;
  const header = block.columns.map((c) => ({
    text: printable(c.label),
    bold: true,
    fontSize: size,
    color: pal.ink,
    fillColor: pal.surface,
    alignment: c.align ?? "left",
  }));
  const body = block.rows.map((row: Row) => {
    const cells: unknown[] = [];
    let skip = 0;
    row.cells.forEach((raw, index) => {
      if (skip > 0) {
        skip--;
        cells.push({});
        return;
      }
      const cell: Cell = cellOf(raw);
      const strong = cell.bold || row.kind === "group" || row.kind === "subtotal" || row.kind === "total";
      const color = cell.tone === "muted" ? pal.muted : cell.tone === "primary" || (row.kind === "group" && index === 0) ? pal.primary : pal.ink;
      // Cellule sur plusieurs lignes : la première porte le libellé, les suivantes les précisions (en gris).
      const lines = cell.text.split("\n");
      const text = lines.flatMap((line, li) => {
        const nodes = textNodes([{ text: line, bold: strong && li === 0 }], pal).map((n) => (li === 0 ? n : { ...n, color: pal.muted, fontSize: size - 0.8 }));
        return li < lines.length - 1 ? [...nodes, { text: "\n" }] : nodes;
      });
      cells.push({
        text,
        fontSize: row.kind === "note" ? size - 0.6 : size,
        color,
        alignment: cell.align ?? block.columns[index]?.align ?? "left",
        fillColor: row.kind === "group" ? pal.surfaceAlt : row.kind === "total" ? pal.surface : undefined,
        ...(cell.colSpan && cell.colSpan > 1 ? { colSpan: cell.colSpan } : {}),
      });
      if (cell.colSpan && cell.colSpan > 1) skip = cell.colSpan - 1;
    });
    while (cells.length < block.columns.length) cells.push({ text: "" });
    return cells;
  });
  const kinds = block.rows.map((r) => r.kind ?? "item");
  const node: ContentTable = {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      keepWithHeaderRows: 1,
      widths: block.columns.map((c) => (c.width === undefined || c.width === "*" ? "*" : Math.round((c.width / 100) * contentWidth))),
      body: [header, ...body] as never,
    },
    layout: {
      hLineWidth: (i: number) => {
        if (i === 0 || i === 1) return 0.8;
        const kind = kinds[i - 1];
        return kind === "total" || kind === "subtotal" ? 0.8 : 0.4;
      },
      vLineWidth: () => 0,
      hLineColor: (i: number) => (i <= 1 ? pal.secondary : kinds[i - 1] === "total" ? pal.ink : pal.rule),
      paddingLeft: () => 4,
      paddingRight: () => 4,
      paddingTop: () => (block.dense ? 2.5 : 3.5),
      paddingBottom: () => (block.dense ? 2.5 : 3.5),
    },
    margin: [0, 2, 0, 10],
  };
  const stack: Content[] = [];
  if (block.caption) stack.push({ text: printable(block.caption), fontSize: TYPE.small, color: pal.muted, margin: [0, 0, 0, 3] });
  stack.push(node);
  return { stack };
}

function blockNodes(block: Block, pal: Palette, contentWidth: number): Content[] {
  switch (block.type) {
    case "heading": {
      if (block.level === 1) {
        return [
          {
            stack: [
              {
                columns: [
                  { width: 11, svg: archSvg(pal.secondary, pal.primary, 14), height: 13.2, margin: [0, 4, 0, 0] },
                  {
                    width: "*",
                    text: [
                      ...(block.number ? [{ text: `${printable(block.number)} `, color: pal.secondary }] : []),
                      ...textNodes([block.text], pal, "Serif").map((n) => ({ ...n, color: pal.primary })),
                    ],
                    font: "Serif",
                    fontSize: TYPE.h1,
                    lineHeight: 1.1,
                    ...(block.toc !== false ? { tocItem: true, tocMargin: [0, 7, 0, 1], tocStyle: { bold: true, color: pal.ink, font: "Manrope", fontSize: TYPE.body } } : {}),
                  },
                ],
                columnGap: 8,
              },
              rule(contentWidth, pal.secondary, 0.6, [0, 5, 0, 10]),
            ],
            headlineLevel: 1,
            ...(block.pageBreakBefore ? { pageBreak: "before" as const } : {}),
          } as unknown as Content,
        ];
      }
      const size = block.level === 2 ? TYPE.h2 : TYPE.h3;
      return [
        {
          text: [
            ...(block.number ? [{ text: `${printable(block.number)} `, color: pal.primary, bold: true }] : []),
            ...textNodes([{ text: block.text, bold: true }], pal),
          ],
          fontSize: size,
          color: block.level === 3 ? pal.muted : pal.ink,
          margin: [0, block.level === 2 ? 10 : 7, 0, 4],
          headlineLevel: block.level,
          ...(block.level === 2 && block.toc !== false ? { tocItem: true, tocMargin: [14, 1, 0, 0], tocStyle: { color: pal.muted, lineHeight: 1.25 } } : {}),
          ...(block.pageBreakBefore ? { pageBreak: "before" as const } : {}),
        } as unknown as Content,
      ];
    }
    case "paragraph":
      return [
        {
          text: textNodes(block.content, pal),
          alignment: "justify",
          fontSize: block.tone === "small" ? TYPE.small : TYPE.body,
          color: block.tone === "muted" ? pal.muted : pal.ink,
          margin: [0, 0, 0, 5],
        },
      ];
    case "list": {
      const items = block.items.map((item) => ({ text: textNodes(item, pal), alignment: "justify" as const, margin: [0, 0, 0, 2] as [number, number, number, number] }));
      if (block.ordered === "bullets") return [{ ul: items, markerColor: pal.secondary, margin: [10, 0, 0, 6] }];
      return [{ ol: items, type: block.ordered === "letters" ? "lower-alpha" : "decimal", separator: ")", markerColor: pal.primary, margin: [10, 0, 0, 6] } as unknown as Content];
    }
    case "requirement":
      return [
        {
          table: { widths: ["*"], body: [[{ text: textNodes(block.content, pal), alignment: "justify", color: pal.ink }]] },
          layout: bandLayout(pal.primary, pal.surfaceAlt),
          margin: [0, 2, 0, 7],
        },
      ];
    case "note":
      return [
        {
          table: {
            widths: ["*"],
            body: [[{ text: [{ text: `${block.label ?? "Note"} : `, bold: true, color: pal.muted }, ...textNodes(block.content, pal)], alignment: "justify", color: pal.muted, fontSize: TYPE.body - 0.5 }]],
          },
          layout: bandLayout(pal.secondary, pal.theme === "sombre" ? pal.surfaceAlt : "#FBF9F5", 1.2),
          margin: [0, 2, 0, 7],
        },
      ];
    case "callout": {
      const color = CALLOUT[block.tone](pal);
      return [
        {
          table: {
            widths: ["*"],
            body: [[{ stack: [{ text: printable(block.title), bold: true, color, margin: [0, 0, 0, 2] }, { text: textNodes(block.content, pal), color: pal.ink }] }]],
          },
          layout: bandLayout(color, pal.surfaceAlt),
          unbreakable: true,
          margin: [0, 2, 0, 8],
        } as unknown as Content,
      ];
    }
    case "keyValues":
      return [
        {
          table: {
            widths: [Math.round(contentWidth * 0.32), "*"],
            body: block.rows.map(([k, v]) => [
              { text: printable(k), color: pal.muted, fontSize: TYPE.small },
              { text: textNodes([v], pal), color: pal.ink },
            ]),
          },
          layout: {
            hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === node.table.body.length ? 0 : 0.4),
            vLineWidth: () => 0,
            hLineColor: () => pal.rule,
            paddingTop: () => 3,
            paddingBottom: () => 3,
            paddingLeft: () => 0,
          },
          margin: [0, 2, 0, 8],
        } as unknown as Content,
      ];
    case "table":
      return [tableNode(block, pal, contentWidth)];
    case "references":
      return block.codes.length ? [{ text: [{ text: "Références : ", bold: true }, { text: printable(block.codes.join(", ")) }], fontSize: TYPE.small, color: pal.muted, margin: [0, 0, 0, 7] }] : [];
    case "pageBreak":
      return [{ text: "", pageBreak: "after" }];
  }
}

const dateFr = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

function coverNodes(doc: DocModel, pal: Palette, page: { width: number; height: number }): Content[] {
  const m = doc.meta;
  const side = mm(PAGE.marginSide);
  const logoWidth = mm(46);
  const archWidth = Math.min(page.width * 0.4, 240);
  const archX = page.width - side - archWidth + 10;
  const archY = page.height * 0.2;
  const textWidth = page.width - side * 2 - archWidth * 0.55;
  const info: Array<[string, string | null]> = [
    ["Maître d’ouvrage", m.client],
    ["Localisation", m.project.location],
    ["Référence du dossier", m.project.reference],
    ["Lot", m.lot],
    ["Version", m.version !== null ? `${m.version}, du ${dateFr.format(m.date)}` : dateFr.format(m.date)],
    ["Statut", m.status],
    ["Phase", m.project.phase],
    ["Établi par", m.company],
  ];
  const rows = info.filter((r): r is [string, string] => Boolean(r[1]));
  const half = Math.ceil(rows.length / 2);
  const column = (items: Array<[string, string]>) => ({
    stack: items.map(([label, value]) => ({
      stack: [
        { text: printable(label.toUpperCase()), fontSize: 6.6, characterSpacing: 0.9, color: pal.faint },
        { text: textNodes([value], pal), fontSize: 9.2, bold: true, color: pal.ink, margin: [0, 1, 0, 0] },
      ],
      margin: [0, 0, 0, 9],
    })),
  });
  return [
    { image: "logo", width: logoWidth, height: logoWidth / LOGO_RATIO.logo, absolutePosition: { x: side, y: mm(18) } },
    {
      columns: [{ width: page.width - side * 2, text: printable((m.project.phase ?? "Dossier de consultation").toUpperCase()), fontSize: 7, characterSpacing: 1.4, color: pal.muted, alignment: "right" }],
      absolutePosition: { x: side, y: mm(24) },
    } as unknown as Content,
    { svg: archSvg(pal.secondary, pal.primary, 1.1, pal.surfaceAlt), width: archWidth, height: archWidth * 1.2, absolutePosition: { x: archX, y: archY } },
    {
      columns: [{ width: archWidth * 0.3, text: printable(m.shortLabel), font: "Serif", fontSize: Math.min(26, (archWidth * 0.28) / (0.52 * Math.max(m.shortLabel.length, 1))), color: pal.primary, alignment: "center" }],
      absolutePosition: { x: archX + archWidth * 0.35, y: archY + archWidth * 1.2 * 0.68 },
    } as unknown as Content,
    {
      columns: [
        {
          width: textWidth,
          stack: [
        { text: printable(m.typeLabel.toUpperCase()), fontSize: TYPE.coverKicker, characterSpacing: 1.6, color: pal.primary, bold: true, margin: [0, 0, 0, 10] },
        { text: textNodes([m.title], pal, "Serif"), font: "Serif", fontSize: TYPE.coverTitle, lineHeight: 1.05, color: pal.ink, margin: [0, 0, 0, 12] },
        { text: textNodes([m.project.name], pal), fontSize: TYPE.coverProject, color: pal.ink, margin: [0, 0, 0, 10] },
        rule(textWidth * 0.6, pal.secondary, 1, [0, 0, 0, 0]),
            ...(m.disclaimer ? [{ text: printable(m.disclaimer), fontSize: 7.6, color: pal.muted, margin: [0, 10, 0, 0] as [number, number, number, number] }] : []),
          ],
        },
      ],
      absolutePosition: { x: side, y: page.height * 0.5 },
    } as unknown as Content,
    {
      columns: [
        { width: (page.width - side * 2 - 24) / 2, ...column(rows.slice(0, half)) },
        { width: (page.width - side * 2 - 24) / 2, ...column(rows.slice(half)) },
      ],
      columnGap: 24,
      absolutePosition: { x: side, y: page.height * 0.69 },
    } as unknown as Content,
    {
      canvas: [{ type: "line", x1: 0, y1: 0, x2: page.width - side * 2, y2: 0, lineWidth: 1, lineColor: pal.primary }],
      absolutePosition: { x: side, y: page.height - mm(20) },
    },
    {
      columns: [
        { width: (page.width - side * 2) / 2, text: printable(m.footerText), fontSize: 7.2, color: pal.muted },
        { width: (page.width - side * 2) / 2, text: printable(`${m.project.reference}  |  ${dateFr.format(m.date)}`), fontSize: 7.2, color: pal.muted, alignment: "right" },
      ],
      absolutePosition: { x: side, y: page.height - mm(17) },
    } as unknown as Content,
  ];
}

export async function renderPdf(doc: DocModel, identity: DocumentIdentity, options: RenderOptions): Promise<Buffer> {
  configure();
  const pal = palette(options.theme, identity);
  const landscape = doc.meta.orientation === "landscape";
  const page = landscape ? { width: 841.89, height: 595.28 } : { width: 595.28, height: 841.89 };
  const side = mm(PAGE.marginSide);
  const contentWidth = page.width - side * 2;
  const m = doc.meta;

  // La couverture est tracée en arrière-plan de la page 1, hors marges : rien ne peut déborder sur la page 2.
  const cover = coverNodes(doc, pal, page);
  const night: Content = { canvas: [{ type: "rect", x: 0, y: 0, w: page.width, h: page.height, color: pal.page }] };
  const content: Content[] = [{ text: " ", pageBreak: "after" }];
  if (m.toc) {
    content.push({
      toc: {
        title: { text: "Sommaire", font: "Serif", fontSize: 22, color: pal.primary, margin: [0, 0, 0, 14] },
        numberStyle: { color: pal.muted },
      },
    } as unknown as Content);
    content.push({ text: "", pageBreak: "after" });
  }
  doc.blocks.forEach((block, i) => {
    const nodes = blockNodes(block, pal, contentWidth);
    // Premier chapitre : pas de saut de page avant (la page précédente est le sommaire ou la couverture).
    if (i === 0 && block.type === "heading" && block.pageBreakBefore) {
      for (const n of nodes) delete (n as { pageBreak?: unknown }).pageBreak;
    }
    content.push(...nodes);
  });

  const definition: TDocumentDefinitions = {
    pageSize: "A4",
    pageOrientation: landscape ? "landscape" : "portrait",
    pageMargins: [side, mm(PAGE.marginTop), side, mm(PAGE.marginBottom)],
    info: { title: m.title, author: m.company ?? "Talab Solutions", subject: `${m.typeLabel}, ${m.project.reference}`, creator: "Talab Solutions", producer: "Talab Solutions" },
    images: {
      logo: `data:image/png;base64,${logo("logo", pal.theme).toString("base64")}`,
      symbol: `data:image/png;base64,${logo("symbole", pal.theme).toString("base64")}`,
    },
    defaultStyle: { font: "Manrope", fontSize: TYPE.body, lineHeight: TYPE.lineHeight, color: pal.ink },
    background: (currentPage: number) => {
      const layers: Content[] = pal.theme === "sombre" ? [night] : [];
      if (currentPage === 1) layers.push(...cover);
      return layers.length ? ({ stack: layers } as Content) : (null as unknown as Content);
    },
    header: (currentPage: number) => {
      if (currentPage === 1) return null as unknown as Content;
      return {
        stack: [
          {
            columns: [
              { image: "symbol", width: 21, height: 21 / LOGO_RATIO.symbole },
              { text: printable(m.title.startsWith(m.shortLabel) ? m.title : `${m.shortLabel}  |  ${m.title}`), fontSize: TYPE.running, color: pal.muted, margin: [8, 3, 0, 0] },
              { text: printable([m.project.reference, m.lot].filter(Boolean).join("  |  ")), fontSize: TYPE.running, color: pal.muted, alignment: "right", margin: [0, 3, 0, 0] },
            ],
          },
          rule(contentWidth, pal.rule, 0.5, [0, 4, 0, 0]),
        ],
        margin: [side, mm(PAGE.headerTop), side, 0],
      } as unknown as Content;
    },
    footer: (currentPage: number, pageCount: number) => {
      if (currentPage === 1) return null as unknown as Content;
      return {
        stack: [
          rule(contentWidth, pal.rule, 0.5, [0, 0, 0, 4]),
          {
            columns: [
              { text: printable(`${m.footerText}  |  ${m.project.name}`), fontSize: TYPE.running, color: pal.faint },
              { text: `Page ${currentPage} sur ${pageCount}`, fontSize: TYPE.running, color: pal.muted, alignment: "right" },
            ],
          },
        ],
        margin: [side, 6, side, 0],
      } as unknown as Content;
    },
    // Un titre n'est jamais laissé seul en bas de page.
    pageBreakBefore: (current, queries) => Boolean((current as { headlineLevel?: number }).headlineLevel) && queries.getFollowingNodesOnPage().length === 0,
    content,
  };
  const pdf = pdfmake.createPdf(definition);
  return Buffer.from(await pdf.getBuffer());
}

/** Texte de contrôle (tests) : titre et nombre de blocs. */
export function describeModel(doc: DocModel): string {
  return `${doc.meta.title} (${doc.blocks.length} blocs) ${doc.blocks
    .filter((b) => b.type === "paragraph")
    .slice(0, 1)
    .map((b) => plain((b as { content: Inline[] }).content))
    .join("")}`;
}
