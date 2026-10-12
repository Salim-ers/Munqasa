/**
 * Rendu PDF du modèle documentaire (pdfmake, sans navigateur) : couverture Talab avec l'arche du site,
 * en-têtes et pieds de page, sommaire automatique, titres jamais isolés en bas de page, tableaux dont
 * l'en-tête se répète à chaque page et dont les lignes ne sont pas coupées, polices embarquées.
 * Les polices et logos sont lus en mémoire : aucun accès au disque ni au réseau pendant le rendu.
 *
 * Composition :
 * - couverture : décor (logo, arche, sigle, filet de pied) en arrière-plan, titre et grille d'informations dans
 *   le flux, l'un sous l'autre, dimensionnés d'après la longueur réelle des textes : rien ne peut se superposer ;
 * - un titre reste avec le bloc qui le suit : s'il ne tiendrait pas sur la même page, il passe à la suivante ;
 * - le sommaire n'impose pas de page : le premier chapitre commence à sa suite si la dernière page du sommaire
 *   est presque vide, sur une nouvelle page sinon ;
 * - colonnes des tableaux élargies jusqu'à leur plus long mot, somme égale à la largeur utile ;
 * - options de recomposition (sauts forcés, sommaire et espacements resserrés) utilisées par le contrôle du
 *   rendu quand il détecte une anomalie.
 */
import pdfmake from "pdfmake";
import type { Content, ContentTable, CustomTableLayout, TDocumentDefinitions } from "pdfmake/interfaces.js";
import { archSvg, asset, FONTS, LOGO_RATIO, logo, mm, PAGE, type Palette, palette, printable, scriptRuns, TYPE } from "./brand.js";
import { fitColumns } from "./columns.js";
import { coverLayout } from "./cover.js";
import { lineCount } from "./measure.js";
import { type Block, type Cell, cellOf, type DocModel, type Inline, plain, type RenderOptions, type Row } from "./model.js";
import type { DocumentIdentity } from "../../shared/settings.js";

type Pdf = typeof pdfmake & { virtualfs: { writeFileSync(name: string, data: Buffer): void } };
let configured = false;

/** Options de recomposition, fixées par le contrôle du rendu après une première composition. */
export interface PdfLayoutOptions {
  /** Blocs (index dans le modèle) précédés d'un saut de page forcé. */
  forcedBreaks?: number[];
  /** Sommaire resserré (sa dernière page était presque vide). */
  compactToc?: boolean;
  /** Espacements légèrement resserrés (dernière page presque vide). */
  compact?: boolean;
}

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

/** Retrait intérieur gauche et droit des cellules (points). */
const CELL_PADDING = 4;

/* ---------- Hauteurs estimées (titres solidaires du bloc suivant) ---------- */

/** Interligne effectif de pdfmake : hauteur de ligne de la police × interligne du document (mesuré : 1,885 × corps). */
const LINE = (size: number) => size * 1.366 * TYPE.lineHeight;
const SERIF_LINE = (size: number) => size * 1.3 * 1.1;

/**
 * Le sommaire laisserait-il une dernière page presque vide ? Hauteur estimée de ses entrées (mesurée : ligne de
 * texte, retrait de 2 points en haut et en bas de chaque ligne du tableau du sommaire, marge propre à l'entrée).
 * Resserré si sa dernière page n'en porterait que le cinquième, ou s'il la remplirait à quelques points près
 * (une ligne de trop basculerait seule sur une nouvelle page).
 */
function tocTailIsShort(blocks: Block[], contentWidth: number, innerHeight: number): boolean {
  let total = 22 * 1.3 * TYPE.lineHeight + 14;
  for (const b of blocks) {
    if (b.type !== "heading" || b.toc === false || b.level > 2) continue;
    const text = `${b.number ? `${b.number} ` : ""}${b.text}`;
    const lines = lineCount(printable(text), contentWidth - (b.level === 1 ? 30 : 44), TYPE.body, b.level === 1 ? "semibold" : "regular");
    total += (b.level === 1 ? 8 : 1) + 4 + lines * LINE(TYPE.body);
  }
  const pages = Math.ceil(total / innerHeight);
  const fill = total - (pages - 1) * innerHeight;
  return pages >= 2 && (fill < innerHeight * 0.2 || fill > innerHeight * 0.94);
}

