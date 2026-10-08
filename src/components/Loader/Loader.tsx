import { useLayoutEffect, useRef, useState } from "react";
import { EASE, gsap } from "../../animations/gsap";
import { useReducedMotion } from "../../hooks/useMediaQuery";
import { ARCH_INNER, ARCH_OUTLINE } from "../../lib/arch";
import { lockScroll, unlockScroll } from "../../lib/scroll";
import { writeStorage } from "../../lib/storage";
import { LOADER_SEEN_KEY, useAppState } from "../AppState";
import "./Loader.css";

/**
 * Loader (1re visite de la session, ≈ 1,8 s), dans la lumière du site : une ligne
 * trace l'arche, le symbole Talab prend sa place, puis le nom apparaît ; le cadre
 * s'ouvre comme deux battants. Jour : logo noir et terracotta ; nuit : logo or.
 */
export function Loader() {
  const { introDone, setIntroDone } = useAppState();
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!introDone);

  useLayoutEffect(() => {
    const el = root.current;
    if (!visible || !el) return;
    lockScroll();
    const finish = () => {
      writeStorage("session", LOADER_SEEN_KEY, "1");
      setIntroDone(true);
    };

    const ctx = gsap.context(() => {
      const paths = el.querySelectorAll<SVGPathElement>(".loader__arch path");
      paths.forEach((p) => {
        const len = p.getTotalLength();
        gsap.set(p, { strokeDasharray: len, strokeDashoffset: reduced ? 0 : len });
      });

      // Mouvement réduit : le logo s'affiche tel quel, puis le loader s'efface.
      if (reduced) {
        gsap.set(".loader__arch", { autoAlpha: 0 });
        gsap.set(".loader__symbols, .loader__wordmarks", { clipPath: "inset(0% 0% 0% 0%)" });
        gsap.set(".loader__label", { autoAlpha: 1 });
        gsap.timeline({ onComplete: () => setVisible(false) }).to(el, { autoAlpha: 0, duration: 0.4, delay: 0.6 }).call(finish, [], 0.6);
        return;
      }

      gsap
        .timeline({ onComplete: () => setVisible(false) })
        .to(paths[0] ?? [], { strokeDashoffset: 0, duration: 0.8, ease: "power2.inOut" }, 0)
        .to(paths[1] ?? [], { strokeDashoffset: 0, duration: 0.6, ease: "power2.inOut" }, 0.2)
        .fromTo(".loader__symbols", { clipPath: "inset(100% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.55, ease: EASE.architect }, 0.42)
        .to(".loader__arch", { autoAlpha: 0, duration: 0.35, ease: EASE.linear }, 0.6)
        .fromTo(".loader__wordmarks", { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.5, ease: EASE.architect }, 0.72)
        .fromTo(".loader__label", { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.35 }, 0.9)
        .to(".loader__content", { autoAlpha: 0, scale: 1.04, duration: 0.32, ease: "power2.in" }, 1.25)
        .call(finish, [], 1.33)
        .to(".loader__door--left", { xPercent: -101, duration: 0.55, ease: EASE.architect }, 1.27)
        .to(".loader__door--right", { xPercent: 101, duration: 0.55, ease: EASE.architect }, 1.27);
    }, el);

    return () => {
      ctx.revert();
      unlockScroll();
    };
  }, [visible, reduced, setIntroDone]);

  if (!visible) return null;

  return (
    <div ref={root} className="loader" role="status" aria-label="Chargement de Talab Solutions">
      <div className="loader__door loader__door--left" />
      <div className="loader__door loader__door--right" />
      <div className="loader__content">
        <div className="loader__mark">
          <svg className="loader__arch" viewBox="0 0 200 240" aria-hidden="true">
            <path d={ARCH_OUTLINE} />
            <path d={ARCH_INNER} />
          </svg>
          <span className="loader__symbols">
            <img className="loader__day" src="/logos/talab-day-symbol.webp" width={900} height={559} alt="" />
            <img className="loader__night" src="/logos/talab-night-symbol.webp" width={900} height={569} alt="" />
          </span>
        </div>
        <span className="loader__wordmarks">
          <img className="loader__day" src="/logos/talab-day-wordmark-sm.webp" width={640} height={186} alt="" />
          <img className="loader__night" src="/logos/talab-night-wordmark-sm.webp" width={640} height={188} alt="" />
        </span>
        <p className="loader__label label">Appels d’offres au Maroc</p>
      </div>
    </div>
  );
}
