/**
 * Outil de production — visuels éditoriaux générés (facultatifs).
 *
 *   npm run images:generate -- dossier
 *   npm run images:generate -- analyse --count 2
 *   npm run images:generate -- all
 *
 * Le hero jour / nuit a son propre outil : npm run hero.
 * Sources PNG : assets-src/generated/<nom>/ — sorties WebP : public/images/generated/.
 * Le site n'appelle jamais OpenAI : ces fichiers sont générés une fois, puis servis tels quels.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import sharp from "sharp";
import { loadServerEnv } from "./lib/env.ts";
import { generateImages } from "./lib/openai-images.ts";
import { EDITORIAL } from "./prompts/editorial.ts";

const ROOT = process.cwd();
const OUT = resolve(ROOT, "public/images/generated");
const WIDTHS = [1024, 1600, 2048];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function produce(key: string) {
  const entry = EDITORIAL[key];
  if (!entry) throw new Error(`Visuel inconnu : ${key} (${Object.keys(EDITORIAL).join(" | ")} | all)`);
  const { apiKey, imageModel } = loadServerEnv(ROOT);
  const count = Math.min(4, Math.max(1, Number(arg("count") ?? 1)));
  const srcDir = resolve(ROOT, "assets-src/generated", entry.name);
  mkdirSync(srcDir, { recursive: true });
  mkdirSync(OUT, { recursive: true });

  console.log(`→ ${entry.name} (${count} proposition(s))… 1 à 3 min.`);
  const { images, model, size } = await generateImages({ apiKey, modelOverride: imageModel, prompt: entry.prompt, n: count });

  for (const [i, buf] of images.entries()) {
    const suffix = images.length > 1 ? `-${String(i + 1).padStart(2, "0")}` : "";
    const png = join(srcDir, `${entry.name}${suffix}.png`);
    writeFileSync(png, buf);
    const { width = 0 } = await sharp(buf).metadata();
    for (const w of WIDTHS.filter((w) => w <= Math.max(width, 1024))) {
      await sharp(buf)
        .resize({ width: w, kernel: "lanczos3", withoutEnlargement: true })
        .webp({ quality: 80, effort: 6 })
        .toFile(join(OUT, `${entry.name}${suffix}-${w}.webp`));
    }
    console.log(`  ✓ ${relative(ROOT, png)}  (${model}, ${size})`);
  }
  writeFileSync(join(srcDir, "manifest.json"), JSON.stringify({ model, size, prompt: entry.prompt, createdAt: new Date().toISOString() }, null, 2));
  console.log("  Vérifie chaque image (humains, texte, logos, géométrie) avant de l'utiliser sur le site.");
}

async function main() {
  const which = process.argv[2];
  if (!which) throw new Error(`Précise un visuel : ${Object.keys(EDITORIAL).join(" | ")} | all`);
  for (const key of which === "all" ? Object.keys(EDITORIAL) : [which]) await produce(key);
}

main().catch((err: Error) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