/** Hauteur d'un titre, de sa première ligne à son contenu (marge du haut exclue). */
function headingHeight(block: Extract<Block, { type: "heading" }>, contentWidth: number): number {
  const text = `${block.number ? `${block.number} ` : ""}${block.text}`;
  if (block.level === 1) return lineCount(printable(text), contentWidth - 19, TYPE.h1, "serif") * SERIF_LINE(TYPE.h1) + 5 + 0.6 + 10;
  const size = block.level === 2 ? TYPE.h2 : TYPE.h3;
  return lineCount(printable(text), contentWidth, size, "semibold") * LINE(size) + 4;
}

/** Hauteur du début insécable d'un bloc : ce qui doit suivre un titre sur la même page. */
function startHeight(blocks: Block[], index: number, contentWidth: number, depth = 0): number {
  const block = blocks[index];
  if (!block) return 0;
  const lines = (text: string, width: number, size: number, max: number) => Math.min(lineCount(printable(text), width, size), max) * LINE(size);
  switch (block.type) {
    case "heading":
      return headingHeight(block, contentWidth) + (block.level === 1 ? 0 : block.level === 2 ? 10 : 7) + (depth < 2 ? startHeight(blocks, index + 1, contentWidth, depth + 1) : 0);
    case "paragraph":
      return lines(plain(block.content), contentWidth, block.tone === "small" ? TYPE.small : TYPE.body, 2);
    case "list":
      return block.items[0] ? lines(plain(block.items[0]), contentWidth - 24, TYPE.body, 2) : 0;
    case "requirement":
    case "note":
      return lines(plain(block.content), contentWidth - 17, TYPE.body, 2) + 12;
    case "callout":
      return LINE(TYPE.body) + 2 + lines(plain(block.content), contentWidth - 17, TYPE.body, 40) + 12;
    case "keyValues": {
      const rows = block.rows.length <= 16 ? block.rows : block.rows.slice(0, 2);
      return rows.reduce((h, [, v]) => h + Math.max(lineCount(printable(v), contentWidth * 0.68, TYPE.body), 1) * LINE(TYPE.body) + 6, 2);
    }
    case "table": {
      const size = block.dense ? TYPE.tableSmall : TYPE.table;
      const pad = (block.dense ? 2.5 : 3.5) * 2;
      const widths = fitColumns(block, { contentWidth, size, padding: CELL_PADDING * 2 }).map((w) => Math.max(w - CELL_PADDING * 2, 4));
      const rowHeight = (texts: string[]) => Math.max(...texts.map((t, i) => t.split("\n").reduce((n, line) => n + lineCount(printable(line), widths[i] ?? contentWidth, size), 0)), 1) * LINE(size) + pad + 1;
      const header = rowHeight(block.columns.map((c) => c.label));
      const first = block.rows[0] ? rowHeight(block.rows[0].cells.map((c) => cellOf(c).text)) : 0;
      return (block.caption ? LINE(TYPE.small) + 3 : 0) + 2 + header + first;
    }
    case "references":
      return LINE(TYPE.small);
    case "pageBreak":
      return 0;
  }
}

