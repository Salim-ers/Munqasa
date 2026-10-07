import { CtaLink } from "../../components/CtaLink/CtaLink";
import { Tag } from "../../components/Tag/Tag";
import { FORMULAS } from "../../data/offer";
import "./Formulas.css";

export function Formulas() {
  return (
    <section className="formulas surface-ink has-grain" data-surface="dark" aria-labelledby="formules-title">
      <div className="container">
        <header className="formulas__head">
          <Tag>Formules d’accompagnement</Tag>
          <h2 id="formules-title" className="display-lg" data-reveal="lines">
            Une mission, une revue <em>ou une cellule entière.</em>
          </h2>
        </header>

        <ol className="formulas__list">
          {FORMULAS.map((f) => (
            <li key={f.slug} className={`formula${f.featured ? " formula--featured" : ""}`} data-reveal="fade">
              <div className="formula__top">
                <span className="numeral formula__num">{f.number}</span>
                <Tag dot={f.featured}>{f.ref}</Tag>
              </div>
              <h3 className="formula__title">{f.title}</h3>
              <p className="formula__text">« {f.text} »</p>
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
        </ol>
      </div>
    </section>
  );
}
