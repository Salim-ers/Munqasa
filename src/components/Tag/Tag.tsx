import type { ElementType, ReactNode } from "react";
import "./Tag.css";

interface TagProps {
  children: ReactNode;
  as?: ElementType;
  className?: string;
}

/** Petit label technique en capitales, couleur d'accent. */
export function Tag({ children, as: As = "span", className }: TagProps) {
  return <As className={["tag", "label", className].filter(Boolean).join(" ")}>{children}</As>;
}
