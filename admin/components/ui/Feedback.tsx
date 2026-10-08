import { animate, useInView, useMotionValue, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn";

/** Bloc de chargement aux dimensions du contenu attendu. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-surface-3", className)} aria-hidden="true" />;
}

/** État vide explicite : aucune donnée fictive, une explication et, si utile, une action. */
export function EmptyState({ icon, title, text, action, className }: { icon?: ReactNode; title: string; text?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-8 text-center", className)}>
      {icon ? <div className="mb-1 grid size-10 place-items-center rounded-xl bg-surface-2 text-ink-3">{icon}</div> : null}
      <p className="text-[0.8125rem] font-semibold text-ink">{title}</p>
      {text ? <p className="max-w-[36ch] text-xs leading-relaxed text-ink-3">{text}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Compteur animé jusqu'à sa valeur réelle (immédiat si le mouvement est réduit). */
export function AnimatedNumber({ value, format = (n) => new Intl.NumberFormat("fr-FR").format(Math.round(n)), className }: { value: number; format?: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduced = useReducedMotion();
  const motionValue = useMotionValue(0);
  const [text, setText] = useState(() => format(reduced ? value : 0));

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setText(format(value));
      return;
    }
    const controls = animate(motionValue, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => setText(format(v)) });
    return () => controls.stop();
  }, [inView, value, reduced, motionValue, format]);

  return (
    <span ref={ref} className={cn("tabular", className)}>
      {text}
    </span>
  );
}

export function InlineError({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-xl border border-danger/20 bg-danger-soft px-3.5 py-2.5 text-xs font-medium text-danger">
      {children}
    </div>
  );
}