function tableNode(block: Extract<Block, { type: "table" }>, pal: Palette, contentWidth: number, compact: boolean): Content {
  const size = block.dense ? TYPE.tableSmall : TYPE.table;
  // Largeurs extérieures ajustées au plus long mot de chaque colonne ; pdfmake attend les largeurs intérieures.
  const widths = fitColumns(block, { contentWidth, size, padding: CELL_PADDING * 2 }).map((w) => Math.max(w - CELL_PADDING * 2, 4));
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
    // Cellules du modèle dans l'ordre logique : une cellule fusionnée sur n colonnes est suivie, dans la
    // grille pdfmake, de n − 1 cellules de réserve ; la cellule suivante du modèle vient après elles.
    row.cells.forEach((raw) => {
      if (cells.length >= block.columns.length) return;
      const index = cells.length;
      const cell: Cell = cellOf(raw);
      const strong = cell.bold || row.kind === "group" || row.kind === "subtotal" || row.kind === "total";
      const color = cell.tone === "muted" ? pal.muted : cell.tone === "primary" || (row.kind === "group" && index === 0) ? pal.primary : pal.ink;
      // Cellule sur plusieurs lignes : la première porte le libellé, les suivantes les précisions (en gris).
      const lines = cell.text.split("\n");
      const text = lines.flatMap((line, li) => {
        const nodes = textNodes([{ text: line, bold: strong && li === 0 }], pal).map((n) => (li === 0 ? n : { ...n, color: pal.muted, fontSize: size - 0.8 }));
        return li < lines.length - 1 ? [...nodes, { text: "\n" }] : nodes;
      });
      const span = Math.min(cell.colSpan && cell.colSpan > 1 ? cell.colSpan : 1, block.columns.length - index);
      cells.push({
        text,
        fontSize: row.kind === "note" ? size - 0.6 : size,
        color,
        alignment: cell.align ?? block.columns[index]?.align ?? "left",
        fillColor: row.kind === "group" ? pal.surfaceAlt : row.kind === "total" ? pal.surface : undefined,
        ...(span > 1 ? { colSpan: span } : {}),
      });
      for (let k = 1; k < span; k++) cells.push({});
    });
    while (cells.length < block.columns.length) cells.push({ text: "" });
    return cells;
  });
  const kinds = block.rows.map((r) => r.kind ?? "item");
  const pad = (block.dense ? 2.5 : 3.5) - (compact ? 0.5 : 0);
  const node: ContentTable = {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      keepWithHeaderRows: 1,
      widths,
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
      paddingLeft: () => CELL_PADDING,
      paddingRight: () => CELL_PADDING,
      paddingTop: () => pad,
      paddingBottom: () => pad,
    },
    margin: [0, 2, 0, compact ? 8 : 10],
  };
  const stack: Content[] = [];
  if (block.caption) stack.push({ text: printable(block.caption), fontSize: TYPE.small, color: pal.muted, margin: [0, 0, 0, 3] });
  stack.push(node);
  return { stack };
}

function blockNodes(block: Block, pal: Palette, contentWidth: number, compact: boolean): Content[] {
  const after = compact ? 4 : 5;
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
          margin: [0, block.level === 2 ? (compact ? 8 : 10) : compact ? 6 : 7, 0, 4],
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
          margin: [0, 0, 0, after],
        },
      ];
    case "list": {
      const items = block.items.map((item) => ({ text: textNodes(item, pal), alignment: "justify" as const, margin: [0, 0, 0, 2] as [number, number, number, number] }));
      if (block.ordered === "bullets") return [{ ul: items, markerColor: pal.secondary, margin: [10, 0, 0, after + 1] }];
      return [{ ol: items, type: block.ordered === "letters" ? "lower-alpha" : "decimal", separator: ")", markerColor: pal.primary, margin: [10, 0, 0, after + 1] } as unknown as Content];
    }
    case "requirement":
      return [
        {
          table: { widths: ["*"], body: [[{ text: textNodes(block.content, pal), alignment: "justify", color: pal.ink }]] },
          layout: bandLayout(pal.primary, pal.surfaceAlt),
          margin: [0, 2, 0, after + 2],
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
          margin: [0, 2, 0, after + 2],
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
          margin: [0, 2, 0, after + 3],
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
            paddingTop: () => (compact ? 2.5 : 3),
            paddingBottom: () => (compact ? 2.5 : 3),
            paddingLeft: () => 0,
          },
          // Une courte liste de valeurs (résultat d'un sous-détail, synthèse) n'est pas coupée entre deux pages.
          ...(block.rows.length <= 16 ? { unbreakable: true } : {}),
          margin: [0, 2, 0, after + 3],
        } as unknown as Content,
      ];
    case "table":
      return [tableNode(block, pal, contentWidth, compact)];
    case "references":
      return block.codes.length ? [{ text: [{ text: "Références : ", bold: true }, { text: printable(block.codes.join(", ")) }], fontSize: TYPE.small, color: pal.muted, margin: [0, 0, 0, after + 2] }] : [];
    case "pageBreak":
      return [{ text: "", pageBreak: "after" }];
  }
}

