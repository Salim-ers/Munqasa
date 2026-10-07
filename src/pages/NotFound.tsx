import { CtaLink } from "../components/CtaLink/CtaLink";
import { Tag } from "../components/Tag/Tag";
import { usePageReveals } from "../hooks/usePageReveals";
import "./NotFound.css";

export default function NotFound() {
  const ref = usePageReveals();
  return (
    <div ref={ref}>
      <section className="not-found surface-night has-grain" data-surface="dark" aria-labelledby="page-title">
        <img className="not-found__arch" src="/logos/munaqasa-symbol-reversed.webp" width={639} height={682} alt="" />
        <div className="not-found__inner container">
          <Tag dot>Erreur 404</Tag>
          <h1 id="page-title" className="display-xl" data-reveal="lines">
            Pièce <em>introuvable.</em>
          </h1>
          <p className="lead not-found__text" data-reveal="fade">
            Cette page ne figure pas au dossier. Elle a peut-être été déplacée, ou l’adresse contient une erreur.
          </p>
          <div className="not-found__actions" data-reveal="fade">
            <CtaLink to="/" arrow="right">
              Retour à l’accueil
            </CtaLink>
            <CtaLink to="/contact" variant="text">
              Confier un dossier
            </CtaLink>
          </div>
        </div>
      </section>
    </div>
  );
}
