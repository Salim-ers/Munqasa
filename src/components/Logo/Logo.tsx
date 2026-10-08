import "./Logo.css";

interface LogoProps {
  /** "light" = logo terracotta (jour) ; "dark" = logo blanc et or (nuit). */
  tone: "light" | "dark";
  className?: string;
}

/**
 * Logo Talab Solutions — fichiers fournis, jamais redessinés.
 * Les deux versions (jour terracotta, nuit blanc et or) sont empilées : la place
 * réservée est celle de la plus large, l'en-tête ne bouge pas au changement de lumière.
 */
export function Logo({ tone, className }: LogoProps) {
  return (
    <span className={["logo", `logo--${tone}`, className].filter(Boolean).join(" ")} role="img" aria-label="Talab Solutions">
      <span className="logo__set logo__set--day">
        <img className="logo__symbol" src="/logos/talab-day-symbol-sm.webp" width={360} height={193} alt="" />
        <img className="logo__wordmark" src="/logos/talab-day-wordmark-sm.webp" width={640} height={153} alt="" />
      </span>
      <span className="logo__set logo__set--night">
        <img className="logo__symbol" src="/logos/talab-symbol-reversed-sm.webp" width={320} height={189} alt="" />
        <img className="logo__wordmark" src="/logos/talab-wordmark-reversed-sm.webp" width={560} height={176} alt="" />
      </span>
    </span>
  );
}