const dateFr = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/** Décor de la couverture (arrière-plan de la page 1) : logo, phase, arche, sigle, filet et pied. */
function coverBackground(doc: DocModel, pal: Palette, page: { width: number; height: number }): Content[] {
  const m = doc.meta;
  const g = coverLayout(m, page);
  const logoWidth = mm(46);
  return [
    { image: "logo", width: logoWidth, height: logoWidth / LOGO_RATIO.logo, absolutePosition: { x: g.side, y: mm(18) } },
    {
      columns: [{ width: page.width - g.side * 2, text: printable((m.project.phase ?? "Dossier de consultation").toUpperCase()), fontSize: 7, characterSpacing: 1.4, color: pal.muted, alignment: "right" }],
      absolutePosition: { x: g.side, y: mm(24) },
    } as unknown as Content,
    { svg: archSvg(pal.secondary, pal.primary, 1.1, pal.surfaceAlt), width: g.arch.width, height: g.arch.width * 1.2, absolutePosition: { x: g.arch.x, y: g.arch.y } },
    {
      columns: [{ width: g.arch.width * 0.3, text: printable(m.shortLabel), font: "Serif", fontSize: Math.min(26, (g.arch.width * 0.28) / (0.52 * Math.max(m.shortLabel.length, 1))), color: pal.primary, alignment: "center" }],
      absolutePosition: { x: g.arch.x + g.arch.width * 0.35, y: g.arch.y + g.arch.width * 1.2 * 0.68 },
    } as unknown as Content,
    {
      canvas: [{ type: "line", x1: 0, y1: 0, x2: page.width - g.side * 2, y2: 0, lineWidth: 1, lineColor: pal.primary }],
      absolutePosition: { x: g.side, y: page.height - mm(20) },
    },
    {
      columns: [
        { width: (page.width - g.side * 2) / 2, text: printable(m.footerText), fontSize: 7.2, color: pal.muted },
        { width: (page.width - g.side * 2) / 2, text: printable(`${m.project.reference}  |  ${dateFr.format(m.date)}`), fontSize: 7.2, color: pal.muted, alignment: "right" },
      ],
      absolutePosition: { x: g.side, y: page.height - mm(17) },
    } as unknown as Content,
  ];
}

/**
 * Titre et grille d'informations de la couverture, dans le flux de la page 1 : la grille suit le titre, quelle
 * que soit la longueur du titre ou de l'avertissement ; position et corps du titre calculés par coverLayout.
 */
function coverFlow(doc: DocModel, pal: Palette, page: { width: number; height: number }): Content[] {
  const m = doc.meta;
  const g = coverLayout(m, page);
  const half = Math.ceil(g.rows.length / 2);
  const columnWidth = (g.gridWidth - 24) / 2;
  const column = (items: Array<[string, string]>) => ({
    width: columnWidth,
    stack: items.map(([label, value]) => ({
      stack: [
        { text: printable(label.toUpperCase()), fontSize: 6.6, characterSpacing: 0.9, color: pal.faint },
        { text: textNodes([value], pal), fontSize: 9.2, bold: true, color: pal.ink, margin: [0, 1, 0, 0] },
      ],
      margin: [0, 0, 0, 9],
    })),
  });
  return [
    // Espace réservé au décor (logo, arche) : le bloc de titre commence à sa hauteur calculée.
    { canvas: [{ type: "rect", x: 0, y: 0, w: 1, h: 1, color: pal.page }], margin: [0, Math.max(g.top - mm(PAGE.marginTop) - 1, 0), 0, 0] } as unknown as Content,
    {
      columns: [
        {
          width: g.textWidth,
          stack: [
            { text: printable(m.typeLabel.toUpperCase()), fontSize: TYPE.coverKicker, characterSpacing: 1.6, color: pal.primary, bold: true, margin: [0, 0, 0, 10] },
            { text: textNodes([m.title], pal, "Serif"), font: "Serif", fontSize: g.titleSize, lineHeight: 1.05, color: pal.ink, margin: [0, 0, 0, 12] },
            { text: textNodes([m.project.name], pal), fontSize: TYPE.coverProject, color: pal.ink, margin: [0, 0, 0, 10] },
            rule(g.textWidth * 0.6, pal.secondary, 1, [0, 0, 0, 0]),
            ...(m.disclaimer ? [{ text: printable(m.disclaimer), fontSize: 7.6, color: pal.muted, margin: [0, 10, 0, 0] as [number, number, number, number] }] : []),
          ],
        },
      ],
      margin: [0, 0, 0, 22],
    } as unknown as Content,
    { columns: [column(g.rows.slice(0, half)), column(g.rows.slice(half))], columnGap: 24 } as unknown as Content,
  ];
}

