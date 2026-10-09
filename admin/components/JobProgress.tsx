import { ChevronDown, CircleAlert, CircleCheck, CircleDashed, CircleSlash, LoaderCircle, RotateCcw, Square } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { JOB_STATUS_LABELS } from "../../shared/enums";
import { errorMessage } from "../lib/api";
import { cn } from "../lib/cn";
import { formatDateTime, formatRelative } from "../lib/format";
import { isActive, type Job, useJobAction } from "../lib/jobs";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";

const statusTone = { en_attente: "neutral", en_cours: "accent", termine: "success", echoue: "danger", annule: "neutral" } as const;

/** Suivi d'un traitement : progression, étapes, journal, annulation ou reprise. */
export function JobProgress({ job, defaultOpen = false, showProject = false }: { job: Job; defaultOpen?: boolean; showProject?: boolean }) {
  const [open, setOpen] = useState(defaultOpen || isActive(job));
  const action = useJobAction();
  const ratio = job.progress.total ? job.progress.done / job.progress.total : 0;
  const current = job.steps.find((s) => s.status === "en_cours");

  const run = (kind: "cancel" | "retry") =>
    action.mutate(
      { id: job.id, action: kind },
      { onSuccess: () => toast.success(kind === "cancel" ? "Annulation demandée." : "Traitement relancé."), onError: (e) => toast.error(errorMessage(e)) },
    );

  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold text-ink">{job.title}</p>
            <Badge tone={statusTone[job.status]} dot>
              {job.stalled && isActive(job) ? "Reprise en cours" : JOB_STATUS_LABELS[job.status]}
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-2xs text-ink-3">
            {[showProject && job.project ? `${job.project.reference}, ${job.project.name}` : null, `lancé ${formatRelative(job.createdAt)}`, current ? current.label : null].filter(Boolean).join(", ")}
          </p>
        </div>
        {isActive(job) ? (
          <Button size="sm" variant="ghost" icon={<Square className="size-3.5" />} loading={action.isPending} onClick={() => run("cancel")}>
            Arrêter
          </Button>
        ) : job.status === "echoue" ? (
          <Button size="sm" variant="secondary" icon={<RotateCcw className="size-3.5" />} loading={action.isPending} onClick={() => run("retry")}>
            Reprendre
          </Button>
        ) : null}
        <button type="button" onClick={() => setOpen((v) => !v)} className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink" aria-expanded={open} aria-label={open ? "Masquer les étapes" : "Afficher les étapes"}>
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
      </div>
      <div className="px-4 pb-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Progression">
          <div
            className={cn("h-full rounded-full transition-[width] duration-500", job.status === "echoue" ? "bg-danger" : job.status === "termine" ? "bg-success" : "bg-accent", isActive(job) && "animate-pulse")}
            style={{ width: `${Math.max(job.status === "termine" ? 100 : 4, ratio * 100)}%` }}
          />
        </div>
        <p className="mt-1.5 text-2xs text-ink-3 tabular">
          {job.progress.done} étape{job.progress.done > 1 ? "s" : ""} sur {job.progress.total}
        </p>
        {job.error ? <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-2xs leading-relaxed text-danger">{job.error}</p> : null}
      </div>
      {open ? (
        <ol className="border-t border-line px-4 py-3">
          {job.steps.map((s) => (
            <li key={s.id} className="flex gap-2.5 py-1.5">
              <span className={cn("mt-0.5 shrink-0 [&_svg]:size-3.5", s.status === "termine" ? "text-success" : s.status === "echoue" ? "text-danger" : s.status === "en_cours" ? "text-accent" : "text-ink-3")}>
                {s.status === "termine" ? <CircleCheck /> : s.status === "echoue" ? <CircleAlert /> : s.status === "en_cours" ? <LoaderCircle className="animate-spin" /> : s.status === "ignore" ? <CircleSlash /> : <CircleDashed />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-2xs", s.status === "en_attente" || s.status === "ignore" ? "text-ink-3" : "font-medium text-ink")}>{s.label}</p>
                {s.log.length ? (
                  <ul className="mt-0.5 grid gap-0.5">
                    {s.log.slice(-4).map((l, i) => (
                      <li key={i} className="text-2xs leading-relaxed text-ink-3">
                        {l.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {s.error && s.status === "echoue" ? <p className="mt-0.5 text-2xs text-danger">{s.error}</p> : null}
              </div>
              {s.finishedAt ? <span className="shrink-0 text-2xs text-ink-3 tabular">{formatDateTime(s.finishedAt)}</span> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
