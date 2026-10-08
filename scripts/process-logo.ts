/**
 * Prépare les déclinaisons du logo Talab Solutions à partir du fichier fourni.
 *
 *   npm run logo
 *
 * Aucune géométrie n'est redessinée. Le fichier fourni a déjà un fond
 * transparent : ses aplats (opacité 99 %) sont simplement ramenés à 100 %,
 * puis le logo est recadré. La version « négative » remplace uniquement le
 * noir par l'ivoire pour les fonds sombres — bronze, palmier et olivier
 * gardent leurs couleurs.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const SRC = resolve(ROOT, "assets-src/brand/talab-logo-source.png");
const LOGOS = resolve(ROOT, "public/logos");
const PUBLIC = resolve(ROOT, "public");

const IVORY = [245, 241, 233] as const;
const NIGHT = "#0B0C0D";

/** Zones mesurées sur le fichier source (887 × 887). */
const SYMBOL = { top: 110, bottom: 530 }; // bâtiment, palmier, olivier
const WORDMARK = { top: 528, bottom: 786 }; // TALAB, SOLUTIONS et le filet
const BUILDING = { left: 318, right: 672, top: 120, bottom: 520 }; // favicon : le bâtiment seul
/** Palmier et olivier : leurs ombres sombres ne sont pas de l'encre, elles ne s'inversent pas. */
const VEGETATION = { left: 666, bottom: 530 };
/** Opacité des aplats dans le fichier fourni (252–253 / 255). */
const SOLID_ALPHA = 253;

interface Rgba {
  data: Buffer;
  width: number;
  height: number;
}

async function load(): Promise<Rgba> {
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let q = 3; q < data.length; q += 4) data[q] = Math.min(255, Math.round((data[q]! * 255) / SOLID_ALPHA));
  return { data, width: info.width, height: info.height };
}

/** Noir du logo (sombre et neutre) remplacé par l'ivoire ; tout le reste est intact. */
function reverse(img: Rgba): Rgba {
  const out = Buffer.from(img.data);
  for (let q = 0; q < out.length; q += 4) {
    if (out[q + 3] === 0) continue;
    const p = q / 4;
    if (p % img.width >= VEGETATION.left && Math.floor(p / img.width) < VEGETATION.bottom) continue;
    const r = out[q]!, g = out[q + 1]!, b = out[q + 2]!;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    if (chroma < 26 && luma < 96) {
      out[q] = IVORY[0];
      out[q + 1] = IVORY[1];
      out[q + 2] = IVORY[2];
    }
  }
  return { ...img, data: out };
}

const raw = (img: Rgba) => sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } });

async function crop(img: Rgba, box: { left?: number; right?: number; top: number; bottom: number }): Promise<Buffer> {
  const left = box.left ?? 0;
  const right = box.right ?? img.width;
  const cut = await raw(img)
    .extract({ left, top: box.top, width: right - left, height: box.bottom - box.top })
    .png()
    .toBuffer();
  return sharp(cut).trim({ threshold: 1 }).png().toBuffer();
}

async function save(buf: Buffer, name: string, width: number) {
  const base = resolve(LOGOS, name);
  const img = sharp(buf).resize({ width, withoutEnlargement: true });
  await img.clone().png({ compressionLevel: 9 }).toFile(`${base}.png`);
  await img.clone().webp({ quality: 92, alphaQuality: 100 }).toFile(`${base}.webp`);
  const meta = await sharp(`${base}.png`).metadata();
  console.log(`  ✓ public/logos/${name}.{png,webp}  ${meta.width}×${meta.height}`);
}

/** ICO contenant des PNG (format accepté par tous les navigateurs actuels). */
function packIco(pngs: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6 + pngs.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach((p, i) => {
    const e = 6 + i * 16;
    header.writeUInt8(p.size >= 256 ? 0 : p.size, e);
    header.writeUInt8(p.size >= 256 ? 0 : p.size, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(p.data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += p.data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

/** Image centrée dans un carré, avec marge, sur fond optionnel. */
async function square(image: Buffer, size: number, pad: number, background?: string) {
  const inner = Math.round(size * (1 - pad * 2));
  const icon = await sharp(image)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: background ?? { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: icon, gravity: "center" }])
    .png()
    .toBuffer();
}

async function main() {
  mkdirSync(LOGOS, { recursive: true });
  const positive = await load();
  const negative = reverse(positive);

  console.log("→ Logo Talab Solutions");
  await save(await crop(positive, { top: 0, bottom: positive.height }), "talab-logo", 1200);
  await save(await crop(negative, { top: 0, bottom: negative.height }), "talab-logo-reversed", 1200);

  const symbol = await crop(positive, SYMBOL);
  const symbolNeg = await crop(negative, SYMBOL);
  await save(symbol, "talab-symbol", 900);
  await save(symbolNeg, "talab-symbol-reversed", 900);

  const wordmark = await crop(positive, WORDMARK);
  const wordmarkNeg = await crop(negative, WORDMARK);
  await save(wordmark, "talab-wordmark", 1200);
  await save(wordmarkNeg, "talab-wordmark-reversed", 1200);

  // Déclinaisons légères pour l'en-tête et le loader (affichage ≤ 160 px de haut).
  await save(symbol, "talab-symbol-sm", 320);
  await save(symbolNeg, "talab-symbol-reversed-sm", 320);
  await save(wordmark, "talab-wordmark-sm", 560);
  await save(wordmarkNeg, "talab-wordmark-reversed-sm", 560);

  console.log("→ Favicons (le bâtiment seul, lisible en petit)");
  const building = await crop(positive, BUILDING);
  const icoParts = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await square(building, size, 0.02) })));
  writeFileSync(resolve(PUBLIC, "favicon.ico"), packIco(icoParts));
  writeFileSync(resolve(PUBLIC, "favicon-32.png"), await square(building, 32, 0.02));
  writeFileSync(resolve(PUBLIC, "apple-touch-icon.png"), await square(symbol, 180, 0.12, "#F5F1E9"));
  writeFileSync(resolve(PUBLIC, "icon-192.png"), await square(symbol, 192, 0.12, "#F5F1E9"));
  writeFileSync(resolve(PUBLIC, "icon-512.png"), await square(symbol, 512, 0.12, "#F5F1E9"));
  console.log("  ✓ favicon.ico, favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png");

  console.log("→ Image Open Graph");
  const W = 1200, H = 630;
  const lockup = await sharp(await crop(negative, { top: 0, bottom: negative.height })).resize({ height: 440 }).toBuffer();
  const frame = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="48" y="48" width="${W - 96}" height="${H - 96}" fill="none" stroke="#B88D5E" stroke-opacity=".35"/>` +
      `</svg>`,
  );
  await sharp({ create: { width: W, height: H, channels: 3, background: NIGHT } })
    .composite([{ input: frame }, { input: lockup, gravity: "center" }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(resolve(PUBLIC, "og-image.jpg"));
  console.log("  ✓ og-image.jpg 1200×630");
}

main().catch((err: Error) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
