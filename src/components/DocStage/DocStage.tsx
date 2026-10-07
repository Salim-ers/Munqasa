import "./DocStage.css";

interface DocStageProps {
  /** Étape 1 → 7 : page vide, avis, annotations, checklist, assemblage, contrôles, dossier final. */
  step: number;
  className?: string;
  /** Légende « Étape 03 / 07 — Analyse » sous le plateau. */
  caption?: string;
}

const NOTICE_LINES = [96, 88, 92, 70, 94, 83, 90, 64];
/** 03 — lignes où une exigence est relevée (surlignée et numérotée). */
const KEY_LINES = [1, 4, 6];
const CHECK_WIDTHS = [78, 64, 86, 58, 72, 66];

/**
 * Plateau documentaire de la méthode. Chaque calque apparaît à partir d'une
 * étape : les transitions CSS racontent la transformation d'une consultation
 * en dossier structuré.
 */
export function DocStage({ step, className, caption }: DocStageProps) {
  const on = (from: number) => (step >= from ? " is-on" : "");
  return (
    <figure className={["doc-stage", className].filter(Boolean).join(" ")} data-step={step} aria-hidden="true">
      <div className="doc-stage__board">
        {/* 05 — intercalaires assemblés derrière la page */}
        {["C", "B", "A"].map((letter, i) => (
          <div key={letter} className={`ds-sheet ds-stack ds-stack--${i + 1}${on(5)}`}>
            <span className="ds-stack__tab label">{letter}</span>
          </div>
        ))}

        {/* Page principale */}
        <div className={`ds-sheet ds-main${step >= 3 ? " is-annotated" : ""}`}>
          <div className="ds-head">
            <span className="label">Dossier / 01</span>
            <span className="label">Rev. A</span>
          </div>

          {/* 01 — page vide : repères de mise en page */}
          <div className={`ds-blank${step === 1 ? " is-on" : ""}`}>
            <span className="label">Page vierge</span>
          </div>

          {/* 02 — avis de consultation ; 03 — exigences relevées */}
          <div className={`ds-notice${on(2)}`}>
            <span className="ds-notice__kicker label">Avis</span>
            <span className="ds-notice__title">Consultation</span>
            <div className="ds-lines">
              {NOTICE_LINES.map((w, i) => {
                const n = KEY_LINES.indexOf(i) + 1;
                return <i key={i} style={{ width: `${w}%` }} className={n ? "is-key" : undefined} data-n={n || undefined} />;
              })}
            </div>
          </div>
        </div>

        {/* 04 — checklist ; 06 — contrôles */}
        <div className={`ds-sheet ds-check${on(4)}`}>
          <div className="ds-head">
            <span className="label">Checklist</span>
            <span className="label">A.01–06</span>
          </div>
          <ul className="ds-check__rows">
            {CHECK_WIDTHS.map((w, i) => (
              <li
                key={i}
                className={step >= 6 ? "is-checked" : undefined}
                style={{ transitionDelay: step >= 6 ? `${i * 90}ms` : "0ms" }}
              >
                <span className="ds-box">
                  <svg viewBox="0 0 12 12">
                    <path d="M2.5 6.4 5 8.8 9.6 3.4" style={{ transitionDelay: step >= 6 ? `${i * 90}ms` : "0ms" }} />
                  </svg>
                </span>
                <i style={{ width: `${w}%` }} />
              </li>
            ))}
          </ul>
        </div>

        {/* 06 — visa de revue */}
        <div className={`ds-stamp${on(6)}`}>
          <span className="label">Revue</span>
          <span className="ds-stamp__rule" />
          <span className="label">Terminée</span>
        </div>

        {/* 07 — dossier final */}
        <div className={`ds-folder${on(7)}`}>
          <span className="ds-folder__tab label">AO</span>
          <span className="label ds-folder__kicker">Dossier final</span>
          <span className="ds-folder__title">Prêt au dépôt</span>
          <span className="ds-folder__rule" />
          <span className="label ds-folder__meta">Pièces 01 — 08 · Rev. A</span>
        </div>
      </div>
      {caption && <figcaption className="doc-stage__caption label">{caption}</figcaption>}
    </figure>
  );
}
