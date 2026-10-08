import { useEffect, useRef } from "react";
import { cn } from "../../lib/cn";

/**
 * Saisie d'un code à 6 chiffres (application d'authentification). Un seul champ réel :
 * collage, remplissage automatique (one-time-code) et lecteurs d'écran fonctionnent.
 */
export function OtpInput({ value, onChange, onComplete, disabled, autoFocus = true }: { value: string; onChange: (v: string) => void; onComplete?: (v: string) => void; disabled?: boolean; autoFocus?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  const digits = value.padEnd(6, " ").slice(0, 6).split("");
  return (
    <div className="relative" onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, "").slice(0, 6);
          onChange(next);
          if (next.length === 6) onComplete?.(next);
        }}
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="Code à 6 chiffres"
        className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
      />
      <div className="grid grid-cols-6 gap-2" aria-hidden="true">
        {digits.map((d, i) => (
          <div
            key={i}
            className={cn(
              "grid h-13 place-items-center rounded-xl border bg-surface text-xl font-semibold tabular text-ink transition-colors",
              i === Math.min(value.length, 5) && !disabled ? "border-accent shadow-[0_0_0_4px_var(--accent-soft)]" : "border-line-strong",
            )}
          >
            {d.trim()}
          </div>
        ))}
      </div>
    </div>
  );
}
