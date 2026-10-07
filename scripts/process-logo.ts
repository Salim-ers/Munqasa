/**
 * Prépare les déclinaisons du logo MUNAQASA à partir du fichier fourni.
 *
 *   npm run logo
 *
 * Aucune géométrie n'est redessinée : le fond blanc est converti en
 * transparence (color-to-alpha, bords anti-crénelés préservés), puis le
 * fichier est simplement recadré. La version « négative » remplace le noir
 * par l'ivoire pour les fonds sombres — sable et terracotta restent intacts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const SRC = resolve(ROOT, "assets-src/brand/munaqasa-logo-source.png");
const LOGOS = resolve(ROOT, "public/logos");
const PUBLIC = resolve(ROOT, "public");

const IVORY = [245, 241, 233] as const;
const NIGHT = "#080A0B";

/** Bandes verticales mesurées sur le fichier source (1254 × 1254). */
const SYMBOL_ROWS = [100, 820] as const;
const WORDMARK_ROWS = [835, 1030] as const;

/** Les trois encres du logo, mesurées sur le fichier source. */
const INKS = {
  sand: [184, 141, 94],
  terracotta: [160, 65, 30],
  ink: [36, 36, 36],
} as const;
type InkName = keyof typeof INKS;
const WHITE = [255, 255, 255] as const;

interface Rgba { data: Buffer; width: number; height: number; inks: (InkName | null)[] }

/**
 * Détourage par projection : chaque pixel est lu comme un mélange entre le
 * blanc du fond et l'encre la plus proche. Les aplats restent opaques (couleur
 * d'origine conservée) ; seuls les bords anti-crénelés deviennent
 * partiellement transparents, avec la couleur pure de leur encre.
 */
async function extract(): Promise<Rgba> {
  const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  const inks: (InkName | null)[] = new Array(info.width * info.height).fill(null);
  const FLOOR = 0.04; // bruit de compression autour du blanc
  const OPAQUE = 0.94;

  for (let p = 0, q = 0, i = 0; p < data.length; p += 3, q += 4, i++) {
    const c = [data[p], data[p + 1], data[p + 2]];
    let best: { name: InkName; t: number; err: number } | null = null;
    for (const name of Object.keys(INKS) as InkName[]) {
      const f = INKS[name];
      const d = [WHITE[0] - f[0], WHITE[1] - f[1], WHITE[2] - f[2]];
      const v = [WHITE[0] - c[0], WHITE[1] - c[1], WHITE[2] - c[2]];
      const t = Math.max(0, Math.min(1.2, (v[0] * d[0] + v[1] * d[1] + v[2] * d[2]) / (d[0] ** 2 + d[1] ** 2 + d[2] ** 2)));
      const err = Math.hypot(v[0] - t * d[0], v[1] - t * d[1], v[2] - t * d[2]);
      if (!best || err < best.err) best = { name, t, err };
    }
    if (!best) continue;
    const a = Math.max(0, Math.min(1, (best.t - FLOOR) / (OPAQUE - FLOOR)));
    if (a === 0) continue;
    const f = INKS[best.name];
    const solid = a >= 1;
    out[q] = solid ? c[0] : f[0];
    out[q + 1] = solid ? c[1] : f[1];
    out[q + 2] = solid ? c[2] : f[2];
    out[q + 3] = Math.round(a * 255);
    inks[i] = best.name;
  }
  return { data: out, width: info.width, height: info.height, inks };
}

/** Version négative : le noir du logo devient ivoire, le reste est intact. */
function reverse(img: Rgba): Rgba {
  const out = Buffer.from(img.data);
  img.inks.forEach((ink, i) => {
    if (ink !== "ink") return;
    out[i * 4] = IVORY[0];
    out[i * 4 + 1] = IVORY[1];
    out[i * 4 + 2] = IVORY[2];
  });
  return { ...img, data: out };
}

const raw = (img: Rgba) => sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } });

