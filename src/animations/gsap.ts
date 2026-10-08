/**
 * Point d'entrée unique de GSAP : plugins enregistrés une fois, courbes de la
 * marque. Les composants importent gsap depuis ce module, jamais directement.
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { hasNoHover } from "../lib/device";

gsap.registerPlugin(ScrollTrigger, SplitText);

/** Courbes : « premium » pour les apparitions, « architect » pour les volets. */
export const EASE = {
  premium: "expo.out",
  architect: "power3.inOut",
  out: "power3.out",
  linear: "none",
} as const;

gsap.defaults({ ease: EASE.out, duration: 0.9 });
ScrollTrigger.config({ ignoreMobileResize: true });

/**
 * Effets liés 1:1 au défilement (parallaxe, cartes empilées). Sans survol (tactile, télécommande), la page défile
 * hors du fil JavaScript : un lissage court évite que l'effet tremble d'une image derrière elle.
 */
export const SCRUB: true | number = hasNoHover() ? 0.45 : true;

/** Requête gsap.matchMedia commune : desktop / mobile, mouvement réduit ou non. */
export const MEDIA = {
  desktop: "(min-width: 1024px) and (prefers-reduced-motion: no-preference)",
  mobile: "(max-width: 1023px) and (prefers-reduced-motion: no-preference)",
  motion: "(prefers-reduced-motion: no-preference)",
  reduced: "(prefers-reduced-motion: reduce)",
} as const;

export { gsap, ScrollTrigger, SplitText };
