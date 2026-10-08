import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

/** En-tête de page : retour éventuel, titre, description, actions. */
export function PageHeader({ title, description, actions, back, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { to: string; label: string }; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6">
      {back ? (
        <Link to={back.to} className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-ink-3 hover:text-ink">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? <div className="mb-1 text-xs font-medium text-ink-3">{eyebrow}</div> : null}
          <h1 className="text-2xl font-semibold tracking-tight text-balance text-ink sm:text-[1.75rem]">{title}</h1>
          {description ? <p className="mt-1 max-w-[70ch] text-xs leading-relaxed text-ink-3">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
