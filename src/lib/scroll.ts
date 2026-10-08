/**
 * Défilement : instance Lenis partagée (si active) et utilitaires qui
 * fonctionnent avec ou sans elle (mouvement réduit = défilement natif).
 */
import type Lenis from "lenis";

/** Clé de stockage des positions de défilement (React Router). */
export const SCROLL_POSITIONS_KEY = "talab:scroll";

let lenis: Lenis | null = null;

export function setLenis(instance: Lenis | null) {
  lenis = instance;
}

export function scrollToTop({ smooth = false } = {}) {
  if (lenis) lenis.scrollTo(0, smooth ? { duration: 1.2 } : { immediate: true, force: true });
  else window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
}

/** Défile jusqu'à un élément en respectant son `scroll-margin-top` (en-tête fixe). */
export function scrollToElement(el: HTMLElement) {
  const offset = -(Number.parseFloat(getComputedStyle(el).scrollMarginTop) || 0);
  if (lenis) lenis.scrollTo(el, { offset, duration: 1.2 });
  else window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + offset });
}

let locks = 0;

/** Bloque le défilement (menu plein écran, loader). Appels imbriqués supportés. */
export function lockScroll() {
  locks += 1;
  if (locks > 1) return;
  lenis?.stop();
  document.documentElement.style.overflow = "hidden";
}

export function unlockScroll() {
  locks = Math.max(0, locks - 1);
  if (locks > 0) return;
  lenis?.start();
  document.documentElement.style.overflow = "";
}
