/**
 * Optimise les photographies sources (assets-src/photos/*.jpg) :
 * AVIF + WebP en plusieurs largeurs dans public/images/photos/, et écrit
 * src/data/photo-manifest.json (dimensions réelles → srcset + anti-CLS).
 *
 *   npm run images:optimize
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const SRC = resolve(ROOT, "assets-src/photos");
const OUT = resolve(ROOT, "public/images/photos");
const MANIFEST = resolve(ROOT, "src/data/photo-manifest.json");

/** Images plein écran : jusqu'à 2560 px. Les autres : 1600 px suffisent. */
const FULL_BLEED = new Set(["terracotta-walls", "earth-walls", "arcade-shadow", "archive-shelf"]);
const BASE_WIDTHS = [640, 1024, 1600];

async function main() {
  if (!existsSync(SRC)) throw new Error("assets-src/photos introuvable. Lance d'abord : npm run images:fetch");
  mkdirSync(OUT, { recursive: true });
  const manifest: Record<string, { width: number; height: number; widths: number[] }> = {};

  for (const file of readdirSync(SRC).filter((f) => f.endsWith(".jpg")).sort()) {
    const name = basename(file, ".jpg");
    const input = sharp(resolve(SRC, file)).rotate();
    const { width = 0, height = 0 } = await input.metadata();
    const targets = [...BASE_WIDTHS, ...(FULL_BLEED.has(name) ? [2560] : [])].filter((w) => w <= width);
    if (!targets.includes(Math.min(width, targets.at(-1) ?? width))) targets.push(width);

    for (const w of targets) {
      const resized = input.clone().resize({ width: w, kernel: "lanczos3" }).withMetadata({ orientation: undefined });
      await resized.clone().avif({ quality: 52, effort: 5 }).toFile(resolve(OUT, `${name}-${w}.avif`));
      await resized.clone().webp({ quality: 78, effort: 5 }).toFile(resolve(OUT, `${name}-${w}.webp`));
    }
    const largest = targets.at(-1) ?? width;
    manifest[name] = { width: largest, height: Math.round((height * largest) / width), widths: targets };
    console.log(`  ✓ ${name}  ${targets.join(" / ")} px`);
  }

  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\n  src/data/photo-manifest.json — ${Object.keys(manifest).length} photos`);
}

main().catch((err: Error) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
