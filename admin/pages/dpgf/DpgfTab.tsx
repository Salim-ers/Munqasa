import { useQuery } from "@tanstack/react-query";
import { Sheet, TableProperties } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { DOCUMENT_STATUS_LABELS } from "../../../shared/enums";
import { JobProgress } from "../../components/JobProgress";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { api } from "../../lib/api";
import { formatDateTime, formatMoney } from "../../lib/format";
import { useJobs } from "../../lib/jobs";
import type { DpgfSummary } from "../../lib/types";
import { DpgfLaunchDialog } from "./DpgfLaunchDialog";
import { DpgfView } from "./DpgfView";

const tone = { brouillon: "neutral", en_generation: "accent", a_valider: "warning", valide: "success", archive: "neutral" } as const;

export function DpgfTab({ projectId }: { projectId: string }) {
  const [params, setParams] = useSearchParams();
  const dpgfId = params.get("dpgf");
  const [launching, setLaunching] = useState(false);
  const jobs = useJobs(projectId);
  const documents = useQuery({ queryKey: ["project", projectId, "dpgf"], queryFn: ({ signal }) => api<{ items: DpgfSummary[] }>(`/projects/${projectId}/dpgf`, { signal }) });
  const runs = (jobs.data?.items ?? []).filter((j) => j.kind === "generation_dpgf").slice(0, 3);

  const open = (id: string | null) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set("dpgf", id);
      else next.delete("dpgf");
      return next;
    });

  if (dpgfId) return <DpgfView projectId={projectId} dpgfId={dpgfId} onBack={() => open(null)} />;

  const items = documents.data?.items ?? [];
  return (
    <div className="grid gap-4">
      <Card className="p-5">
        <CardHeader
          title="DPGF depuis le CCTP"
          subtitle="Postes établis chapitre par chapitre, quantités reprises du métré ; prix saisis ou issus des sous-détails."
          action={
            <Button size="sm" icon={<TableProperties className="size-3.5" />} onClick={() => setLaunching(true)}>
              Établir une DPGF
            </Button>
          }
        />
        {runs.length ? (
          <div className="mt-4 grid gap-3">
            {runs.map((job) => (
              <JobProgress key={job.id} job={job} />
            ))}
          </div>
        ) : null}
      </Card>
      <Card className="overflow-hidden">
        <div className="p-5 pb-4">
          <CardHeader title="Documents" subtitle={items.length ? `${items.length} DPGF` : undefined} />
        </div>
        {documents.isPending ? (
          <div className="px-5 pb-5">
            <Skeleton className="h-14" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={<Sheet className="size-5" />} title="Aucune DPGF" text="Établissez-la à partir d’un CCTP : chaque poste garde son article du CCTP et la source de sa quantité." />
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {items.map((d) => (
              <li key={d.id}>
                <button type="button" onClick={() => open(d.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 text-left hover:bg-surface-2">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-2">
                    <Sheet className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-ink">{d.title}</span>
                    <span className="block truncate text-2xs text-ink-3">
                      {[`${d.postes ?? 0} postes, ${d.priced ?? 0} chiffré(s)`, `modifiée ${formatDateTime(d.updatedAt)}`].join(", ")}
                    </span>
                  </span>
                  <span className="text-xs font-semibold text-ink tabular">{d.totalHt && Number(d.totalHt) > 0 ? `${formatMoney(d.totalHt, d.currency)} HT` : ""}</span>
                  {d.openIssues ? <Badge tone="warning">{d.openIssues} point(s) à vérifier</Badge> : null}
                  <Badge tone={tone[d.status]} dot>
                    {DOCUMENT_STATUS_LABELS[d.status]}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <DpgfLaunchDialog open={launching} onOpenChange={setLaunching} projectId={projectId} />
    </div>
  );
}