async function band(img: Rgba, [top, bottom]: readonly [number, number]): Promise<Buffer> {
  return raw(img)
    .extract({ left: 0, top, width: img.width, height: bottom - top })
    .png()
    .toBuffer()
    .then((b) => sharp(b).trim({ threshold: 1 }).png().toBuffer());
}

async function save(buf: Buffer, name: string, width: number) {
  const base = resolve(LOGOS, name);
  await sharp(buf).resize({ width, withoutEnlargement: true }).png({ compressionLevel: 9 }).toFile(`${base}.png`);
  await sharp(buf).resize({ width, withoutEnlargement: true }).webp({ quality: 92, alphaQuality: 100 }).toFile(`${base}.webp`);
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

/** Symbole centré dans un carré, avec marge, sur fond optionnel. */
async function square(symbol: Buffer, size: number, pad: number, background?: string) {
  const inner = Math.round(size * (1 - pad * 2));
  const icon = await sharp(symbol).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: background ?? { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: icon, gravity: "center" }])
    .png()
    .toBuffer();
}

async function main() {
  mkdirSync(LOGOS, { recursive: true });
  const positive = await extract();
  const negative = reverse(positive);

  console.log("→ Logo MUNAQASA");
  const lockup = await raw(positive).png().toBuffer().then((b) => sharp(b).trim({ threshold: 1 }).png().toBuffer());
  const lockupNeg = await raw(negative).png().toBuffer().then((b) => sharp(b).trim({ threshold: 1 }).png().toBuffer());
  await save(lockup, "munaqasa-logo", 1200);
  await save(lockupNeg, "munaqasa-logo-reversed", 1200);

  const symbol = await band(positive, SYMBOL_ROWS);
  const symbolNeg = await band(negative, SYMBOL_ROWS);
  await save(symbol, "munaqasa-symbol", 640);
  await save(symbolNeg, "munaqasa-symbol-reversed", 640);

  const wordmark = await band(positive, WORDMARK_ROWS);
  const wordmarkNeg = await band(negative, WORDMARK_ROWS);
  await save(wordmark, "munaqasa-wordmark", 1200);
  await save(wordmarkNeg, "munaqasa-wordmark-reversed", 1200);

  // Déclinaisons légères pour l'en-tête et le loader (affichage ≤ 120 px).
  await save(symbol, "munaqasa-symbol-sm", 160);
  await save(symbolNeg, "munaqasa-symbol-reversed-sm", 160);
  await save(wordmark, "munaqasa-wordmark-sm", 480);
  await save(wordmarkNeg, "munaqasa-wordmark-reversed-sm", 480);

  console.log("→ Favicons");
  const icoParts = await Promise.all(
    [16, 32, 48].map(async (size) => ({ size, data: await square(symbol, size, 0.04) })),
  );
  writeFileSync(resolve(PUBLIC, "favicon.ico"), packIco(icoParts));
  writeFileSync(resolve(PUBLIC, "favicon-32.png"), await square(symbol, 32, 0.04));
  writeFileSync(resolve(PUBLIC, "apple-touch-icon.png"), await square(symbol, 180, 0.14, "#F5F1E9"));
  writeFileSync(resolve(PUBLIC, "icon-192.png"), await square(symbol, 192, 0.14, "#F5F1E9"));
  writeFileSync(resolve(PUBLIC, "icon-512.png"), await square(symbol, 512, 0.14, "#F5F1E9"));
  console.log("  ✓ favicon.ico, favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png");

  console.log("→ Image Open Graph");
  const W = 1200, H = 630;
  const og = await sharp(lockupNeg).resize({ height: 430 }).toBuffer();
  const rule = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="48" y="48" width="${W - 96}" height="${H - 96}" fill="none" stroke="#B88D5E" stroke-opacity=".35"/>` +
      `</svg>`,
  );
  await sharp({ create: { width: W, height: H, channels: 3, background: NIGHT } })
    .composite([{ input: rule }, { input: og, gravity: "center" }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(resolve(PUBLIC, "og-image.jpg"));
  console.log("  ✓ og-image.jpg 1200×630");
}

main().catch((err: Error) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
