/**
 * Contrôle automatique du rendu, après chaque génération :
 * - PDF : lecture des coordonnées réelles de chaque texte (pdf.js) pour détecter les dépassements de marge,
 *   les textes qui se chevauchent, les pages presque vides, les titres laissés seuls en bas de page, les
 *   en-têtes et pieds de page absents, une numérotation « Page n sur N » fausse, une couverture incomplète,
 *   et tout texte du modèle absent du PDF (cellule ou ligne tronquée) ;
 * - Word : structure du document (en-têtes de tableau répétés, lignes insécables, titres liés au paragraphe
 *   suivant, en-tête et pied paginés, largeur des tableaux dans la page, aucune hauteur de ligne imposée) ;
 * - Excel : mise en page d'impression (A4, ajusté à la largeur, lignes de titre répétées, pied paginé),
 *   en-têtes de colonnes jamais coupés au milieu d'un mot, textes longs renvoyés à la ligne.
 * Une anomalie n'est jamais masquée : elle est corrigée par une nouvelle composition ou remontée telle quelle.
 */
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { mm, PAGE, printable } from "./brand.js";
import { textWidth } from "./measure.js";
import { cellOf, type DocModel, plain } from "./model.js";
import { readPdfText } from "../services/pdf-text.js";

export type LayoutIssueKind =
  | "marge"
  | "chevauchement"
  | "page_presque_vide"
  | "titre_isole"
  | "en_tete"
  | "pied_de_page"
  | "numerotation"
  | "couverture"
  | "contenu_manquant"
  | "structure";

export const LAYOUT_ISSUE_LABELS: Record<LayoutIssueKind, string> = {
  marge: "Texte hors des marges",
  chevauchement: "Textes superposés",
  page_presque_vide: "Page presque vide",
  titre_isole: "Titre seul en bas de page",
  en_tete: "En-tête absent",
  pied_de_page: "Pied de page absent",
  numerotation: "Numérotation des pages incohérente",
  couverture: "Couverture incomplète",
  contenu_manquant: "Texte du document absent du rendu",
  structure: "Structure du fichier",
};

export interface LayoutIssue {
  kind: LayoutIssueKind;
  page: number | null;
  detail: string;
  /** Titre concerné (titre isolé), pour forcer un saut de page avant lui à la composition suivante. */
  heading?: string;
}

export interface LayoutReport {
  format: "pdf" | "docx" | "xlsx";
  pages: number | null;
  issues: LayoutIssue[];
  /** Pages occupées par le sommaire (PDF). */
  tocPages: number[];
  /** Compositions nécessaires (PDF recomposé après une anomalie). */
  attempts?: number;
}

interface Box {
  text: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  size: number;
}

