import { useRef } from "react";
import { EASE, gsap, MEDIA } from "../../animations/gsap";
import { DocSheet } from "../../components/DocSheet/DocSheet";
import { Tag } from "../../components/Tag/Tag";
import { useGsap } from "../../hooks/useGsap";
import "./Manifesto.css";

const FLOW = ["Opportunité", "Exigences", "Documents", "Validation", "Soumission"];

const SHEETS = [
  { docRef: "Pièce A.01", title: "Avis", tab: "AO" },
  { docRef: "Pièce A.02", title: "RC" },
  { docRef: "Pièce A.03", title: "CPS" },
  { docRef: "Pièce A.04", title: "Pièces" },
  { docRef: "Pièce A.05", title: "Offre", tab: "Rev. A" },
];

/** Position désordonnée de départ (fraction de la taille d'une feuille, degrés). */
const SCATTER = [
  { x: -0.55, y: -0.18, r: -13 },
  { x: 0.5, y: -0.28, r: 9 },
  { x: -0.38, y: 0.32, r: 7 },
  { x: 0.46, y: 0.22, r: -10 },
  { x: 0.06, y: -0.42, r: -4 },
];

export function Manifesto() {
  const root = useRef<HTMLElement>(null);

  useGsap(
    ({ reduced, scope }) => {
      const q = gsap.utils.selector(scope);
      const words = q(".manifesto__step");
      const sheets = q(".manifesto__sheet");

      if (reduced) {
        gsap.set(words, { opacity: 1 });
        return;
      }

      // Les mots s'allument au rythme de la lecture.
      gsap.fromTo(
        words,
        { opacity: 0.16 },
        {
          opacity: 1,
          stagger: 0.5,
          ease: EASE.linear,
          scrollTrigger: { trigger: q(".manifesto__flow")[0], start: "top 78%", end: "bottom 52%", scrub: true },
        },
      );
      gsap.fromTo(
        q(".manifesto__flow-fill"),
        { scaleY: 0 },
        {
          scaleY: 1,
          ease: EASE.linear,
          transformOrigin: "50% 0%",
          scrollTrigger: { trigger: q(".manifesto__flow")[0], start: "top 78%", end: "bottom 52%", scrub: true },
        },
      );

      // Les feuilles éparses rejoignent une pile ordonnée.
      const mm = gsap.matchMedia();
      mm.add(MEDIA.motion, () => {
        gsap.fromTo(
          sheets,
          {
            xPercent: (i: number) => (SCATTER[i]?.x ?? 0) * 100,
            yPercent: (i: number) => (SCATTER[i]?.y ?? 0) * 100,
            rotation: (i: number) => SCATTER[i]?.r ?? 0,
          },
          {
            xPercent: (i: number) => i * 4 - 8,
            yPercent: (i: number) => i * -3 + 6,
            rotation: 0,
            ease: "power2.out",
            stagger: 0.04,
            scrollTrigger: { trigger: q(".manifesto__sheets")[0], start: "top 85%", end: "center 45%", scrub: 0.6 },
          },
        );
      });
    },
    root,
  );

  return (
    <section ref={root} className="manifesto surface-ivory has-grain" data-surface="light" aria-labelledby="manifeste-title">
      <div className="manifesto__inner container">
        <div className="manifesto__text">
          <Tag>Notre métier</Tag>
          <h2 id="manifeste-title" className="display-lg" data-reveal="lines">
            Un dossier complexe. <em>Une méthode claire.</em>
          </h2>
          <p className="lead manifesto__lead" data-reveal="fade">
            MUNAQASA transforme les exigences d’une consultation en une feuille de route claire : documents,
            responsabilités, validations et échéances.
          </p>

          <div className="manifesto__flow">
            <span className="manifesto__flow-line" aria-hidden="true">
              <span className="manifesto__flow-fill" />
            </span>
            <ol aria-label="De l’opportunité à la soumission">
              {FLOW.map((word, i) => (
                <li key={word} className="manifesto__step">
                  <span className="label manifesto__index">{String(i + 1).padStart(2, "0")}</span>
                  <span className="manifesto__word">{word}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="manifesto__sheets" aria-hidden="true">
          <span className="crop-marks" />
          {SHEETS.map((s, i) => (
            <DocSheet key={s.docRef} className="manifesto__sheet" docRef={s.docRef} title={s.title} tab={s.tab} lines={6 + (i % 3)} />
          ))}
          <span className="manifesto__caption label">Dossier / 01 — pièces A.01 à A.05</span>
        </div>
      </div>
    </section>
  );
}
