import { useRef } from "react";
import { gsap, ScrollTrigger } from "../../animations/gsap";
import { CtaLink } from "../../components/CtaLink/CtaLink";
import { Tag } from "../../components/Tag/Tag";
import { FORMULAS } from "../../data/offer";
import { useGsap } from "../../hooks/useGsap";
import { NO_HOVER_QUERY } from "../../lib/device";
import "./Formulas.css";

export function Formulas() {
  const root = useRef<HTMLElement>(null);

  // Sans souris (téléphone, tablette, télécommande) : la carte qui traverse le milieu de l'écran
  // s'éclaire comme au survol. Avec une souris, tout se fait en CSS (:hover).
  useGsap(({ scope }) => {
    gsap.matchMedia().add(NO_HOVER_QUERY, () => {
      const cards = gsap.utils.toArray<HTMLElement>(".formula", scope);
      cards.forEach((card) => {
        ScrollTrigger.create({ trigger: card, start: "top center", end: "bottom center", toggleClass: { targets: card, className: "is-active" } });
      });
      return () => cards.forEach((card) => card.classList.remove("is-active"));
    });
  }, root);

  return (
    <section ref={root} className="formulas tone-3 has-grain" aria-labelledby="formules-title">
      <div className="container">
        <header className="formulas__head">
          <Tag>Formules d’accompagnement</Tag>
          <h2 id="formules-title" className="display-lg" data-reveal="lines">
            Une mission, une revue <em>ou une cellule entière.</em>
          </h2>
        </header>

        <ul className="formulas__list">
          {FORMULAS.map((f) => (
            <li key={f.slug} className={`formula${f.featured ? " formula--featured" : ""}`} data-reveal="fade">
              <div className="formula__card">
                {f.featured && <span className="formula__flag label">Organisation continue</span>}
                <h3 className="formula__title">{f.title}</h3>
                <p className="formula__text">{f.text}</p>
                <ul className="formula__includes">
                  {f.includes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <CtaLink to={`/contact?formule=${f.slug}`} variant={f.featured ? "solid" : "outline"} className="formula__cta">
                  Étudier mon besoin
                </CtaLink>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