/** Texte comparable : espaces retirés, apostrophes et guillemets unifiés (la police peut les restituer autrement). */
const norm = (text: string) =>
  printable(text)
    .normalize("NFKC")
    .replace(/[’‘`´ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, "");
const excerpt = (text: string) => (text.length > 60 ? `${text.slice(0, 57)}…` : text);

/** Textes que le rendu doit contenir : titres, débuts de paragraphes, cellules, valeurs clés. */
function expectedTexts(model: DocModel): string[] {
  const out: string[] = [];
  const add = (text: string | null | undefined, max = 40) => {
    const t = (text ?? "").split("\n")[0]!.trim();
    if (t.length >= 2 && !/[؀-ۿ]/.test(t)) out.push(t.slice(0, max));
  };
  for (const block of model.blocks) {
    if (block.type === "heading") add(`${block.number ? `${block.number} ` : ""}${block.text}`);
    else if (block.type === "paragraph" || block.type === "requirement" || block.type === "note") add(plain(block.content));
    else if (block.type === "callout") add(block.title);
    else if (block.type === "keyValues") for (const [k, v] of block.rows) {
      add(k);
      add(v);
    }
    else if (block.type === "table") {
      for (const c of block.columns) add(c.label, 20);
      for (const row of block.rows) for (const cell of row.cells) add(cellOf(cell).text, 30);
    } else if (block.type === "list") for (const item of block.items) add(plain(item));
  }
  return out;
}

function boxesOf(page: { items: Array<{ text: string; x: number; y: number; width: number; height: number; angle: number }> }): Box[] {
  return page.items
    .filter((i) => i.text.trim() && Math.abs(i.angle) < 1)
    .map((i) => ({ text: i.text, x0: i.x, x1: i.x + i.width, y0: i.y - i.height * 0.78, y1: i.y + i.height * 0.22, size: i.height }));
}

export async function checkPdfLayout(pdf: Uint8Array, model: DocModel): Promise<LayoutReport> {
  const pages = await readPdfText(pdf);
  const issues: LayoutIssue[] = [];
  const side = mm(PAGE.marginSide);
  const top = mm(PAGE.marginTop);
  const bottom = mm(PAGE.marginBottom);
  const count = pages.length;
  const firstHeading = model.blocks.find((b) => b.type === "heading");
  const firstHeadingText = firstHeading?.type === "heading" ? norm(firstHeading.text).slice(0, 24) : null;
  let chapterPage: number | null = null;

  for (const page of pages) {
    const n = page.page;
    const { width: W, height: H } = page;
    const boxes = boxesOf(page);
    // Marges : tout texte reste dans la largeur utile (les pieds et en-têtes compris).
    for (const b of boxes) {
      if (b.x0 < side - 2 || b.x1 > W - side + 2 || b.y0 < 0 || b.y1 > H) {
        issues.push({ kind: "marge", page: n, detail: `« ${excerpt(b.text)} » dépasse la marge (${Math.round(b.x0)} à ${Math.round(b.x1)} pt sur ${Math.round(W)}).` });
      }
    }
    // Chevauchements : deux textes dont les boîtes se recouvrent nettement.
    const sorted = [...boxes].sort((a, b) => a.y0 - b.y0);
    let overlaps = 0;
    for (let i = 0; i < sorted.length && overlaps < 5; i++) {
      const a = sorted[i]!;
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j]!;
        if (b.y0 >= a.y1) break;
        const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        if (ox <= 1.5 || oy <= 1.5) continue;
        const small = Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0)) || 1;
        if ((ox * oy) / small > 0.3) {
          issues.push({ kind: "chevauchement", page: n, detail: `« ${excerpt(a.text)} » et « ${excerpt(b.text)} » se superposent.` });
          overlaps++;
          if (overlaps >= 5) break;
        }
      }
    }
    if (n === 1) {
      // Couverture : titre présent, pas de pagination.
      const text = norm(boxes.map((b) => b.text).join(" "));
      const title = norm(model.meta.title).slice(0, 30);
      if (!text.includes(title)) issues.push({ kind: "couverture", page: 1, detail: "Le titre du document n’apparaît pas entier sur la couverture." });
      if (/Page1sur/.test(text)) issues.push({ kind: "couverture", page: 1, detail: "La couverture porte une pagination." });
      continue;
    }
    const body = boxes.filter((b) => b.y0 >= top - 8 && b.y1 <= H - bottom + 8);
    const header = boxes.filter((b) => b.y1 < top - 4);
    const footer = boxes.filter((b) => b.y0 > H - bottom + 4);
    if (chapterPage === null && firstHeadingText && norm(body.filter((b) => b.size >= 11).map((b) => b.text).join("")).includes(firstHeadingText)) chapterPage = n;
    const words = body.reduce((s, b) => s + b.text.split(/\s+/).filter(Boolean).length, 0);
    if (n === count ? words < 8 : words < 25) issues.push({ kind: "page_presque_vide", page: n, detail: `${words} mot(s) seulement dans le corps de la page.` });
    // Titre isolé : la dernière ligne du corps est un titre (taille de titre), suivi d'aucun contenu sur la page.
    if (body.length && n < count) {
      const lastY = Math.max(...body.map((b) => b.y1));
      const lastLine = body.filter((b) => Math.abs(b.y1 - lastY) < 2);
      if (lastLine.every((b) => b.size >= 11)) {
        // Le titre peut tenir sur deux lignes : on remonte les lignes de même taille qui le précèdent.
        const headingBoxes = body.filter((b) => b.size >= 11 && b.y1 >= lastY - 3 * Math.max(...lastLine.map((l) => l.size)));
        const heading = headingBoxes.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0).map((b) => b.text).join(" ").replace(/\s+/g, " ").trim();
        issues.push({ kind: "titre_isole", page: n, detail: `« ${excerpt(heading)} » termine la page sans le contenu qui le suit.`, heading });
      }
    }
    if (header.length === 0) issues.push({ kind: "en_tete", page: n, detail: "Aucun en-tête en haut de page." });
    const footerText = footer.map((b) => b.text).join(" ");
    if (footer.length === 0) issues.push({ kind: "pied_de_page", page: n, detail: "Aucun pied de page." });
    else if (!new RegExp(`Page\\s*${n}\\s*sur\\s*${count}(?!\\d)`).test(footerText)) issues.push({ kind: "numerotation", page: n, detail: `Pied de page « ${excerpt(footerText)} » au lieu de « Page ${n} sur ${count} ».` });
  }

  // Contenu complet : chaque texte du modèle se retrouve dans le rendu.
  const all = norm(pages.map((p) => p.items.map((i) => i.text).join(" ")).join(" "));
  const missing = expectedTexts(model).filter((t) => !all.includes(norm(t)));
  for (const t of missing.slice(0, 8)) issues.push({ kind: "contenu_manquant", page: null, detail: `« ${excerpt(t)} » ne figure pas dans le PDF.` });
  if (missing.length > 8) issues.push({ kind: "contenu_manquant", page: null, detail: `${missing.length - 8} autre(s) texte(s) absent(s).` });

  const tocPages = model.meta.toc && chapterPage ? Array.from({ length: Math.max(chapterPage - 2, 0) }, (_, i) => i + 2) : [];
  return { format: "pdf", pages: count, issues, tocPages };
}

/* ---------- Word ---------- */

/** Structure d'un document Word : propriétés qui garantissent sa mise en page dans Word et LibreOffice. */
export async function checkDocxStructure(docx: Uint8Array, model: DocModel): Promise<LayoutReport> {
  const zip = await JSZip.loadAsync(docx);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const issues: LayoutIssue[] = [];
  const push = (detail: string) => issues.push({ kind: "structure", page: null, detail });
  const landscape = model.meta.orientation === "landscape";
  const contentTwips = Math.round(((landscape ? 841.89 : 595.28) - 2 * mm(PAGE.marginSide)) * 20);

  const tables = xml.split("<w:tbl>").slice(1);
  tables.forEach((table, i) => {
    const grid = [...table.matchAll(/<w:gridCol w:w="(\d+)"/g)].reduce((s, m) => s + Number(m[1]), 0);
    if (grid > contentTwips + 20) push(`Tableau ${i + 1} plus large que la page (${grid} sur ${contentTwips} twips).`);
    if (/<w:trHeight[^>]*w:hRule="exact"/.test(table)) push(`Tableau ${i + 1} : hauteur de ligne imposée, le texte risque d’être coupé.`);
  });
  const dataTables = model.blocks.filter((b) => b.type === "table").length;
  const headerRows = (xml.match(/<w:tblHeader\/>/g) ?? []).length;
  if (headerRows < dataTables) push(`${dataTables - headerRows} tableau(x) sans ligne d’en-tête répétée sur chaque page.`);
  const rows = (xml.match(/<w:tr[ >]/g) ?? []).length;
  const cantSplit = (xml.match(/<w:cantSplit\/>/g) ?? []).length;
  if (cantSplit < rows - 1) push(`${rows - cantSplit} ligne(s) de tableau pouvant être coupée(s) entre deux pages.`);
  const styles = (await zip.file("word/styles.xml")?.async("string")) ?? "";
  for (const id of ["Heading1", "Heading2", "Heading3"]) {
    const style = new RegExp(`<w:style[^>]*w:styleId="${id}"[\\s\\S]*?</w:style>`).exec(styles)?.[0] ?? "";
    if (!style.includes("<w:keepNext/>")) push(`Style ${id} sans lien avec le paragraphe suivant (titre isolé possible).`);
  }
  if (!/<w:headerReference[^>]*w:type="default"/.test(xml)) push("Aucun en-tête de page.");
  if (!/<w:footerReference[^>]*w:type="default"/.test(xml)) push("Aucun pied de page.");
  const footers = await Promise.all(Object.keys(zip.files).filter((f) => /^word\/footer\d+\.xml$/.test(f)).map((f) => zip.file(f)!.async("string")));
  if (!footers.some((f) => /PAGE/.test(f) && /NUMPAGES/.test(f))) push("Pied de page sans numérotation « Page n sur N ».");
  // Couverture : contenu en flux (pas de cadre ni de tableau flottant susceptibles de se superposer).
  if (/<w:tblpPr/.test(xml)) push("Tableau flottant en couverture : risque de superposition.");
  return { format: "docx", pages: null, issues, tocPages: [] };
}

/* ---------- Excel ---------- */

/** Mise en page d'impression et lisibilité des feuilles d'un classeur. */
export async function checkXlsxStructure(xlsx: Uint8Array): Promise<LayoutReport> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(xlsx) as unknown as ArrayBuffer);
  const issues: LayoutIssue[] = [];
  const push = (detail: string) => issues.push({ kind: "structure", page: null, detail });
  for (const sheet of workbook.worksheets) {
    const setup = sheet.pageSetup;
    if (setup.paperSize !== 9) push(`Feuille « ${sheet.name} » : format d’impression autre que A4.`);
    if (!setup.fitToPage || setup.fitToWidth !== 1) push(`Feuille « ${sheet.name} » : impression non ajustée à la largeur d’une page.`);
    if (!setup.printTitlesRow) push(`Feuille « ${sheet.name} » : ligne d’en-tête non répétée à l’impression.`);
    if (!sheet.headerFooter?.oddFooter?.includes("&P")) push(`Feuille « ${sheet.name} » : pied de page sans numéro de page.`);
    // En-têtes de colonnes : la colonne est assez large pour leur plus long mot.
    const headerRow = Number(setup.printTitlesRow?.split(":")[0] ?? 0);
    if (headerRow) {
      sheet.getRow(headerRow).eachCell((cell, col) => {
        const label = String(cell.value ?? "");
        const width = sheet.getColumn(col).width ?? 10;
        // Largeur d'une colonne Excel : environ 7 pixels (5,25 points) par unité à la police par défaut.
        const longestWord = Math.max(0, ...label.split(/\s+/).map((w) => textWidth(w, 9, "semibold")));
        if (longestWord > width * 5.25 + 2) push(`Feuille « ${sheet.name} » : colonne « ${label} » trop étroite pour son en-tête.`);
      });
    }
    // Textes longs : renvoyés à la ligne plutôt que débordant sur les cellules voisines.
    let unwrapped = 0;
    sheet.eachRow((row) =>
      row.eachCell((cell) => {
        if (typeof cell.value === "string" && cell.value.length > 60 && !cell.alignment?.wrapText && !cell.isMerged) unwrapped++;
      }),
    );
    if (unwrapped) push(`Feuille « ${sheet.name} » : ${unwrapped} texte(s) long(s) sans renvoi à la ligne.`);
  }
  return { format: "xlsx", pages: null, issues, tocPages: [] };
}
