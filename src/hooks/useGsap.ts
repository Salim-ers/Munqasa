import { useLayoutEffect, type DependencyList, type RefObject } from "react";
import { gsap } from "../animations/gsap";
import { useReducedMotion } from "./useMediaQuery";

/**
 * Exécute des animations GSAP dans un contexte limité à `scope` : toutes les
 * animations et ScrollTriggers créés sont annulés au démontage (et rejoués
 * proprement si `prefers-reduced-motion` change).
 */
export function useGsap(
  setup: (opts: { reduced: boolean; scope: HTMLElement }) => void | (() => void),
  scope: RefObject<HTMLElement | null>,
  deps: DependencyList = [],
) {
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    const el = scope.current;
    if (!el) return;
    let cleanup: void | (() => void);
    const ctx = gsap.context(() => {
      cleanup = setup({ reduced, scope: el });
    }, el);
    return () => {
      cleanup?.();
      ctx.revert();
    };
    // `setup` est recréé à chaque rendu : seules les dépendances déclarées relancent l'effet.
  }, [reduced, ...deps]);
}
