import { Tag } from "../../components/Tag/Tag";
import { FINANCIAL_NOTE, OUT_OF_SCOPE, SERVICES } from "../../data/services";
import "./Scope.css";

/** Périmètre d'intervention — ce que MUNAQASA fait, et ce qu'elle ne fait pas. */
export function Scope({ surface = "ivory" }: { surface?: "ivory" | "stone" }) {
  return (
    <section className={`scope surface-${surface} has-grain`} data-surface="light" aria-labelledby="perimetre-title">
      <div className="scope__inner container">
        <header className="scope__head">
          <Tag>Périmètre</Tag>
          <h2 id="perimetre-title" className="display-md" data-reveal="lines">
            Un périmètre <em>clairement défini.</em>
          </h2>
        </header>

        <div className="scope__col">
          <h3 className="label scope__title">Ce que nous faisons</h3>
          <ul className="scope__list">
            {SERVICES.map((s) => (
              <li key={s.slug}>
                <span className="label scope__num">{s.number}</span>
                {s.title}
              </li>
            ))}
          </ul>
        </div>

        <div className="scope__col">
          <h3 className="label scope__title">Ce que nous ne faisons pas</h3>
          <ul className="scope__list scope__list--out">
            {OUT_OF_SCOPE.map((item) => (
              <li key={item}>
                <span className="scope__cross" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
          <p className="scope__note">
            <span className="label">Offre financière</span>
            {FINANCIAL_NOTE}
          </p>
        </div>
      </div>
    </section>
  );
}
