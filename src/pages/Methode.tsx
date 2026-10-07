import { useRef } from "react";
import { EASE, gsap, ScrollTrigger } from "../animations/gsap";
import { DocStage } from "../components/DocStage/DocStage";
import { Tag } from "../components/Tag/Tag";
import { METHOD_STEPS } from "../data/method";
import { useGsap } from "../hooks/useGsap";
import { usePageReveals } from "../hooks/usePageReveals";
import { FinalCta } from "../sections/shared/FinalCta";
import { PageHero } from "../sections/shared/PageHero";
import "./Methode.css";

const TOTAL = METHOD_STEPS.length;
const pad = (n: number) => String(n).padStart(2, "0");

const PRINCIPLES = [
  { title: "Une seule liste", text: "Toutes les exigences du dossier tiennent dans une checklist partagée, tenue à jour jusqu’au dépôt." },
  { title: "Un responsable par pièce", text: "Chaque document attendu a un auteur, une date de remise et un statut visible." },
  { title: "Une revue avant l’échéance", text: "Le contrôle a lieu avant la date limite, avec le temps de corriger ce qui doit l’être." },
];

export default function Methode() {
  const ref = usePageReveals();
  const progress = useRef<HTMLElement>(null);

  // Le trait de progression relie 01 → 07 au fil du défilement.
  useGsap(
    ({ reduced, scope }) => {
      const q = gsap.utils.selector(scope);
      const nodes = gsap.utils.toArray<HTMLElement>(".progress__step", scope);
      if (reduced) {
        nodes.forEach((n) => n.classList.add("is-reached"));
        return;
      }
      gsap.fromTo(
        q(".progress__line-fill"),
        { scaleY: 0 },
        { scaleY: 1, ease: EASE.linear, scrollTrigger: { trigger: q(".progress__list")[0], start: "top 60%", end: "bottom 60%", scrub: true } },
      );
      nodes.forEach((node) => {
        ScrollTrigger.create({
          trigger: node,
          start: "top 60%",
          onEnter: () => node.classList.add("is-reached"),
          onLeaveBack: () => node.classList.remove("is-reached"),
        });
      });
    },
    progress,
  );

  return (
    <div ref={ref}>
      <PageHero
        tag="Méthode"
        sheet="Feuillet 03 / 05"
        lines={["Du premier avis", <em key="d">au dossier final.</em>]}
        intro="Sept étapes, toujours dans le même ordre. Chaque étape produit un livrable qui sert de base à la suivante : c’est ce qui rend un dossier lisible, vérifiable et prêt à temps."
        image="arcade-shadow"
        imagePosition="40% 50%"
      />

      <section ref={progress} className="progress surface-dusk has-grain" data-surface="dark" aria-labelledby="etapes-title">
        <div className="container">
          <header className="progress__head">
            <Tag>Les sept étapes</Tag>
            <h2 id="etapes-title" className="display-lg" data-reveal="lines">
              Une progression, <em>pas une improvisation.</em>
            </h2>
          </header>

          <div className="progress__list">
            <span className="progress__line" aria-hidden="true">
              <span className="progress__line-fill" />
            </span>
            <ol>
              {METHOD_STEPS.map((s, i) => (
                <li key={s.number} className={`progress__step${i % 2 ? " progress__step--alt" : ""}`}>
                  <span className="progress__node" aria-hidden="true">
                    {s.number}
                  </span>
                  <div className="progress__content">
                    <p className="label progress__count">
                      Étape {s.number} / {pad(TOTAL)}
                    </p>
                    <h3 className="progress__title">{s.title}</h3>
                    <p className="body-text">{s.text}</p>
                    <p className="progress__deliverable">
                      <span className="label">Livrable</span>
                      {s.deliverable}
                    </p>
                  </div>
                  <DocStage step={i + 1} className="progress__stage" />
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="principles surface-ivory has-grain" data-surface="light" aria-labelledby="principes-title">
        <div className="principles__inner container">
          <header>
            <Tag>Principes</Tag>
            <h2 id="principes-title" className="display-md" data-reveal="lines">
              Trois règles, <em>sur chaque dossier.</em>
            </h2>
          </header>
          <ol className="principles__list">
            {PRINCIPLES.map((p, i) => (
              <li key={p.title} data-reveal="fade" data-reveal-delay={String(i * 0.08)}>
                <span className="numeral principles__num">{pad(i + 1)}</span>
                <h3 className="principles__title">{p.title}</h3>
                <p className="body-text">{p.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <FinalCta />
    </div>
  );
}
