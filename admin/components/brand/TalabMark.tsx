import { cn } from "../../lib/cn";

/**
 * Logo Talab Solutions : fichiers fournis, jamais redessinés. Version jour (noir et terracotta)
 * ou nuit (noir, blanc et or) selon la lumière, ou imposée (`tone`) sur un fond sombre.
 * La taille et la visibilité se règlent sur le conteneur (`className`), sans conflit avec la bascule jour / nuit.
 */
export function TalabSymbol({ className, tone }: { className?: string; tone?: "day" | "night" }) {
  return (
    <span className={cn("inline-flex h-8 shrink-0", className)} aria-hidden="true">
      {tone ? (
        <img src={`/logos/talab-${tone}-symbol-sm.webp`} width={360} height={228} alt="" className="h-full w-auto" />
      ) : (
        <>
          <img src="/logos/talab-day-symbol-sm.webp" width={360} height={228} alt="" className="h-full w-auto dark:hidden" />
          <img src="/logos/talab-night-symbol-sm.webp" width={360} height={228} alt="" className="hidden h-full w-auto dark:block" />
        </>
      )}
    </span>
  );
}

export function TalabWordmark({ className, tone }: { className?: string; tone?: "day" | "night" }) {
  return (
    <span className={cn("inline-flex h-7 shrink-0", className)} role="img" aria-label="Talab Solutions">
      {tone ? (
        <img src={`/logos/talab-${tone}-wordmark-sm.webp`} width={640} height={188} alt="" className="h-full w-auto" />
      ) : (
        <>
          <img src="/logos/talab-day-wordmark-sm.webp" width={640} height={188} alt="" className="h-full w-auto dark:hidden" />
          <img src="/logos/talab-night-wordmark-sm.webp" width={640} height={188} alt="" className="hidden h-full w-auto dark:block" />
        </>
      )}
    </span>
  );
}
