/**
 * Télécharge les photographies sélectionnées (licence Unsplash) dans
 * assets-src/photos/ et écrit image-sources.json (crédits + usage).
 *
 *   npm run images:fetch
 *
 * Les fichiers sont ensuite optimisés par `npm run images:optimize`.
 * Le site ne dépend d'aucun hotlink : tout est servi depuis public/images.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const OUT = resolve(ROOT, "assets-src/photos");

/** Sélection vérifiée à l'œil : aucun humain, aucun logo, aucun texte lisible. */
const SELECTION: { file: string; id: string; usage: string }[] = [
  { file: "arch-niche", id: "77Ps4Ub14tA", usage: "Services (veille), en-tête de la page Services" },
  { file: "terracotta-walls", id: "rc8WJZTABTw", usage: "Accueil, grande photographie" },
  { file: "earth-walls", id: "OKOqDFzY1tU", usage: "En-tête de la page Expertise" },
  { file: "lattice-facade", id: "SAbSp5NgntU", usage: "Services (analyse), page Expertise" },
  { file: "arcade-shadow", id: "vreNlt4ICMY", usage: "Services (coordination), en-tête de la page Méthode" },
  { file: "white-arch", id: "Be20u4KnmMY", usage: "Services (préparation à la soumission)" },
  { file: "sand-tower", id: "BE8cBDYX2iU", usage: "Services (suivi)" },
  { file: "museum-entrance", id: "CTLdlgaQYa0", usage: "Page Expertise" },
  { file: "rampart", id: "A3N6NC7MYT4", usage: "Services (contrôle avant dépôt)" },
  { file: "archive-shelf", id: "AxA3YVYdv80", usage: "Services (dossier administratif)" },
  { file: "papers-table", id: "qUpdelkd30U", usage: "En-tête de la page Confier un dossier" },
  { file: "drawing-table", id: "OspMUpCBeqQ", usage: "Services (offre technique)" },
];

interface UnsplashPhoto {
  id: string;
  width: number;
  height: number;
  premium?: boolean;
  plus?: boolean;
  urls: { raw: string };
  links: { html: string };
  user: { name: string; links: { html: string } };
}

async function get(url: string): Promise<Response> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url).catch(() => null);
    if (res?.ok) return res;
    await new Promise((r) => setTimeout(r, attempt * 1000));
  }
  throw new Error(`Téléchargement impossible : ${url}`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const sources = [];
  for (const item of SELECTION) {
    const meta = (await (await get(`https://unsplash.com/napi/photos/${item.id}`)).json()) as UnsplashPhoto;
    if (meta.premium || meta.plus) throw new Error(`${item.id} n'est pas sous licence Unsplash libre.`);
    const file = resolve(OUT, `${item.file}.jpg`);
    if (!existsSync(file)) {
      const width = Math.min(3200, meta.width);
      const res = await get(`${meta.urls.raw}&w=${width}&q=90&fm=jpg`);
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    }
    console.log(`  ✓ ${item.file}.jpg — ${meta.user.name}`);
    sources.push({
      file: `public/images/photos/${item.file}-*.{avif,webp}`,
      source: "Unsplash",
      license: "Unsplash License — https://unsplash.com/license",
      photographer: meta.user.name,
      photographerUrl: meta.user.links.html,
      originalUrl: meta.links.html,
      usage: item.usage,
    });
  }
  writeFileSync(resolve(ROOT, "image-sources.json"), `${JSON.stringify(sources, null, 2)}\n`);
  console.log(`\n  image-sources.json — ${sources.length} entrées`);
}

main().catch((err: Error) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
