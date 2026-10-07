/**
 * Optimise les photographies : AVIF + WebP en plusieurs largeurs dans
 * public/images/photos/, et écrit src/data/photo-manifest.json.
 *
 *   npm run images:optimize
 *
 * Jour   : assets-src/photos/<nom>.jpg                → <nom>-<largeur>.{avif,webp}
 * Nuit   : assets-src/generated/night/<nom>.webp (si présent)
 *                                                      → <nom>-night-<largeur>.{avif,webp}
 * La version nuit est recadrée aux dimensions exactes de la version jour :
 * la bascule jour / nuit est parfaitement alignée.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const SRC = resolve(ROOT, "assets-src/photos");
const NIGHT = resolve(ROOT, "assets-src/generated/night");
const OUT = resolve(ROOT, "public/images/photos");
const MANIFEST = resolve(ROOT, "src/data/photo-manifest.json");

/** Images plein écran : jusqu'à 2560 px. Les autres : 1600 px suffisent. */
const FULL_BLEED = new Set(["terracotta-walls", "earth-walls", "arcade-shadow", "archive-shelf"]);
const BASE_WIDTHS = [640, 1024, 1600];

type Image = ReturnType<typeof sharp>;

async function encode(input: Image, file: string) {
  await input.clone().avif({ quality: 52, effort: 5 }).toFile(`${file}.avif`);
  await input.clone().webp({ quality: 78, effort: 5 }).toFile(`${file}.webp`);
}

async function main() {
  if (!existsSync(SRC)) throw new Error("assets-src/photos introuvable. Lance d'abord : npm run images:fetch");
  mkdirSync(OUT, { recursive: true });
  const manifest: Record<string, { width: number; height: number; widths: number[]; night: boolean }> = {};

  for (const file of readdirSync(SRC).filter((f) => f.endsWith(".jpg")).sort()) {
    const name = basename(file, ".jpg");
    const day = sharp(resolve(SRC, file)).rotate();
    const { width = 0, height = 0 } = await day.metadata();
    const targets = [...BASE_WIDTHS, ...(FULL_BLEED.has(name) ? [2560] : [])].filter((w) => w <= width);
    const nightSrc = resolve(NIGHT, `${name}.webp`);
    const night = existsSync(nightSrc);

    for (const w of targets) {
      const h = Math.round((height * w) / width);
      await encode(day.clone().resize({ width: w, kernel: "lanczos3" }), resolve(OUT, `${name}-${w}`));
      if (night) {
        await encode(sharp(nightSrc).resize(w, h, { fit: "fill", kernel: "lanczos3" }), resolve(OUT, `${name}-night-${w}`));
      }
    }
    const largest = targets.at(-1) ?? width;
    manifest[name] = { width: largest, height: Math.round((height * largest) / width), widths: targets, night };
    console.log(`  ✓ ${name}  ${targets.join(" / ")} px${night ? "  + nuit" : ""}`);
  }

  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\n  src/data/photo-manifest.json — ${Object.keys(manifest).length} photos`);
}

main().catch((err: Error) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
