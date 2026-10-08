/**
 * Prépare les déclinaisons du logo Talab Solutions à partir des fichiers fournis.
 *
 *   npm run logo
 *
 * Deux sources, jamais redessinées, déjà détourées (fond transparent), même géométrie :
 *  - JOUR : logo noir et terracotta (assets-src/brand/talab-logo-day-source.png) ;
 *  - NUIT : logo noir, blanc et or (assets-src/brand/talab-logo-night-source.png).
 * Les aplats des fichiers fournis sont à 99 % d'opacité : ils sont ramenés à 100 %.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const LOGOS = resolve(ROOT, "public/logos");
const PUBLIC = resolve(ROOT, "public");

const IVORY = "#F5F1E9";
const NIGHT_BG = "#0B0C0D";
/** Opacité des aplats dans les fichiers fournis (253 / 255). */
const SOLID_ALPHA = 253;

interface Box {
  left?: number;
  right?: number;
  top: number;
  bottom: number;
}

/** Zones mesurées sur les fichiers source (1254 × 1254, même mise en page jour et nuit). */
const SOURCES = {
  day: { file: "talab-logo-day-source.png", symbol: { top: 0, bottom: 844 }, wordmark: { top: 844, bottom: 1254 } },
  night: { file: "talab-logo-night-source.png", symbol: { top: 0, bottom: 843 }, wordmark: { top: 843, bottom: 1254 } },
} as const;
/** Favicon : le bâtiment seul, sans la longue ligne de sol ni le palmier. */
const BUILDING: Box = { left: 250, right: 940, top: 85, bottom: 847 };

interface Rgba {
  data: Buffer;
  width: number;
  height: number;
}

async function load(file: string): Promise<Rgba> {
  const { data, info } = await sharp(resolve(ROOT, "assets-src/brand", file))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let q = 3; q < data.length; q += 4) data[q] = Math.min(255, Math.round((data[q]! * 255) / SOLID_ALPHA));
  return { data, width: info.width, height: info.height };
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

/** Image centrée dans un carré, avec marge (fraction du côté), sur fond optionnel. */
async function square(image: Buffer, size: number, pad: number, background?: string) {
  const inner = Math.round(size * (1 - pad * 2));
  const icon = await sharp(image)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: "lanczos3" })
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: background ?? { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: icon, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  mkdirSync(LOGOS, { recursive: true });
  const day = await load(SOURCES.day.file);
  const night = await load(SOURCES.night.file);

  console.log("→ Jour : logo noir et terracotta");
  const daySymbol = await crop(day, SOURCES.day.symbol);
  const dayWordmark = await crop(day, SOURCES.day.wordmark);
  await save(await whole(day), "talab-day-logo", 1254);
  await save(daySymbol, "talab-day-symbol", 900); // loader
  await save(daySymbol, "talab-day-symbol-sm", 360); // en-tête
  await save(dayWordmark, "talab-day-wordmark", 1254); // pied de page
  await save(dayWordmark, "talab-day-wordmark-sm", 640); // en-tête, loader

  console.log("→ Nuit : logo noir, blanc et or");
  const nightSymbol = await crop(night, SOURCES.night.symbol);
  const nightWordmark = await crop(night, SOURCES.night.wordmark);
  await save(await whole(night), "talab-night-logo", 1254);
  await save(nightSymbol, "talab-night-symbol", 900); // loader, filigranes
  await save(nightSymbol, "talab-night-symbol-sm", 360); // en-tête
  await save(nightWordmark, "talab-night-wordmark", 1254); // pied de page
  await save(nightWordmark, "talab-night-wordmark-sm", 640); // en-tête, loader

  console.log("→ Favicons : le bâtiment, version jour (onglets clairs) et version or (onglets sombres)");
  const dayBuilding = await crop(day, BUILDING);
  const nightBuilding = await crop(night, BUILDING);
  const icoParts = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await square(dayBuilding, size, 0.02) })));
  writeFileSync(resolve(PUBLIC, "favicon.ico"), packIco(icoParts));
  writeFileSync(resolve(PUBLIC, "favicon-32.png"), await square(dayBuilding, 32, 0.02));
  writeFileSync(resolve(PUBLIC, "favicon-dark-32.png"), await square(nightBuilding, 32, 0.02));
  console.log("  ✓ favicon.ico (16, 32, 48), favicon-32.png, favicon-dark-32.png");

  console.log("→ Icônes d'application (fond ivoire, symbole de jour)");
  writeFileSync(resolve(PUBLIC, "apple-touch-icon.png"), await square(daySymbol, 180, 0.1, IVORY));
  writeFileSync(resolve(PUBLIC, "icon-192.png"), await square(daySymbol, 192, 0.1, IVORY));
  writeFileSync(resolve(PUBLIC, "icon-512.png"), await square(daySymbol, 512, 0.1, IVORY));
  // Icône « maskable » : le symbole tient dans la zone sûre (cercle de 80 % du côté).
  writeFileSync(resolve(PUBLIC, "icon-maskable-512.png"), await square(daySymbol, 512, 0.2, IVORY));
  console.log("  ✓ apple-touch-icon.png, icon-192.png, icon-512.png, icon-maskable-512.png");

  console.log("→ Image Open Graph (logo or sur fond nuit)");
  const W = 1200, H = 630;
  const lockup = await sharp(await whole(night)).resize({ height: 480 }).toBuffer();
  const frame = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="36" y="36" width="${W - 72}" height="${H - 72}" fill="none" stroke="#C9A06A" stroke-opacity=".4"/>` +
      `</svg>`,
  );
  await sharp({ create: { width: W, height: H, channels: 3, background: NIGHT_BG } })
    .composite([{ input: frame }, { input: lockup, gravity: "center" }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(resolve(PUBLIC, "og-image.jpg"));
  console.log("  ✓ og-image.jpg 1200×630");
}

main().catch((err: Error) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
