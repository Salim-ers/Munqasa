/**
 * Photothèque du site. Dimensions et largeurs disponibles : photo-manifest.json
 * (généré par `npm run images:optimize`). Crédits : image-sources.json.
 */
import manifest from "./photo-manifest.json";

export type PhotoName = keyof typeof manifest;

export interface Photo {
  name: PhotoName;
  alt: string;
  width: number;
  height: number;
  widths: readonly number[];
}

const ALT: Record<PhotoName, string> = {
  "arcade-shadow": "Galerie à arcs et moucharabiehs, emmarchement découpé par les ombres",
  "arch-niche": "Niche en arc outrepassé dans un mur enduit couleur sable, lumière rasante",
  "archive-shelf": "Chemises d’archives alignées sur une étagère sombre",
  binders: "Classeurs blancs empilés, tranches alignées",
  blueprints: "Plans d’architecture superposés sur une table",
  "drawing-table": "Dessin technique, règle métallique et crayon sur une table en bois sombre",
  "earth-walls": "Murs en pisé aux arêtes vives se découpant sur le ciel",
  "lattice-facade": "Façade contemporaine à résille géométrique blanche, vue en contre-plongée",
  "museum-entrance": "Entrée contemporaine en brique terracotta et pierre claire, porte en métal noir",
  "night-desk": "Bureau dans la pénombre, une lampe éclaire un carnet ouvert",
  "paper-stack": "Pile de feuilles blanches vue de profil",
  "papers-shelf": "Documents reliés posés sur une tablette en bois devant un mur en béton",
  "papers-table": "Liasses de documents sur un guéridon noir devant un mur en béton brut",
  rampart: "Rempart crénelé en terre ocre sous un ciel pâle",
  "sand-tower": "Volume enduit couleur sable sur un ciel bleu profond",
  "terracotta-walls": "Murs en terre ocre et terracotta sous un ciel bleu profond, ombres nettes",
  "white-arch": "Enfilade d’arches blanches ouvrant sur un sol en zellige",
};

export function photo(name: PhotoName): Photo {
  const m = manifest[name];
  return { name, alt: ALT[name], width: m.width, height: m.height, widths: m.widths };
}

/** Paire du hero : même bâtiment, même cadrage, deux lumières. */
export const HERO = {
  widths: [1280, 1920, 2560] as const,
  width: 2560,
  height: 1440,
  alt: {
    day: "Architecture marocaine contemporaine sous la lumière du jour",
    night: "La même architecture à l’heure bleue, même cadrage",
  },
  src(mode: "day" | "night", width: number) {
    return width === 2560 ? `/images/hero-${mode}.webp` : `/images/hero-${mode}-${width}.webp`;
  },
} as const;
