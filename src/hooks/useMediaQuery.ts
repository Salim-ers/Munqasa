import { useSyncExternalStore } from "react";

/** Abonnement réactif à une media query (sans re-rendu superflu). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      // Safari antérieur à 14 ne connaît que addListener.
      if (typeof mql.addEventListener === "function") {
        mql.addEventListener("change", onChange);
        return () => mql.removeEventListener("change", onChange);
      }
      mql.addListener(onChange);
      return () => mql.removeListener(onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function useReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

/** Pointeur précis avec survol : souris / trackpad, pas un écran tactile. */
export function useFinePointer(): boolean {
  return useMediaQuery("(hover: hover) and (pointer: fine)");
}
