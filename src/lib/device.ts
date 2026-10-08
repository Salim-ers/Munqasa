/** Téléphone ou tablette : écran tactile, sans survol. */
export const TOUCH_QUERY = "(hover: none) and (pointer: coarse)";

/**
 * Appareil tactile : la page y défile hors du fil JavaScript et le processeur graphique est
 * plus modeste. Les effets coûteux à chaque image (flou d'arrière-plan, balayage animé) y sont évités.
 */
export function isTouchDevice(): boolean {
  return typeof window !== "undefined" && window.matchMedia(TOUCH_QUERY).matches;
}
