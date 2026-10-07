import "./Logo.css";

interface LogoProps {
  /** "light" = logo d'origine (fond clair) ; "dark" = version négative. */
  tone: "light" | "dark";
  className?: string;
}

/**
 * Logo MUNAQASA — fichiers fournis, détourés, jamais redessinés.
 * En-tête : symbole + mot-symbole côte à côte. Les deux tons sont superposés
 * pour un fondu propre quand la lumière de la section change.
 */
export function Logo({ tone, className }: LogoProps) {
  return (
    <span className={["logo", `logo--${tone}`, className].filter(Boolean).join(" ")} role="img" aria-label="MUNAQASA">
      <span className="logo__symbol">
        <img className="logo__img logo__img--light" src="/logos/munaqasa-symbol-sm.webp" width={639} height={682} alt="" />
        <img className="logo__img logo__img--dark" src="/logos/munaqasa-symbol-reversed-sm.webp" width={639} height={682} alt="" />
      </span>
      <span className="logo__wordmark">
        <img className="logo__img logo__img--light" src="/logos/munaqasa-wordmark-sm.webp" width={1189} height={179} alt="" />
        <img className="logo__img logo__img--dark" src="/logos/munaqasa-wordmark-reversed-sm.webp" width={1189} height={179} alt="" />
      </span>
    </span>
  );
}
