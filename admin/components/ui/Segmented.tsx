import { motion } from "motion/react";
import { useId } from "react";
import { cn } from "../../lib/cn";

/** Choix exclusif compact (filtres). L'indicateur glisse d'une option à l'autre. */
export function Segmented<V extends string>({ value, onChange, options, label, className }: { value: V; onChange: (value: V) => void; options: ReadonlyArray<{ value: V; label: string }>; label: string; className?: string }) {
  const layoutId = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex max-w-full gap-0.5 overflow-x-auto rounded-xl bg-surface-3 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn("relative h-8 shrink-0 rounded-lg px-3 text-xs font-semibold transition-colors", active ? "text-ink" : "text-ink-3 hover:text-ink-2")}
          >
            {active ? <motion.span layoutId={layoutId} className="absolute inset-0 rounded-lg bg-surface shadow-card" transition={{ type: "spring", stiffness: 420, damping: 34 }} aria-hidden="true" /> : null}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
