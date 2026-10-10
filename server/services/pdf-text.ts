/**
 * Lecture de la couche texte d'un PDF (pdf.js, sans navigateur) : chaque mot avec sa position, sa taille
 * et son orientation, page par page. Sert à exploiter les plans vectoriels (cotes, cartouches, surfaces)
 * sans les deviner sur l'image, et à vérifier le contenu des PDF produits.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/** Tables de caractères et polices standard de pdf.js : nécessaires pour lire les PDF issus de la CAO. */
const PDFJS_DIR = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
const CMAPS = `${join(PDFJS_DIR, "cmaps")}/`;
const STANDARD_FONTS = `${join(PDFJS_DIR, "standard_fonts")}/`;

export interface TextItem {
  text: string;
  /** Position du point d'origine, en points depuis le coin haut gauche de la page. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Orientation du texte en degrés (0 : horizontal, 90 : vertical). */
  angle: number;
}

export interface PdfPageText {
  page: number;
  width: number;
  height: number;
  items: TextItem[];
}

export async function readPdfText(data: Uint8Array, options: { maxPages?: number } = {}): Promise<PdfPageText[]> {
  const task = getDocument({ data: new Uint8Array(data), useSystemFonts: false, disableFontFace: true, verbosity: 0, cMapUrl: CMAPS, cMapPacked: true, standardFontDataUrl: STANDARD_FONTS });
  const pdf = await task.promise;
  try {
    const pages: PdfPageText[] = [];
    const count = Math.min(pdf.numPages, options.maxPages ?? pdf.numPages);
    for (let n = 1; n <= count; n++) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: TextItem[] = [];
      for (const raw of content.items) {
        if (!("str" in raw) || !raw.str.trim()) continue;
        const [a, b, , , e, f] = raw.transform as number[];
        // Passage du repère PDF (origine en bas à gauche) au repère de la page affichée.
        const [x, y] = viewport.convertToViewportPoint(e!, f!);
        items.push({ text: raw.str, x: x!, y: y!, width: raw.width, height: raw.height, angle: Math.round((Math.atan2(b!, a!) * 180) / Math.PI) });
      }
      pages.push({ page: n, width: viewport.width, height: viewport.height, items });
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

/** Texte brut de chaque page, dans l'ordre de lecture approximatif (lignes de haut en bas). */
export async function pdfPlainText(data: Uint8Array): Promise<string[]> {
  const pages = await readPdfText(data);
  return pages.map((p) =>
    [...p.items]
      .sort((u, v) => Math.round(u.y) - Math.round(v.y) || u.x - v.x)
      .map((i) => i.text)
      .join(" "),
  );
}
