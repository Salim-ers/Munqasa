import { CtaLink } from "../../components/CtaLink/CtaLink";
import { Tag } from "../../components/Tag/Tag";
import "./FinalCta.css";

export function FinalCta() {
  return (
    <section className="final-cta surface-night" data-surface="dark" aria-labelledby="cta-title">
      <img className="final-cta__arch" src="/logos/munaqasa-symbol-reversed.webp" width={639} height={682} alt="" loading="lazy" />
      <div className="final-cta__inner container">
        <Tag dot>Échéance</Tag>
        <h2 id="cta-title" className="display-xl" data-reveal="lines">
          Un appel d’offres <em>à préparer ?</em>
        </h2>
        <p className="lead final-cta__text" data-reveal="fade">
          Parlons de l’échéance, des documents disponibles et de l’accompagnement dont votre entreprise a besoin.
        </p>
        <div data-reveal="fade">
          <CtaLink to="/contact">Confier le dossier</CtaLink>
        </div>
      </div>
    </section>
  );
}
