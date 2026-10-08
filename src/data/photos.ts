/**
 * Photothèque du site. Dimensions, largeurs et présence d'une version nuit :
 * photo-manifest.json (généré par `npm run images:optimize`). Crédits : image-sources.json.
 */
import manifest from "./photo-manifest.json";

export type PhotoName = keyof typeof manifest;

export interface Photo {
  name: PhotoName;
  alt: string;
  width: number;
  height: number;
  widths: readonly number[];
  /** Une version nuit, éditée à partir de la même photographie, existe. */
  night: boolean;
}

const ALT: Record<PhotoName, string> = {
  "arcade-shadow": "Galerie à arcs et moucharabiehs, emmarchement découpé par la lumière",
  "arch-niche": "Niche en arc outrepassé dans un mur enduit couleur sable",
  corridor: "Long couloir aux murs ocre et au sol de zellige, menant à une porte en arc",
  "archive-shelf": "Chemises d’archives alignées sur une étagère",
  "drawing-table": "Dessin technique, règle métallique et crayon sur une table en bois sombre",
  "earth-walls": "Murs en pisé aux arêtes vives se découpant sur le ciel",
  "lattice-facade": "Façade contemporaine à résille géométrique, vue en contre-plongée",
  "museum-entrance": "Entrée contemporaine en brique terracotta et pierre claire, porte en métal noir",
  "papers-table": "Liasses de documents sur un guéridon noir devant un mur en béton brut",
  "plaster-niche": "Mur enduit creusé de niches géométriques, découpé par l’ombre",
  rampart: "Rempart crénelé en terre ocre",
  "sand-tower": "Volume enduit couleur sable sur un ciel profond",
  "screen-tower": "Tour contemporaine habillée d’une résille géométrique, vue en contre-plongée",
  "terracotta-walls": "Murs en terre ocre et terracotta, ombres architecturales",
  "white-arch": "Enfilade d’arches blanches ouvrant sur un sol en zellige",
};

export function photo(name: PhotoName): Photo {
  const m = manifest[name] as { width: number; height: number; widths: number[]; night?: boolean };
  return { name, alt: ALT[name], width: m.width, height: m.height, widths: m.widths, night: Boolean(m.night) };
}

/** Paire du hero : même bâtiment, même cadrage, deux lumières. */
export const HERO = {
  widths: [1280, 1920, 2560] as const,
  width: 2560,
  height: 1440,
  alt: {
    day: "Bâtiment marocain contemporain en travertin, arches brisées et résille de terre cuite, en plein jour",
    night: "Le même bâtiment la nuit, arches éclairées d’une lumière dorée et bureau d’archives allumé",
  },
  src(mode: "day" | "night", width: number) {
    return width === 2560 ? `/images/hero-${mode}.webp` : `/images/hero-${mode}-${width}.webp`;
  },
} as const;
