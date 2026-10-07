import type { ElementType, ReactNode } from "react";
import "./Tag.css";

interface TagProps {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  /** Repère de couleur avant le texte (point terracotta). */
  dot?: boolean;
}

/** Label technique entre crochets : [ DOSSIER 01 ], [ RC ], [ REV. A ]. */
export function Tag({ children, as: As = "span", className, dot }: TagProps) {
  return (
    <As className={["tag", "label", className].filter(Boolean).join(" ")}>
      <span className="tag__bracket" aria-hidden="true">
        [
      </span>
      {dot && <span className="tag__dot" aria-hidden="true" />}
      <span>{children}</span>
      <span className="tag__bracket" aria-hidden="true">
        ]
      </span>
    </As>
  );
}
