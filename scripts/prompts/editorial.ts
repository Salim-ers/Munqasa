/**
 * Visuels éditoriaux (facultatifs) — à utiliser seulement si une photographie
 * réelle ne convient pas. Aucun humain, aucun texte lisible, aucun logo.
 */
import { NEGATIVES, PHOTO_CONSTRAINTS } from "./shared.ts";

export interface EditorialPrompt {
  /** Nom de fichier de sortie (public/images/generated/<name>-<largeur>.webp). */
  name: string;
  prompt: string;
}

export const EDITORIAL: Record<string, EditorialPrompt> = {
  dossier: {
    name: "dossier-appel-offres",
    prompt: `
Ultra-realistic overhead editorial photograph of a premium technical tender dossier arranged on a large architectural office desk in Morocco.
Several sophisticated neutral folders, technical documents, architectural drawings, dividers, document tabs, checklist layout, fountain pen, black metal ruler, subtle terracotta stationery detail, premium paper textures, limestone and dark wood desk materials.
No readable confidential information. No fake government document. No official logo.
Warm directional natural daylight creating subtle geometric shadows.
Extremely realistic architecture magazine photography. Natural imperfections. No artificial staged stock-photo feeling.
${PHOTO_CONSTRAINTS}.
Strictly: ${NEGATIVES}.`.trim(),
  },
  analyse: {
    name: "analyse-documentaire",
    prompt: `
Ultra-realistic close-up editorial photography of an organized architectural and engineering tender document set: layered technical pages, specifications, subtle document tabs and structured checklist, architectural plans partially visible underneath.
Refined Moroccan contemporary office interior, sandstone, black metal and terracotta material palette, natural sunlight, realistic paper imperfections, shallow but natural depth of field.
No readable fake text, no government branding.
${PHOTO_CONSTRAINTS}.
Strictly: ${NEGATIVES}.`.trim(),
  },
  architecture: {
    name: "architecture-immersive",
    prompt: `
Ultra-realistic editorial architectural photography in Morocco: monumental contemporary Moroccan building, refined arches interpreted through modern geometry, stone and concrete, large shadows, warm late-afternoon light, subtle terracotta details, minimal empty composition, realistic Moroccan context, wide horizontal frame.
No vehicles dominating the frame, no fantasy architecture.
${PHOTO_CONSTRAINTS}.
Strictly: ${NEGATIVES}.`.trim(),
  },
};
