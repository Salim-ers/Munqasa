/**
 * Prompts du hero MUNAQASA.
 *
 * Composition pensée pour la mise en page : le bâtiment occupe les deux tiers
 * droits, le tiers gauche (ciel + parvis calme) reçoit le H1 et les CTA.
 * Les baies vitrées du rez-de-chaussée laissent deviner un bureau technique
 * vide avec des rayonnages de dossiers : la nuit, ce sont elles qui
 * s'allument — « la rigueur avant l'échéance ».
 */

const PHOTO_CONSTRAINTS = [
  "ultra-realistic architectural photography",
  "editorial architecture magazine photography",
  "shot on a full-frame camera with a 35mm tilt-shift lens, verticals corrected",
  "natural exposure and natural dynamic range",
  "realistic lens characteristics, very slight vignetting",
  "subtle sensor grain",
  "physically accurate materials with natural imperfections: weathering on stone, small stains on concrete, uneven tadelakt",
  "realistic architectural geometry that could actually be built",
].join(", ");

const NEGATIVES = [
  "no people", "no human silhouettes", "no hands", "no faces",
  "no text", "no letters", "no signage", "no logos", "no flags", "no watermark",
  "no cars", "no palm trees as decoration", "no lanterns", "no souk", "no desert",
  "no futuristic elements", "no glass skyscraper", "no Dubai-style architecture",
  "no surreal or impossible geometry", "no floating objects",
  "no CGI look", "no glossy render", "no plastic materials",
  "no exaggerated HDR", "no oversaturated colors", "no perfect artificial symmetry",
].join(", ");

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
Transform this exact architectural photograph into a realistic blue-hour / early-night version of the same photograph, as if the photographer stayed on the tripod and shot again 40 minutes after sunset.

ABSOLUTELY PRESERVE, pixel-aligned: the exact building, camera position, lens, crop, framing, perspective, geometry, facade, every opening and arch, window frames, doors, materials, forecourt paving, surroundings and horizon line. Do not redesign, add, remove, move or resize any architectural element. Do not change the composition.

ONLY CHANGE the lighting:
- sky: deep blue-black dusk sky, smooth, with a faint residual glow near the horizon;
- overall exposure: realistic night exposure, the stone keeps its texture but reads darker and cooler;
- interior lighting: warm 2700–3000K light inside a selection of openings, especially the ground-floor office where the shelves of folders are now softly lit, as if someone is working late before a deadline (but the office remains empty — nobody inside);
- exterior lighting: restrained architectural uplighting grazing the stone and recessed reveals, a few low ground lights on the forecourt;
- shadows and reflections consistent with these light sources; daylight shadows removed.

Real long-exposure night architecture photography from a premium magazine: natural, quiet, believable.

Strictly: no people, no silhouettes, no text, no logos, no new architectural elements, no neon, no colored LEDs, no exaggerated glow or bloom, no lens flares, no stars, no moon, no CGI look, no oversaturation.
`.trim();
