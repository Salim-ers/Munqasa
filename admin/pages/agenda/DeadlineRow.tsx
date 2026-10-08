import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { DEADLINE_KIND_LABELS } from "../../../shared/enums";
import { Badge } from "../../components/ui/Badge";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { ActionMenu } from "../../components/ui/Menu";
import { api, errorMessage } from "../../lib/api";
import { cn } from "../../lib/cn";
import { formatRelative } from "../../lib/format";
import type { Deadline } from "../../lib/types";

const dayFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric" });
const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "short" });
const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

function DateBlock({ date, tone }: { date: Date; tone?: "accent" | "danger" | "muted" }) {
  return (
    <div
      className={cn(
        "grid w-14 shrink-0 place-items-center rounded-xl py-1.5 text-center",
        tone === "accent" ? "bg-accent text-on-accent" : tone === "danger" ? "bg-danger-soft text-danger" : tone === "muted" ? "bg-surface-2 text-ink-3" : "bg-surface-2 text-ink",
      )}
    >
      <span className="text-lg leading-none font-semibold tabular">{dayFmt.format(date)}</span>
      <span className="mt-0.5 text-2xs leading-none font-medium uppercase">{monthFmt.format(date).replace(".", "")}</span>
      <span className="mt-1 text-2xs leading-none tabular opacity-80">{timeFmt.format(date)}</span>
    </div>
  );
}

/** Date de remise d'une affaire (lue sur l'affaire, jamais recopiée). */
export function SubmissionRow({ item, hideProject = false }: { item: { id: string; reference: string; name: string; dueAt: string }; hideProject?: boolean }) {
  const due = new Date(item.dueAt);
  const past = due.getTime() < Date.now();
  return (
    <li className="flex items-center gap-4 px-5 py-3">
      <DateBlock date={due} tone={past ? "muted" : "accent"} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-ink">{DEADLINE_KIND_LABELS.remise}</p>
        {hideProject ? null : (
          <Link to={`/administration/affaires/${item.id}`} className="mt-0.5 block truncate text-2xs font-medium text-ink-2 hover:text-accent">
            {item.reference}, {item.name}
          </Link>
        )}
        <p className="mt-0.5 text-2xs text-ink-3 first-letter:uppercase">{formatRelative(item.dueAt)}</p>
      </div>
    </li>
  );
}

export function DeadlineRow({ deadline, onEdit, onChanged, hideProject = false }: { deadline: Deadline; onEdit: () => void; onChanged?: () => void; hideProject?: boolean }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const due = new Date(deadline.dueAt);
  const done = Boolean(deadline.doneAt);
  const overdue = !done && due.getTime() < Date.now();

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["deadlines"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    if (deadline.projectId) void queryClient.invalidateQueries({ queryKey: ["project", deadline.projectId] });
    onChanged?.();
  };

  const toggle = useMutation({
    mutationFn: () => api(`/deadlines/${deadline.id}/done`, { body: { done: !done } }),
    onSuccess: () => {
      toast.success(done ? "Échéance rouverte." : "Échéance marquée comme faite.");
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <li className={cn("flex items-center gap-4 px-5 py-3", done && "opacity-60")}>
      <DateBlock date={due} tone={done ? "muted" : overdue ? "danger" : undefined} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn("text-xs font-semibold text-ink", done && "line-through")}>{deadline.title}</p>
          {/* Le type n'est rappelé que s'il apporte une information au titre. */}
          {deadline.title.trim().toLowerCase() !== (DEADLINE_KIND_LABELS[deadline.kind] ?? "").toLowerCase() ? <Badge>{DEADLINE_KIND_LABELS[deadline.kind] ?? deadline.kind}</Badge> : null}
          {overdue ? <Badge tone="danger">En retard</Badge> : null}
        </div>
        {!hideProject && deadline.projectId ? (
          <Link to={`/administration/affaires/${deadline.projectId}?onglet=echeances`} className="mt-0.5 block truncate text-2xs font-medium text-ink-2 hover:text-accent">
            {[deadline.projectReference, deadline.projectName].filter(Boolean).join(", ")}
          </Link>
        ) : null}
        <p className="mt-0.5 text-2xs text-ink-3 first-letter:uppercase">{done ? "Faite" : formatRelative(deadline.dueAt)}</p>
        {deadline.notes ? <p className="mt-1 line-clamp-2 text-2xs whitespace-pre-line text-ink-3">{deadline.notes}</p> : null}
      </div>
      <button
        type="button"
        onClick={() => toggle.mutate()}
        disabled={toggle.isPending}
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-xl border transition-colors",
          done ? "border-success bg-success text-white" : "border-line-strong text-ink-3 hover:border-success hover:text-success",
        )}
        aria-label={done ? "Rouvrir l’échéance" : "Marquer comme faite"}
        aria-pressed={done}
      >
        <Check className="size-4" aria-hidden="true" />
      </button>
      <ActionMenu
        actions={[
          { label: "Modifier", icon: <Pencil />, onSelect: onEdit },
          { label: "Supprimer", icon: <Trash2 />, tone: "danger", onSelect: () => setConfirming(true) },
        ]}
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Supprimer cette échéance ?"
        text={`« ${deadline.title} » sera supprimée. Les rappels associés ne seront plus envoyés.`}
        confirmLabel="Supprimer"
        onConfirm={async () => {
          try {
            await api(`/deadlines/${deadline.id}`, { method: "DELETE" });
            toast.success("Échéance supprimée.");
            refresh();
          } catch (error) {
            toast.error(errorMessage(error));
            throw error;
          }
        }}
      />
    </li>
  );
}