export async function renderPdf(doc: DocModel, identity: DocumentIdentity, options: RenderOptions & { layout?: PdfLayoutOptions }): Promise<Buffer> {
  configure();
  const pal = palette(options.theme, identity);
  const layout = options.layout ?? {};
  const compact = Boolean(layout.compact);
  const forced = new Set(layout.forcedBreaks ?? []);
  const landscape = doc.meta.orientation === "landscape";
  const page = landscape ? { width: 841.89, height: 595.28 } : { width: 595.28, height: 841.89 };
  const side = mm(PAGE.marginSide);
  const contentWidth = page.width - side * 2;
  const m = doc.meta;

  // Couverture : décor en arrière-plan de la page 1, titre et informations dans le flux, puis saut de page.
  const cover = coverBackground(doc, pal, page);
  const night: Content = { canvas: [{ type: "rect", x: 0, y: 0, w: page.width, h: page.height, color: pal.page }] };
  const content: Content[] = [...coverFlow(doc, pal, page)];
  const innerHeight = page.height - mm(PAGE.marginTop) - mm(PAGE.marginBottom);
  // Sommaire resserré quand sa dernière page ne porterait que quelques entrées (ou à la demande du contrôle).
  const compactToc = Boolean(layout.compactToc) || (m.toc && tocTailIsShort(doc.blocks, contentWidth, innerHeight));
  if (m.toc) {
    content.push({
      toc: {
        title: { text: "Sommaire", font: "Serif", fontSize: 22, color: pal.primary, margin: [0, 0, 0, compactToc ? 8 : 14] },
        numberStyle: { color: pal.muted },
      },
      pageBreak: "before",
    } as unknown as Content);
  }
  // Racine de chaque bloc repérée par « b<index> » : sert à garder un titre avec le bloc qui le suit.
  const headings = new Set<number>();
  // Chapitres sur une nouvelle page, sauf si la page en cours est presque vide (fin de chapitre très courte).
  const softBreaks = new Set<number>();
  // Place à réserver sous chaque titre : sa hauteur et le début insécable du bloc qui le suit.
  const needs = new Map<number, number>();
  doc.blocks.forEach((block, i) => {
    if (block.type === "heading") needs.set(i, headingHeight(block, contentWidth) + startHeight(doc.blocks, i + 1, contentWidth) + 2);
  });
  doc.blocks.forEach((block, i) => {
    const nodes = blockNodes(block, pal, contentWidth, compact);
    if (nodes.length === 0) return;
    const first = nodes[0] as { id?: string; pageBreak?: string; margin?: number[]; tocMargin?: unknown; stack?: Array<{ columns?: Array<{ tocMargin?: unknown }> }> };
    if (i === 0) {
      // Premier bloc : nouvelle page après la couverture ; après le sommaire, la règle du sommaire décide.
      if (m.toc) {
        delete first.pageBreak;
        if (block.type === "heading" && block.level === 1) first.margin = [0, 18, 0, 0];
      } else first.pageBreak = "before";
    } else if (forced.has(i)) first.pageBreak = "before";
    else if (first.pageBreak === "before" && block.type === "heading" && block.level === 1) {
      delete first.pageBreak;
      softBreaks.add(i);
      first.margin = [0, 18, 0, 0];
    }
    first.id = `b${i}`;
    if (block.type === "heading") headings.add(i);
    if (compactToc && block.type === "heading") {
      const target = block.level === 1 ? first.stack?.[0]?.columns?.[1] : first;
      if (target && "tocMargin" in target) target.tocMargin = block.level === 1 ? [0, 3, 0, 0] : [14, 0, 0, 0];
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
    pageBreakBefore: (current, queries) => {
      const id = (current as { id?: string }).id;
      const index = id && /^b\d+$/.test(id) ? Number(id.slice(1)) : null;
      if (index === null) return false;
      const ratio = (current as { startPosition?: { verticalRatio?: number } }).startPosition?.verticalRatio ?? 0;
      // Premier chapitre après le sommaire : nouvelle page seulement si le sommaire occupe déjà sa page.
      if (index === 0 && m.toc && ratio > 0.3) return true;
      // Chapitre : nouvelle page dès que la page en cours est entamée au-delà du tiers.
      if (softBreaks.has(index) && ratio > 0.35) return true;
      if (!headings.has(index)) return false;
      // Un titre reste avec le bloc qui le suit : place restante insuffisante pour le titre et le début de ce
      // bloc, ou bloc suivant renvoyé à la page suivante : le titre passe à la page suivante.
      if ((1 - ratio) * innerHeight < (needs.get(index) ?? 0)) return true;
      const next = `b${index + 1}`;
      return index + 1 < doc.blocks.length && !queries.getFollowingNodesOnPage().some((n) => (n as { id?: string }).id === next);
    },
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
