import { useRef } from "react";
import { EASE, gsap } from "../../animations/gsap";
import { Picture } from "../../components/Picture/Picture";
import { photo } from "../../data/photos";
import { useGsap } from "../../hooks/useGsap";
import "./Immersive.css";

/** Grande photographie : fin de journée → nuit pendant le défilement. */
export function Immersive() {
  const root = useRef<HTMLElement>(null);

  useGsap(
    ({ reduced, scope }) => {
      if (reduced) return;
      const q = gsap.utils.selector(scope);
      const st = { trigger: scope, start: "top bottom", end: "bottom top", scrub: true };
      gsap.fromTo(q(".immersive__media img"), { scale: 1 }, { scale: 1.06, ease: EASE.linear, scrollTrigger: st });
      gsap.fromTo(q(".immersive__dusk"), { opacity: 0.12 }, { opacity: 0.82, ease: EASE.linear, scrollTrigger: st });
    },
    root,
  );

  return (
    <section ref={root} className="immersive surface-night" data-surface="dark" aria-labelledby="immersive-title">
      <div className="immersive__media" data-cursor="voir">
        <Picture photo={photo("terracotta-walls")} sizes="100vw" position="50% 45%" />
        <div className="immersive__dusk" aria-hidden="true" />
        <div className="immersive__shade" aria-hidden="true" />
      </div>
      <div className="immersive__content container">
        <p className="immersive__label label">
          <span>MUNAQASA</span>
          <span>Appels d’offres</span>
          <span>Maroc</span>
        </p>
        <h2 id="immersive-title" className="display-xl" data-reveal="lines">
          La rigueur <em>avant l’échéance.</em>
        </h2>
      </div>
    </section>
  );
}
