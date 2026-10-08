import { useRef } from "react";
import { EASE, gsap, SCRUB } from "../../animations/gsap";
import { Picture } from "../../components/Picture/Picture";
import { Tag } from "../../components/Tag/Tag";
import { photo } from "../../data/photos";
import { useGsap } from "../../hooks/useGsap";
import "./Immersive.css";

/** Grande photographie plein cadre (jour ou nuit réelle), sans voile : le texte vit dans son propre cartouche. */
export function Immersive() {
  const root = useRef<HTMLElement>(null);

  useGsap(
    ({ reduced, scope }) => {
      if (reduced) return;
      const q = gsap.utils.selector(scope);
      gsap.fromTo(q(".immersive__media img"), { scale: 1 }, { scale: 1.06, ease: EASE.linear, scrollTrigger: { trigger: scope, start: "top bottom", end: "bottom top", scrub: SCRUB } });
      gsap.from(q(".immersive__panel"), { yPercent: 30, autoAlpha: 0, duration: 1.2, ease: EASE.premium, scrollTrigger: { trigger: scope, start: "top 55%", once: true } });
    },
    root,
  );

  return (
    <section ref={root} className="immersive" aria-labelledby="immersive-title">
      <div className="immersive__media" data-cursor="voir">
        <Picture photo={photo("terracotta-walls")} sizes="100vw" position="50% 45%" />
      </div>
      <div className="immersive__panel tone-1">
        <Tag>Talab Solutions, appels d’offres au Maroc</Tag>
        <h2 id="immersive-title" className="display-lg">
          La rigueur <em>avant l’échéance.</em>
        </h2>
      </div>
    </section>
  );
}
