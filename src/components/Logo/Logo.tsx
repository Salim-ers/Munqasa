import "./Logo.css";

interface LogoProps {
  /** "light" = logo d'origine (fond clair) ; "dark" = version négative. */
  tone: "light" | "dark";
  className?: string;
}

/**
 * Logo Talab Solutions — fichier fourni, jamais redessiné.
 * En-tête : symbole (bâtiment, palmier, olivier) et mot-symbole côte à côte.
 * Les deux tons sont superposés pour un fondu propre au changement de lumière.
 */
export function Logo({ tone, className }: LogoProps) {
  return (
    <span className={["logo", `logo--${tone}`, className].filter(Boolean).join(" ")} role="img" aria-label="Talab Solutions">
      <span className="logo__symbol">
        <img className="logo__img logo__img--light" src="/logos/talab-symbol-sm.webp" width={662} height={391} alt="" />
        <img className="logo__img logo__img--dark" src="/logos/talab-symbol-reversed-sm.webp" width={662} height={391} alt="" />
      </span>
      <span className="logo__wordmark">
        <img className="logo__img logo__img--light" src="/logos/talab-wordmark-sm.webp" width={790} height={248} alt="" />
        <img className="logo__img logo__img--dark" src="/logos/talab-wordmark-reversed-sm.webp" width={790} height={248} alt="" />
      </span>
    </span>
  );
}
