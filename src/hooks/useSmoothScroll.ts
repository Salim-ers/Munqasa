import Lenis from "lenis";
import { useEffect } from "react";
import { gsap, ScrollTrigger } from "../animations/gsap";
import { isTouchDevice } from "../lib/device";
import { setLenis } from "../lib/scroll";
import { useReducedMotion } from "./useMediaQuery";

/**
 * Défilement amorti à la molette (Lenis), synchronisé avec ScrollTrigger.
 * - écran tactile : Lenis n'est pas initialisé, le défilement natif reste seul (rien à calculer en plus) ;
 * - clavier, ancres, historique : natifs (Lenis suit la position réelle) ;
 * - prefers-reduced-motion : Lenis n'est pas initialisé du tout.
 */
export function useSmoothScroll() {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced || isTouchDevice()) return;
    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - 2 ** (-10 * t)),
      smoothWheel: true,
      syncTouch: false,
      anchors: false,
      autoRaf: false,
    });
    setLenis(lenis);
    lenis.on("scroll", ScrollTrigger.update);
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(raf);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.destroy();
      setLenis(null);
    };
  }, [reduced]);
}
