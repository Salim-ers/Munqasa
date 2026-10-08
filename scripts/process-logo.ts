/**
 * Publie le logo Talab Solutions à partir des fichiers fournis et en tire favicons, icônes et image de partage.
 *
 *   npm run logo
 *
 * Dix fichiers fournis (assets-src/brand/), jamais redessinés, déjà détourés, même lettrage jour et nuit :
 *  - JOUR : logo noir et terracotta (talab-day-*.png) ;
 *  - NUIT : logo noir, blanc et or (talab-night-*.png).
 * Chacun est publié tel quel en PNG, et en WebP quasi sans perte pour l'affichage : contours et lettrage intacts
 * (écart imperceptible, ≈ 50 dB), fichiers plus légers que le PNG.
 */
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const BRAND = resolve(ROOT, "assets-src/brand");
const LOGOS = resolve(ROOT, "public/logos");
const PUBLIC = resolve(ROOT, "public");

const IVORY = "#F5F1E9";
const NIGHT_BG = "#0B0C0D";

const LIGHTS = ["day", "night"] as const;
/**
 * logo : logo complet (données structurées) · symbol : loader, filigranes · symbol-sm : en-tête
 * wordmark : pied de page · wordmark-sm : en-tête, loader
 */
const VARIANTS = ["logo", "symbol", "symbol-sm", "wordmark", "wordmark-sm"] as const;

/** Favicon : le bâtiment seul, sans la longue ligne de sol ni le palmier (zone du symbole, 900 × 569). */
const BUILDING = { left: 152, top: 0, width: 514, height: 569 };

const master = (name: string) => resolve(BRAND, `${name}.png`);

async function publish(name: string) {
  copyFileSync(master(name), resolve(LOGOS, `${name}.png`));
  await sharp(master(name))
    .webp({ nearLossless: true, quality: 60, effort: 6 })
    .toFile(resolve(LOGOS, `${name}.webp`));
  const meta = await sharp(master(name)).metadata();
  console.log(`  ✓ public/logos/${name}.{png,webp}  ${meta.width}×${meta.height}`);
}

async function building(light: (typeof LIGHTS)[number]): Promise<Buffer> {
  const cut = await sharp(master(`talab-${light}-symbol`)).extract(BUILDING).png().toBuffer();
  return sharp(cut).trim({ threshold: 1 }).png().toBuffer();
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
async function square(image: Buffer | string, size: number, pad: number, background?: string) {
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

  for (const light of LIGHTS) {
    console.log(light === "day" ? "→ Jour : logo noir et terracotta" : "→ Nuit : logo noir, blanc et or");
    for (const variant of VARIANTS) await publish(`talab-${light}-${variant}`);
  }

  console.log("→ Favicons : le bâtiment, version jour (onglets clairs) et version or (onglets sombres)");
  const dayBuilding = await building("day");
  const nightBuilding = await building("night");
  const icoParts = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await square(dayBuilding, size, 0.02) })));
  writeFileSync(resolve(PUBLIC, "favicon.ico"), packIco(icoParts));
  writeFileSync(resolve(PUBLIC, "favicon-32.png"), await square(dayBuilding, 32, 0.02));
  writeFileSync(resolve(PUBLIC, "favicon-dark-32.png"), await square(nightBuilding, 32, 0.02));
  console.log("  ✓ favicon.ico (16, 32, 48), favicon-32.png, favicon-dark-32.png");

  console.log("→ Icônes d'application (fond ivoire, symbole de jour)");
  const daySymbol = master("talab-day-symbol");
  writeFileSync(resolve(PUBLIC, "apple-touch-icon.png"), await square(daySymbol, 180, 0.1, IVORY));
  writeFileSync(resolve(PUBLIC, "icon-192.png"), await square(daySymbol, 192, 0.1, IVORY));
  writeFileSync(resolve(PUBLIC, "icon-512.png"), await square(daySymbol, 512, 0.1, IVORY));
  // Icône « maskable » : le symbole tient dans la zone sûre (cercle de 80 % du côté).
  writeFileSync(resolve(PUBLIC, "icon-maskable-512.png"), await square(daySymbol, 512, 0.2, IVORY));
  console.log("  ✓ apple-touch-icon.png, icon-192.png, icon-512.png, icon-maskable-512.png");

  console.log("→ Image Open Graph (logo or sur fond nuit)");
  const W = 1200, H = 630;
  const lockup = await sharp(master("talab-night-logo")).resize({ height: 480 }).toBuffer();
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
