/**
 * Appareil sans survol : écran tactile (téléphone, tablette) ou télécommande de téléviseur.
 * La page y défile hors du fil JavaScript et le processeur graphique est plus modeste :
 * les effets coûteux à chaque image (flou d'arrière-plan, balayage animé) y sont évités,
 * et ce que la souris révèle au survol s'y révèle au défilement.
 */
export const NO_HOVER_QUERY = "(hover: none)";

export function hasNoHover(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(NO_HOVER_QUERY).matches;
}
