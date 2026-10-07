import { useLayoutEffect, useRef, useState } from "react";
import { EASE, gsap } from "../../animations/gsap";
import { useReducedMotion } from "../../hooks/useMediaQuery";
import { ARCH_INNER, ARCH_OUTLINE } from "../../lib/arch";
import { lockScroll, unlockScroll } from "../../lib/scroll";
import { writeStorage } from "../../lib/storage";
import { LOADER_SEEN_KEY, useAppState } from "../AppState";
import "./Loader.css";

/**
 * Loader (1re visite de la session, ≈ 1,7 s) : une ligne sable trace l'arche,
 * le symbole apparaît, puis MUNAQASA ; le cadre s'ouvre comme deux battants.
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

      if (reduced) {
        gsap.timeline({ onComplete: () => setVisible(false) }).to(el, { autoAlpha: 0, duration: 0.4, delay: 0.5 }).call(finish, [], 0.5);
        return;
      }

      gsap
        .timeline({ onComplete: () => setVisible(false) })
        .to(paths[0] ?? [], { strokeDashoffset: 0, duration: 0.8, ease: "power2.inOut" }, 0)
        .to(paths[1] ?? [], { strokeDashoffset: 0, duration: 0.6, ease: "power2.inOut" }, 0.2)
        .fromTo(".loader__symbol", { clipPath: "inset(100% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.55, ease: EASE.architect }, 0.42)
        .fromTo(".loader__wordmark", { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.5, ease: EASE.architect }, 0.72)
        .fromTo(".loader__label", { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.35 }, 0.88)
        .to(".loader__content", { autoAlpha: 0, scale: 1.04, duration: 0.32, ease: "power2.in" }, 1.22)
        .call(finish, [], 1.3)
        .to(".loader__door--left", { xPercent: -101, duration: 0.55, ease: EASE.architect }, 1.24)
        .to(".loader__door--right", { xPercent: 101, duration: 0.55, ease: EASE.architect }, 1.24);
    }, el);

    return () => {
      ctx.revert();
      unlockScroll();
    };
  }, [visible, reduced, setIntroDone]);

  if (!visible) return null;

  return (
    <div ref={root} className="loader" role="status" aria-label="Chargement de MUNAQASA">
      <div className="loader__door loader__door--left" />
      <div className="loader__door loader__door--right" />
      <div className="loader__content">
        <svg className="loader__arch" viewBox="0 0 200 240" aria-hidden="true">
          <path d={ARCH_OUTLINE} />
          <path d={ARCH_INNER} />
        </svg>
        <img className="loader__symbol" src="/logos/munaqasa-symbol-reversed-sm.webp" width={639} height={682} alt="" />
        <img className="loader__wordmark" src="/logos/munaqasa-wordmark-reversed-sm.webp" width={1189} height={179} alt="" />
        <p className="loader__label label">Appels d’offres au Maroc</p>
      </div>
    </div>
  );
}
