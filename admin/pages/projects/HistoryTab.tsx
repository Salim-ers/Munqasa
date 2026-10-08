import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { Card, CardHeader } from "../../components/ui/Card";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { api } from "../../lib/api";
import { actionLabel, describeDetails } from "../../lib/audit";
import { formatDateTime, formatRelative } from "../../lib/format";
import type { AuditEntry } from "../../lib/types";

/** Historique de l'affaire : toutes les actions tracées qui la concernent, de la plus récente à la plus ancienne. */
export function HistoryTab({ projectId }: { projectId: string }) {
  const history = useQuery({ queryKey: ["project", projectId, "history"], queryFn: ({ signal }) => api<{ entries: AuditEntry[] }>(`/projects/${projectId}/history`, { signal }) });
  const entries = history.data?.entries ?? [];
  return (
    <Card className="p-5">
      <CardHeader title="Historique" subtitle="Chaque modification est tracée avec sa date et son origine." />
      {history.isPending ? (
        <div className="mt-4 grid gap-3">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState icon={<History className="size-5" />} title="Aucune action enregistrée" />
      ) : (
        <ol className="relative mt-5 ml-1.5 border-l border-line">
          {entries.map((e) => {
            const details = describeDetails(e.details);
            return (
              <li key={e.id} className="relative pb-5 pl-6 last:pb-0">
                <span className="absolute top-1 -left-[5px] size-[9px] rounded-full border-2 border-surface bg-accent" aria-hidden="true" />
                <p className="text-xs font-semibold text-ink">{actionLabel(e.action)}</p>
                {details ? <p className="mt-0.5 text-2xs break-words text-ink-2">{details}</p> : null}
                <p className="mt-0.5 text-2xs text-ink-3" title={formatDateTime(e.occurredAt)}>
                  <time dateTime={e.occurredAt}>{formatRelative(e.occurredAt)}</time>
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
