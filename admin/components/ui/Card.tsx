import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-card border border-line bg-surface shadow-card", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      {/* Sur téléphone, le texte passe à la ligne : une ligne tronquée élargirait la colonne au-delà de l'écran. */}
      <div className="min-w-0">
        <h2 className="text-[0.8125rem] font-semibold break-words text-ink sm:truncate">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-2xs break-words text-ink-3 sm:truncate">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
