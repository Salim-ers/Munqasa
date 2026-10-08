/**
 * Versions « nuit » des photographies réelles : même image, même cadrage.
 * Direction lumière : une nuit marocaine généreusement éclairée — lumière chaude
 * et dorée, arches allumées de l'intérieur, motifs lumineux de moucharabieh —
 * sur un ciel indigo profond. Jamais un simple voile sombre.
 */

const PRESERVE = `
ABSOLUTELY PRESERVE, pixel-aligned: the exact scene, camera position, lens, crop, framing, perspective, geometry,
every architectural element, every object, materials, textures and composition. Do not redesign, add, remove, move
or resize anything. No new objects, no new lamps or lanterns in view: the light comes from hidden fixtures.`.trim();

const STRICT = `Strictly: no people, no silhouettes, no hands, no text, no letters, no logos, no neon, no colored LEDs,
no blue or purple artificial light, no lens flares, no stars, no moon, no CGI look, no plastic rendering.`;

export const NIGHT_EXTERIOR = `
Transform this exact photograph into a richly lit Moroccan night photograph of the same place, as if the photographer
stayed on the tripod and shot again after dark for a luxury architecture magazine.

${PRESERVE}

ONLY CHANGE the light:
- any visible sky becomes a deep, smooth indigo night sky;
- the architecture is generously and beautifully lit: warm golden-amber light (2400–2700K) washes the walls from
  hidden ground fixtures, every arch, niche, recess and opening glows warmly from within;
- oriental light character: where there is any lattice, screen or perforated wall, warm light passes through it and
  casts intricate geometric light patterns, like light through a carved moucharabieh;
- exposure is bright and detailed, not dark: stone, plaster, brick and concrete keep their full texture, with rich
  warm highlights and deep but readable shadows;
- all sunlight and sun shadows are removed; every shadow is consistent with the warm artificial light.

Warm, inviting, majestic, believable long-exposure photograph.

${STRICT}`.trim();

export const NIGHT_INTERIOR = `
Transform this exact photograph into a warmly lit Moroccan evening version of the same scene, photographed again
after dark in the same place.

${PRESERVE}

ONLY CHANGE the light:
- daylight disappears; the scene is generously lit by warm golden-amber light (2400–2700K) from hidden sources
  outside the frame, like brass lantern light;
- oriental light character: soft geometric light patterns, as cast through a carved moucharabieh screen outside the
  frame, fall across part of the surfaces;
- exposure stays bright and detailed: paper keeps a warm ivory glow, wood and metal catch golden highlights, shadows
  are deep but readable and consistent with the warm light.

Warm, refined, believable editorial photograph.

${STRICT}`.trim();

/** Photographies du site qui reçoivent une version nuit. */
export const NIGHT_PHOTOS: Record<string, "exterior" | "interior"> = {
  "arch-niche": "exterior",
  "lattice-facade": "exterior",
  "archive-shelf": "interior",
  "drawing-table": "interior",
  "arcade-shadow": "exterior",
  rampart: "exterior",
  "white-arch": "interior",
  "sand-tower": "exterior",
  "terracotta-walls": "exterior",
  "earth-walls": "exterior",
  "museum-entrance": "exterior",
  "papers-table": "interior",
  corridor: "interior",
  "screen-tower": "exterior",
  "plaster-niche": "exterior",
};
