import type { CSSProperties } from "react";
import "./DocSheet.css";

/** Largeurs des lignes de texte abstraites — motif fixe, pas d'aléatoire. */
const LINE_WIDTHS = [94, 88, 97, 72, 90, 84, 95, 60, 91, 86, 78, 93];

interface DocSheetProps {
  /** Référence en tête de page, ex. « Pièce A.04 ». */
  docRef?: string;
  /** Titre court en serif, ex. « RC ». */
  title?: string;
  /** Intercalaire dépassant du bord supérieur. */
  tab?: string;
  lines?: number;
  className?: string;
  style?: CSSProperties;
}

/** Feuille de document abstraite : en-tête, titre, lignes, zone de visa. */
export function DocSheet({ docRef, title, tab, lines = 7, className, style }: DocSheetProps) {
  return (
    <div className={["sheet", className].filter(Boolean).join(" ")} style={style} aria-hidden="true">
      {tab && <span className="sheet__tab label">{tab}</span>}
      <div className="sheet__head">
        <span className="label">{docRef}</span>
        <span className="label">Rev. A</span>
      </div>
      {title && <p className="sheet__title">{title}</p>}
      <div className="sheet__lines">
        {LINE_WIDTHS.slice(0, lines).map((w, i) => (
          <i key={i} style={{ width: `${w}%` }} />
        ))}
      </div>
      <div className="sheet__foot">
        <span className="sheet__visa" />
        <span className="label">Visa</span>
      </div>
    </div>
  );
}
