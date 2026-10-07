/**
 * Contraintes communes à toutes les images générées : elles doivent sembler
 * photographiées, jamais « générées ».
 */

export const PHOTO_CONSTRAINTS = [
  "ultra-realistic architectural photography",
  "editorial architecture magazine photography",
  "shot on a full-frame camera with a 35mm tilt-shift lens, verticals corrected",
  "natural exposure and natural dynamic range",
  "realistic lens characteristics, very slight vignetting",
  "subtle film grain",
  "physically accurate materials with natural imperfections: weathering on stone, small stains on concrete, uneven tadelakt",
  "realistic architectural geometry that could actually be built",
].join(", ");

export const NEGATIVES = [
  "no people", "no human silhouettes", "no hands", "no faces",
  "no text", "no letters", "no readable writing", "no signage", "no logos", "no fake logos", "no flags", "no watermark",
  "no cars", "no palm trees as decoration", "no lanterns", "no souk", "no desert",
  "no futuristic elements", "no glass skyscraper", "no Dubai-style architecture",
  "no surreal or impossible geometry", "no floating objects",
  "no CGI look", "no glossy render", "no plastic materials",
  "no exaggerated HDR", "no cinematic fantasy", "no oversaturated colors", "no perfect artificial symmetry",
].join(", ");
