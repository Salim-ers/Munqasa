/**
 * Outil de production — paire HERO JOUR / NUIT de MUNAQASA.
 *
 *   npm run hero                       # jour → nuit → finalisation (tout)
 *   npm run hero:day -- --count 3      # 3 propositions jour (la 1re est sélectionnée)
 *   npm run hero:night -- --from assets-src/generated/hero/hero-day-02.png --count 2
 *   npm run hero:finalize -- --crop-y 0.6
 *
 * Le site n'appelle jamais OpenAI : ce script produit des assets statiques
 * dans public/images/, générés une fois puis versionnés.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import sharp from "sharp";
import { loadServerEnv } from "./lib/env.ts";
import { editImage, generateImages } from "./lib/openai-images.ts";
import { finalizeHeroPair, geometrySimilarity, verdictFor } from "./lib/hero-post.ts";
import { HERO_DAY_PROMPT, HERO_NIGHT_PROMPT } from "./prompts/hero.ts";

const ROOT = process.cwd();
const SRC_DIR = resolve(ROOT, "assets-src/generated/hero");
const OUT_DIR = resolve(ROOT, "public/images");
const DAY = join(SRC_DIR, "hero-day.png");
const NIGHT = join(SRC_DIR, "hero-night.png");
const MANIFEST = join(SRC_DIR, "manifest.json");

const rel = (p: string) => relative(ROOT, p);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const count = Math.min(4, Math.max(1, Number(arg("count") ?? 1)));

const manifest: Record<string, unknown> = {};
function record(key: string, value: unknown) {
  manifest[key] = value;
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
}

async function stepDay() {
  const { apiKey, imageModel } = loadServerEnv(ROOT);
  console.log(`→ Génération JOUR (${count} proposition(s), modèle ${imageModel})… 1 à 2 min.`);
  const images = await generateImages({ apiKey, model: imageModel, prompt: HERO_DAY_PROMPT, n: count });
  const paths = images.map((buf, i) => {
    const p = join(SRC_DIR, `hero-day-${String(i + 1).padStart(2, "0")}.png`);
    writeFileSync(p, buf);
    return p;
  });
  copyFileSync(paths[0], DAY);
  record("day", { model: imageModel, prompt: HERO_DAY_PROMPT, candidates: paths.map(rel), selected: rel(paths[0]), createdAt: new Date().toISOString() });
  paths.forEach((p) => console.log(`  ✓ ${rel(p)}`));
  console.log(`  Sélection : ${rel(paths[0])} (change avec --from à l'étape nuit)`);
}

async function stepNight() {
  const { apiKey, imageModel } = loadServerEnv(ROOT);
  const from = arg("from");
  if (from) {
    if (!existsSync(from)) throw new Error(`Image jour introuvable : ${from}`);
    copyFileSync(resolve(from), DAY);
  }
  if (!existsSync(DAY)) throw new Error("Aucune image jour. Lance d'abord : npm run hero:day");

  console.log(`→ Génération NUIT à partir de ${rel(DAY)} (${count} essai(s))… 1 à 2 min.`);
  const images = await editImage({ apiKey, model: imageModel, prompt: HERO_NIGHT_PROMPT, imagePath: DAY, n: count });
  const dayBuf = await sharp(DAY).png().toBuffer();
  const { width, height } = await sharp(DAY).metadata();

  // Chaque essai est noté sur la conservation de la géométrie ; le meilleur est retenu.
  const scored = await Promise.all(
    images.map(async (buf, i) => {
      const p = join(SRC_DIR, `hero-night-${String(i + 1).padStart(2, "0")}.png`);
      writeFileSync(p, buf);
      const aligned = await sharp(buf).resize(width, height, { fit: "fill" }).png().toBuffer();
      return { path: p, score: await geometrySimilarity(dayBuf, aligned) };
    }),
  );
  scored.sort((a, b) => b.score - a.score);
  scored.forEach((s) => console.log(`  ${rel(s.path)}  géométrie ${s.score.toFixed(3)}  (${verdictFor(s.score)})`));
  copyFileSync(scored[0].path, NIGHT);
  record("night", { model: imageModel, prompt: HERO_NIGHT_PROMPT, source: rel(DAY), input_fidelity: "high", candidates: scored.map((s) => ({ file: rel(s.path), score: +s.score.toFixed(3) })), selected: rel(scored[0].path), createdAt: new Date().toISOString() });
  console.log(`  Sélection : ${rel(scored[0].path)}`);
}

async function stepFinalize() {
  if (!existsSync(DAY) || !existsSync(NIGHT)) throw new Error("Il faut hero-day.png et hero-night.png dans assets-src/generated/hero/.");
  const cropY = Number(arg("crop-y") ?? 0.5);
  console.log(`→ Finalisation (recadrage 16:9 identique, crop-y ${cropY})…`);
  const r = await finalizeHeroPair({ dayPng: DAY, nightPng: NIGHT, outDir: OUT_DIR, reportDir: SRC_DIR, cropY });
  r.files.forEach((f) => console.log(`  ✓ ${rel(f)}`));
  console.log(`\n  Similarité géométrique jour/nuit : ${r.similarity.toFixed(3)} → ${r.verdict.toUpperCase()}`);
  console.log(`  Planche de contrôle : ${rel(r.comparePath)}`);
  if (r.verdict !== "identique") {
    console.log("  ⚠ Le bâtiment a peut-être bougé. Ouvre la planche, puis relance : npm run hero:night -- --count 3");
  }
  record("finalize", { cropY, similarity: +r.similarity.toFixed(3), verdict: r.verdict, files: r.files.map(rel) });
}

async function main() {
  mkdirSync(SRC_DIR, { recursive: true });
  if (existsSync(MANIFEST)) Object.assign(manifest, JSON.parse(readFileSync(MANIFEST, "utf8")));

  const cmd = process.argv[2] ?? "all";
  if (cmd === "day") return stepDay();
  if (cmd === "night") return stepNight();
  if (cmd === "finalize") return stepFinalize();
  if (cmd === "all") { await stepDay(); await stepNight(); return stepFinalize(); }
  throw new Error(`Commande inconnue : ${cmd} (day | night | finalize | all)`);
}

main().catch((err: Error) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
