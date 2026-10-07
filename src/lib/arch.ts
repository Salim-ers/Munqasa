/**
 * Géométrie de l'arche — inspirée du logo, jamais une copie : une arche brisée
 * (deux arcs qui se rejoignent en pointe) posée sur des piédroits droits.
 */

/**
 * Polygone CSS `clip-path` d'une arche brisée, en pourcentages de la boîte.
 * @param spring  hauteur (en % de la boîte) où naît l'arc
 * @param steps   nombre de points par arc
 */
export function archPolygon(spring = 34, steps = 18): string {
  // Arc de gauche centré sur la ligne de naissance, au-delà de l'axe : les deux
  // arcs se croisent en pointe (r = 1 donnerait l'arc équilatéral).
  const r = 0.85;
  const cx = r; // centre de l'arc gauche (en fraction de la largeur)
  const apexDy = Math.sqrt(r * r - (0.5 - cx) ** 2);
  const pts: string[] = ["0% 100%", `0% ${spring}%`];
  for (let i = 1; i <= steps; i++) {
    const x = (i / steps) * 0.5;
    const dy = Math.sqrt(Math.max(0, r * r - (x - cx) ** 2));
    pts.push(`${(x * 100).toFixed(2)}% ${(spring - (dy / apexDy) * spring).toFixed(2)}%`);
  }
  for (let i = steps - 1; i >= 0; i--) {
    const x = (i / steps) * 0.5;
    const dy = Math.sqrt(Math.max(0, r * r - (x - cx) ** 2));
    pts.push(`${(100 - x * 100).toFixed(2)}% ${(spring - (dy / apexDy) * spring).toFixed(2)}%`);
  }
  pts.push("100% 100%");
  return `polygon(${pts.join(", ")})`;
}

/**
 * Tracé SVG de l'arche à épaulements (viewBox 0 0 200 240), ouvert en bas :
 * utilisé par le loader et les cadres décoratifs.
 */
export const ARCH_OUTLINE =
  "M24 240 V150 L46 132 V100 L66 88 C66 58 88 42 100 14 C112 42 134 58 134 88 L154 100 V132 L176 150 V240";

export const ARCH_INNER = "M70 240 V118 C70 94 90 80 100 62 C110 80 130 94 130 118 V240";
