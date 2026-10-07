/**
 * Outil de production — version nuit de chaque photographie du site.
 *
 *   npm run images:night                     # toutes les photos sans version nuit
 *   npm run images:night -- rampart --force  # une photo, en écrasant l'existante
 *
 * Chaque version nuit est une ÉDITION de la photo jour (même cadrage) ; sa géométrie
 * est comparée à l'originale. Sources : assets-src/generated/night/<nom>.webp (qualité 95)
 * Ensuite : npm run images:optimize (produit <nom>-night-<largeur>.avif/webp).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { geometrySimilarity, verdictFor } from "./lib/hero-post.ts";
import { loadServerEnv } from "./lib/env.ts";
import { editImage, type Size } from "./lib/openai-images.ts";
import { NIGHT_EXTERIOR, NIGHT_INTERIOR, NIGHT_PHOTOS } from "./prompts/night.ts";

const ROOT = process.cwd();
const SRC = resolve(ROOT, "assets-src/photos");
const OUT = resolve(ROOT, "assets-src/generated/night");
const MANIFEST = join(OUT, "manifest.json");
const CONCURRENCY = 3;

/** Taille d'édition : côté long 2048 px, multiples de 16, ratio conservé. */
function editSize(width: number, height: number): { w: number; h: number } {
  const scale = 2048 / Math.max(width, height);
  const round16 = (v: number) => Math.max(16, Math.round((v * scale) / 16) * 16);
  return { w: round16(width), h: round16(height) };
}

async function nightOf(name: string, kind: "exterior" | "interior", apiKey: string, model?: string) {
  const source = join(SRC, `${name}.jpg`);
  if (!existsSync(source)) throw new Error(`${name} : source absente (npm run images:fetch)`);
  const meta = await sharp(source).metadata();
  const { w, h } = editSize(meta.width ?? 2048, meta.height ?? 2048);
  const input = join(OUT, `${name}-day.png`);
  await sharp(source).resize(w, h, { fit: "fill" }).png().toFile(input);

  const { images, model: used } = await editImage({
    apiKey,
    modelOverride: model,
    prompt: kind === "exterior" ? NIGHT_EXTERIOR : NIGHT_INTERIOR,
    imagePath: input,
    size: `${w}x${h}` as Size,
  });
  const [night] = images;
  if (!night) throw new Error(`${name} : aucune image reçue`);
  await sharp(night).webp({ quality: 95, effort: 6 }).toFile(join(OUT, `${name}.webp`));
  const aligned = await sharp(night).resize(w, h, { fit: "fill" }).png().toBuffer();
  const score = await geometrySimilarity(await sharp(input).png().toBuffer(), aligned);
  return { name, model: used, size: `${w}x${h}`, score: +score.toFixed(3), verdict: verdictFor(score) };
}

async function main() {
  const { apiKey, imageModel } = loadServerEnv(ROOT);
  mkdirSync(OUT, { recursive: true });
  const force = process.argv.includes("--force");
  const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const manifest: Record<string, unknown> = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};

  const queue = Object.entries(NIGHT_PHOTOS).filter(
    ([name]) => (only.length === 0 || only.includes(name)) && (force || !existsSync(join(OUT, `${name}.webp`))),
  );
  console.log(`→ ${queue.length} version(s) nuit à générer (${CONCURRENCY} en parallèle)…`);

  const failures: string[] = [];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const [name, kind] = item;
        try {
          const r = await nightOf(name, kind, apiKey, imageModel);
          manifest[name] = { ...r, kind, createdAt: new Date().toISOString() };
          writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
          console.log(`  ✓ ${name}  géométrie ${r.score} (${r.verdict})  ${r.model} ${r.size}`);
        } catch (err) {
          failures.push(name);
          console.error(`  ✗ ${name} : ${err instanceof Error ? err.message : err}`);
        }
      }
    }),
  );
  if (failures.length) {
    console.error(`\nÉchecs : ${failures.join(", ")} — relancer : npm run images:night -- ${failures.join(" ")}`);
    process.exit(1);
  }
  console.log("\nContrôle visuel obligatoire, puis : npm run images:optimize");
}

main().catch((err: Error) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
