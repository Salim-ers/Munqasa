/**
 * Prompts du hero MUNAQASA.
 *
 * Composition pensée pour la mise en page : le bâtiment occupe les deux tiers
 * droits, le tiers gauche (ciel + parvis calme) reçoit le H1 et les CTA.
 * Les baies vitrées du rez-de-chaussée laissent deviner un bureau technique
 * vide avec des rayonnages de dossiers : la nuit, ce sont elles qui
 * s'allument — « la rigueur avant l'échéance ».
 */

import { NEGATIVES, PHOTO_CONSTRAINTS } from "./shared.ts";

export const HERO_DAY_PROMPT = `
${PHOTO_CONSTRAINTS}.

Subject: a contemporary Moroccan institutional office building in a Moroccan city, the kind of restrained building that would house a firm of engineers or a public procurement office. Refined modern Moroccan architecture: a rhythm of tall, deep recessed openings whose tops are a subtle modern reinterpretation of the pointed Moroccan arch, cut cleanly into thick walls. Materials: warm honed limestone and travertine cladding, board-formed raw concrete, a few terracotta accents (terracotta screen panels or a terracotta-toned tadelakt wall), slim black metal window frames. One very discreet band of abstract geometric pattern carved into stone, not ornamental.

Through the large ground-floor glazing, a faint glimpse of an empty contemporary technical office: dark wood shelving holding neutral archive folders and binders, a long desk with stacked documents. Nothing readable. Nobody inside.

Light: strong natural Moroccan sunlight in the late morning, clean sky with a slightly warm haze, crisp architectural shadows cast by the deep window reveals across the facade.

Composition: wide horizontal frame, eye-level slightly low viewpoint, building seen at a gentle three-quarter angle and placed in the right two-thirds of the frame; the left third is calm — open sky and an empty paved limestone forecourt — leaving clean negative space for typography. Calm, empty, silent environment.

Mood: rigorous, precise, premium, timeless, Moroccan without folklore. Feels like a real photograph from an architecture magazine, not a render.

Strictly: ${NEGATIVES}.
`.trim();

export const HERO_NIGHT_PROMPT = `
Transform this exact architectural photograph into a richly lit Moroccan night photograph of the same building, as if the photographer stayed on the tripod and shot again after dark for a luxury architecture magazine.

ABSOLUTELY PRESERVE, pixel-aligned: the exact building, camera position, lens, crop, framing, perspective, geometry, facade, every opening and arch, window frames, doors, materials, the terracotta screen, the terracotta wall, forecourt paving, surroundings and horizon line. Do not redesign, add, remove, move or resize any architectural element. No new lamps or lanterns in view: the light comes from hidden fixtures.

ONLY CHANGE the light:
- sky: deep, smooth indigo night sky;
- the facade is generously and beautifully lit with warm golden-amber light (2400–2700K): every pointed arch and deep recess glows warmly from within, the stone piers are washed by hidden ground uplights;
- the perforated terracotta screen is backlit: warm light passes through it and casts intricate geometric light patterns, like light through a carved moucharabieh;
- the ground-floor office is warmly lit, its shelves of folders glowing, as if someone is working late before a deadline (the office stays empty, nobody inside);
- the terracotta wall on the left is softly grazed by warm light; low warm lights line the forecourt;
- exposure is bright and detailed, not dark: stone and concrete keep their full texture with rich warm highlights; every shadow is consistent with the artificial light; all sunlight removed.

Warm, inviting, majestic, believable long-exposure photograph.

Strictly: no people, no silhouettes, no text, no logos, no new architectural elements, no neon, no colored LEDs, no blue or purple artificial light, no lens flares, no stars, no moon, no CGI look, no plastic rendering.
`.trim();
