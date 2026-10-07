import { useRef } from "react";
import { EASE, gsap, MEDIA } from "../../animations/gsap";
import { Tag } from "../../components/Tag/Tag";
import { DOSSIER_PIECES } from "../../data/method";
import { useGsap } from "../../hooks/useGsap";
import "./Problem.css";

/** Désordre de départ, en fraction de la planche (x, y) et en degrés. */
const SCATTER = [
  { x: -0.18, y: -0.34, r: -16 },
  { x: 0.22, y: -0.2, r: 11 },
  { x: -0.3, y: 0.06, r: 8 },
  { x: 0.16, y: 0.3, r: -12 },
  { x: 0.34, y: -0.04, r: 18 },
  { x: -0.12, y: 0.34, r: -7 },
  { x: 0.28, y: 0.12, r: 6 },
  { x: -0.34, y: -0.1, r: -20 },
  { x: 0.06, y: -0.12, r: 14 },
  { x: -0.06, y: 0.18, r: -9 },
];

export function Problem() {
  const root = useRef<HTMLElement>(null);

  useGsap(
    ({ reduced, scope }) => {
      if (reduced) return;
      const q = gsap.utils.selector(scope);
      const board = q(".problem__board")[0] as HTMLElement | undefined;
      const pieces = q(".problem__piece");
      if (!board) return;

      const from = {
        x: (i: number) => (SCATTER[i]?.x ?? 0) * board.offsetWidth,
        y: (i: number) => (SCATTER[i]?.y ?? 0) * board.offsetHeight,
        rotation: (i: number) => SCATTER[i]?.r ?? 0,
      };
      const mm = gsap.matchMedia();

      // Desktop : la planche reste à l'écran, le défilement range les pièces.
      mm.add(MEDIA.desktop, () => {
        const tl = gsap.timeline({
          scrollTrigger: { trigger: scope, start: "top top", end: "bottom bottom", scrub: 0.7, invalidateOnRefresh: true },
        });
        tl.fromTo(pieces, from, { x: 0, y: 0, rotation: 0, ease: "power2.inOut", stagger: 0.035, duration: 0.6 }, 0)
          .fromTo(q(".problem__frame-line"), { scaleX: 0 }, { scaleX: 1, ease: EASE.linear, duration: 0.2, stagger: 0.05 }, 0.55)
          .fromTo(q(".problem__result"), { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.15 }, 0.8)
          .to({}, { duration: 0.1 });
      });

      // Mobile : rangement joué une fois, sans épinglage.
      mm.add(MEDIA.mobile, () => {
        const tl = gsap.timeline({ scrollTrigger: { trigger: board, start: "top 70%", once: true } });
        tl.fromTo(pieces, from, { x: 0, y: 0, rotation: 0, duration: 1.3, ease: EASE.premium, stagger: 0.05 })
          .fromTo(q(".problem__frame-line"), { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: EASE.architect }, 0.6)
          .fromTo(q(".problem__result"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5 }, 1);
      });
    },
    root,
  );

  return (
    <section ref={root} className="problem surface-warm has-grain" data-surface="light" aria-labelledby="probleme-title">
      <div className="problem__sticky">
        <div className="problem__inner container">
          <div className="problem__text">
            <Tag>Le constat</Tag>
            <h2 id="probleme-title" className="display-md" data-reveal="lines">
              Un appel d’offres n’est jamais <em>un seul document.</em>
            </h2>
            <p className="body-text" data-reveal="fade">
              Règlement, cahier des prescriptions, pièces administratives, offre technique, formulaires, signatures : chaque
              consultation réunit des pièces de natures différentes, produites par des personnes différentes, pour une seule
              échéance.
            </p>
          </div>

          <div className="problem__board">
            <div className="problem__frame" aria-hidden="true">
              <span className="problem__frame-line problem__frame-line--top" />
              <span className="problem__frame-line problem__frame-line--bottom" />
              <span className="crop-marks" />
            </div>
            <div className="problem__head label" aria-hidden="true">
              <span>Dossier / 01</span>
              <span>Pièces 01 — 10</span>
            </div>
            <ol className="problem__pieces">
              {DOSSIER_PIECES.map((p) => (
                <li key={p.ref} className="problem__piece">
                  <span className="label problem__ref">{p.ref}</span>
                  <span className="problem__name">{p.label}</span>
                  <span className="problem__tick" aria-hidden="true" />
                </li>
              ))}
            </ol>
            <p className="problem__result label">
              <span className="problem__result-dot" aria-hidden="true" />
              Dossier structuré
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
