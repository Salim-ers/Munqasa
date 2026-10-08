import "./Logo.css";

/**
 * Logo de l'en-tête : le nom TALAB en capitales serif, comme le nom du pied de
 * page, dans la couleur d'accent de la lumière active (terracotta le jour, or la nuit).
 */
export function Logo({ className }: { className?: string }) {
  return <span className={["logo", className].filter(Boolean).join(" ")}>Talab</span>;
}
