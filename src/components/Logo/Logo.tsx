import "./Logo.css";

interface LogoProps {
  /** "light" = logo noir et terracotta (jour) ; "dark" = logo noir, blanc et or (nuit). */
  tone: "light" | "dark";
  className?: string;
}

/**
 * Logo Talab Solutions — fichiers fournis, jamais redessinés.
 * Les deux versions sont empilées : la place réservée est celle de la plus large,
 * l'en-tête ne bouge pas au changement de lumière.
 */
export function Logo({ tone, className }: LogoProps) {
  return (
    <span className={["logo", `logo--${tone}`, className].filter(Boolean).join(" ")} role="img" aria-label="Talab Solutions">
      <span className="logo__set logo__set--day">
        <img className="logo__symbol" src="/logos/talab-day-symbol-sm.webp" width={360} height={224} alt="" />
        <img className="logo__wordmark" src="/logos/talab-day-wordmark-sm.webp" width={640} height={186} alt="" />
      </span>
      <span className="logo__set logo__set--night">
        <img className="logo__symbol" src="/logos/talab-night-symbol-sm.webp" width={360} height={228} alt="" />
        <img className="logo__wordmark" src="/logos/talab-night-wordmark-sm.webp" width={640} height={188} alt="" />
      </span>
    </span>
  );
}
