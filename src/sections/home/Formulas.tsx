import { CtaLink } from "../../components/CtaLink/CtaLink";
import { Tag } from "../../components/Tag/Tag";
import { FORMULAS } from "../../data/offer";
import "./Formulas.css";

export function Formulas() {
  return (
    <section className="formulas tone-3 has-grain" aria-labelledby="formules-title">
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
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
