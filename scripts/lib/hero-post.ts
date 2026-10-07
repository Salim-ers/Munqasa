/**
 * Post-traitement de la paire jour/nuit :
 *  1. aligne la nuit sur les dimensions exactes du jour ;
 *  2. applique le MÊME recadrage 16:9 aux deux images ;
 *  3. exporte les WebP finaux (2560 / 1920 / 1280 px) ;
 *  4. mesure la similarité géométrique (contours) et produit une planche de contrôle.
 */
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export const HERO_WIDTHS = [2560, 1920, 1280] as const;

export interface FinalizeOptions {
  dayPng: string;
  nightPng: string;
  outDir: string;      // ex. public/images
  reportDir: string;   // ex. assets-src/generated/hero
  /** Position verticale du recadrage 16:9 : 0 = haut, 0.5 = centre, 1 = bas. */
  cropY?: number;
}

export interface FinalizeResult {
  files: string[];
  similarity: number;
  verdict: "identique" | "à vérifier" | "différent";
  comparePath: string;
}

async function cropBox(path: string, cropY: number) {
  const { width = 0, height = 0 } = await sharp(path).metadata();
  const h = Math.min(height, Math.round((width * 9) / 16));
  const top = Math.round((height - h) * Math.min(1, Math.max(0, cropY)));
  return { width, height, box: { left: 0, top, width, height: h } };
}

/** Carte de contours (Sobel) normalisée, en niveaux de gris basse résolution. */
async function edgeMap(input: Buffer, w = 384, h = 216): Promise<Float64Array> {
  const px = await sharp(input)
    .resize(w, h, { fit: "fill" })
    .grayscale()
    .normalise()            // neutralise la différence d'exposition jour/nuit
    .blur(0.8)
    .raw()
    .toBuffer();
  const out = new Float64Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -px[i - w - 1] + px[i - w + 1] - 2 * px[i - 1] + 2 * px[i + 1] - px[i + w - 1] + px[i + w + 1];
      const gy =
        -px[i - w - 1] - 2 * px[i - w] - px[i - w + 1] + px[i + w - 1] + 2 * px[i + w] + px[i + w + 1];
      out[i] = Math.hypot(gx, gy);
    }
  }
  return out;
}

function pearson(a: Float64Array, b: Float64Array): number {
  let ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) { ma += a[i]; mb += b[i]; }
  ma /= a.length; mb /= b.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  return num / Math.sqrt(da * db || 1);
}

export async function geometrySimilarity(a: Buffer, b: Buffer): Promise<number> {
  const [ea, eb] = await Promise.all([edgeMap(a), edgeMap(b)]);
  return pearson(ea, eb);
}

export function verdictFor(score: number): FinalizeResult["verdict"] {
  if (score >= 0.7) return "identique";
  if (score >= 0.5) return "à vérifier";
  return "différent";
}

export async function finalizeHeroPair(o: FinalizeOptions): Promise<FinalizeResult> {
  mkdirSync(o.outDir, { recursive: true });
  mkdirSync(o.reportDir, { recursive: true });

  const day = await cropBox(o.dayPng, o.cropY ?? 0.5);

  // La nuit est forcée aux dimensions exactes du jour avant le même recadrage.
  const nightMeta = await sharp(o.nightPng).metadata();
  if (nightMeta.width !== day.width || nightMeta.height !== day.height) {
    console.warn(
      `⚠ Dimensions nuit ${nightMeta.width}×${nightMeta.height} ≠ jour ${day.width}×${day.height} — alignement forcé.`,
    );
  }
  const nightAligned = await sharp(o.nightPng).resize(day.width, day.height, { fit: "fill" }).png().toBuffer();

  const dayCrop = await sharp(o.dayPng).extract(day.box).png().toBuffer();
  const nightCrop = await sharp(nightAligned).extract(day.box).png().toBuffer();

  const files: string[] = [];
  for (const [name, buf] of [["hero-day", dayCrop], ["hero-night", nightCrop]] as const) {
    for (const w of HERO_WIDTHS) {
      const file = join(o.outDir, w === 2560 ? `${name}.webp` : `${name}-${w}.webp`);
      await sharp(buf)
        .resize({ width: w, height: Math.round((w * 9) / 16), fit: "fill", kernel: "lanczos3" })
        .sharpen({ sigma: w === 2560 ? 0.6 : 0.4 })
        .webp({ quality: w === 2560 ? 82 : 80, effort: 6, smartSubsample: true })
        .toFile(file);
      files.push(file);
    }
  }

  const similarity = await geometrySimilarity(dayCrop, nightCrop);

  // Planche de contrôle : jour | nuit, puis vue fendue (moitié jour / moitié nuit).
  const W = 1280, H = 720;
  const [d, n] = await Promise.all(
    [dayCrop, nightCrop].map((b) => sharp(b).resize(W, H, { fit: "fill" }).png().toBuffer()),
  );
  const nightRightHalf = await sharp(n).extract({ left: W / 2, top: 0, width: W / 2, height: H }).toBuffer();
  const split = await sharp(d).composite([{ input: nightRightHalf, left: W / 2, top: 0 }]).png().toBuffer();
  const seam = Buffer.from(`<svg width="2" height="${H}"><rect width="2" height="${H}" fill="#B6401B"/></svg>`);

  const comparePath = join(o.reportDir, "hero-compare.webp");
  mkdirSync(dirname(comparePath), { recursive: true });
  await sharp({ create: { width: W * 2, height: H * 2, channels: 3, background: "#080A0B" } })
    .composite([
      { input: d, left: 0, top: 0 },
      { input: n, left: W, top: 0 },
      { input: split, left: W / 2, top: H },
      { input: seam, left: W, top: H },
    ])
    .webp({ quality: 80 })
    .toFile(comparePath);

  return { files, similarity, verdict: verdictFor(similarity), comparePath };
}
