/**
 * Prépare les déclinaisons du logo Talab Solutions à partir des fichiers fournis.
 *
 *   npm run logo
 *
 * Deux sources, jamais redessinées, déjà détourées (fond transparent) :
 *  - JOUR : le logo terracotta (assets-src/brand/talab-logo-terracotta-source.png),
 *    utilisé tel quel ;
 *  - NUIT : le logo bronze (assets-src/brand/talab-logo-source.png), en version
 *    « blanche » : seul le noir passe en ivoire, le bronze (or) et la végétation
 *    gardent leurs couleurs.
 * Les aplats des fichiers fournis sont à 99 % d'opacité : ils sont ramenés à 100 %.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const LOGOS = resolve(ROOT, "public/logos");
const PUBLIC = resolve(ROOT, "public");

const IVORY = [245, 241, 233] as const;
const NIGHT = "#0B0C0D";
/** Opacité des aplats dans les fichiers fournis (252–253 / 255). */
const SOLID_ALPHA = 253;

interface Box {
  left?: number;
  right?: number;
  top: number;
  bottom: number;
}

/** Zones mesurées sur chaque fichier source. */
const DAY = {
  src: resolve(ROOT, "assets-src/brand/talab-logo-terracotta-source.png"), // 1701 × 925
  symbol: { top: 0, bottom: 614 }, // bâtiment, palmier, olivier
  wordmark: { top: 612, bottom: 925 }, // TALAB, SOLUTIONS et le filet
  building: { left: 588, right: 1166, top: 0, bottom: 612 }, // favicon : le bâtiment seul, sans la ligne de sol
};

const NIGHT_SRC = {
  src: resolve(ROOT, "assets-src/brand/talab-logo-source.png"), // 887 × 887
  symbol: { top: 110, bottom: 530 },
  wordmark: { top: 528, bottom: 786 },
  /** Palmier et olivier : leurs ombres sombres ne sont pas de l'encre, elles ne s'inversent pas. */
  vegetation: { left: 666, bottom: 530 },
};

interface Rgba {
  data: Buffer;
  width: number;
  height: number;
}

async function load(src: string): Promise<Rgba> {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let q = 3; q < data.length; q += 4) data[q] = Math.min(255, Math.round((data[q]! * 255) / SOLID_ALPHA));
  return { data, width: info.width, height: info.height };
}

/** Version blanche : le noir du logo (sombre et neutre) devient ivoire ; tout le reste est intact. */
function whiten(img: Rgba, keep: { left: number; bottom: number }): Rgba {
  const out = Buffer.from(img.data);
  for (let q = 0; q < out.length; q += 4) {
    if (out[q + 3] === 0) continue;
    const p = q / 4;
    if (p % img.width >= keep.left && Math.floor(p / img.width) < keep.bottom) continue;
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

async function crop(img: Rgba, box: Box): Promise<Buffer> {
  const left = box.left ?? 0;
  const right = box.right ?? img.width;
  const cut = await raw(img)
    .extract({ left, top: box.top, width: right - left, height: box.bottom - box.top })
    .png()
    .toBuffer();
  return sharp(cut).trim({ threshold: 1 }).png().toBuffer();
}

const whole = (img: Rgba) => crop(img, { top: 0, bottom: img.height });

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

  console.log("→ Jour : logo terracotta");
  const day = await load(DAY.src);
  const daySymbol = await crop(day, DAY.symbol);
  const dayWordmark = await crop(day, DAY.wordmark);
  await save(await whole(day), "talab-day-logo", 1701);
  await save(dayWordmark, "talab-day-wordmark", 1400); // pied de page
  await save(daySymbol, "talab-day-symbol-sm", 360); // en-tête
  await save(dayWordmark, "talab-day-wordmark-sm", 640); // en-tête

  console.log("→ Nuit : logo blanc et or");
  const night = whiten(await load(NIGHT_SRC.src), NIGHT_SRC.vegetation);
  const nightSymbol = await crop(night, NIGHT_SRC.symbol);
  const nightWordmark = await crop(night, NIGHT_SRC.wordmark);
  await save(await whole(night), "talab-logo-reversed", 1200);
  await save(nightSymbol, "talab-symbol-reversed", 900); // loader, filigranes
  await save(nightWordmark, "talab-wordmark-reversed", 1200); // pied de page
  await save(nightSymbol, "talab-symbol-reversed-sm", 320); // en-tête
  await save(nightWordmark, "talab-wordmark-reversed-sm", 560); // en-tête, loader

  console.log("→ Favicons et icônes (logo de jour, le bâtiment seul pour les petites tailles)");
  const building = await crop(day, DAY.building);
  const icoParts = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await square(building, size, 0.02) })));
  writeFileSync(resolve(PUBLIC, "favicon.ico"), packIco(icoParts));
  writeFileSync(resolve(PUBLIC, "favicon-32.png"), await square(building, 32, 0.02));
  writeFileSync(resolve(PUBLIC, "apple-touch-icon.png"), await square(daySymbol, 180, 0.12, "#F5F1E9"));
  writeFileSync(resolve(PUBLIC, "icon-192.png"), await square(daySymbol, 192, 0.12, "#F5F1E9"));
  writeFileSync(resolve(PUBLIC, "icon-512.png"), await square(daySymbol, 512, 0.12, "#F5F1E9"));
  console.log("  ✓ favicon.ico, favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png");

  console.log("→ Image Open Graph (logo blanc et or sur fond nuit)");
  const W = 1200, H = 630;
  const lockup = await sharp(await whole(night)).resize({ height: 440 }).toBuffer();
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
