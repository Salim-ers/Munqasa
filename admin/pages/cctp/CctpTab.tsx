import { useQuery } from "@tanstack/react-query";
import { FileText, PenLine } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { DOCUMENT_STATUS_LABELS } from "../../../shared/enums";
import { CCTP_LEVEL_LABELS } from "../../../shared/schemas";
import { JobProgress } from "../../components/JobProgress";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { api } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { useJobs } from "../../lib/jobs";
import type { CctpDocumentSummary, Lot } from "../../lib/types";
import { CctpDocumentView } from "./CctpDocumentView";
import { CctpLaunchDialog } from "./CctpLaunchDialog";

const tone = { brouillon: "neutral", en_generation: "accent", a_valider: "warning", valide: "success", archive: "neutral" } as const;

export function CctpTab({ projectId, lots }: { projectId: string; lots: Lot[] }) {
  const [params, setParams] = useSearchParams();
  const documentId = params.get("document");
  const [launching, setLaunching] = useState(false);
  const jobs = useJobs(projectId);
  const documents = useQuery({ queryKey: ["project", projectId, "cctp"], queryFn: ({ signal }) => api<{ items: CctpDocumentSummary[] }>(`/projects/${projectId}/cctp`, { signal }) });
  const runs = (jobs.data?.items ?? []).filter((j) => j.kind === "generation_cctp").slice(0, 3);

  const openDocument = (id: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set("document", id);
        else next.delete("document");
        return next;
      },
      { replace: false },
    );

  if (documentId) return <CctpDocumentView projectId={projectId} documentId={documentId} onBack={() => openDocument(null)} />;

  const items = documents.data?.items ?? [];
  return (
    <div className="grid gap-4">
      <Card className="p-5">
        <CardHeader
          title="Rédaction du CCTP"
          subtitle="Plan, puis rédaction chapitre par chapitre, à partir de l’affaire, du métré et de votre référentiel."
          action={
            <Button size="sm" icon={<PenLine className="size-3.5" />} onClick={() => setLaunching(true)}>
              Rédiger un CCTP
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
          <CardHeader title="Documents" subtitle={items.length ? `${items.length} CCTP` : undefined} />
        </div>
        {documents.isPending ? (
          <div className="grid gap-2 px-5 pb-5">
            <Skeleton className="h-14" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={<FileText className="size-5" />} title="Aucun CCTP" text="Lancez la rédaction : le document apparaîtra ici, article par article, prêt à relire, valider et exporter." />
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {items.map((d) => {
              const lot = lots.find((l) => l.id === d.lotId);
              return (
                <li key={d.id}>
                  <button type="button" onClick={() => openDocument(d.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 text-left hover:bg-surface-2">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-2">
                      <FileText className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-ink">{d.title}</span>
                      <span className="block truncate text-2xs text-ink-3">
                        {[lot ? `Lot ${lot.code} ${lot.name}` : null, CCTP_LEVEL_LABELS[d.detailLevel as keyof typeof CCTP_LEVEL_LABELS], `${d.articles ?? 0} articles, ${d.validatedArticles ?? 0} validé(s)`, `modifié ${formatDateTime(d.updatedAt)}`]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    </span>
                    {d.openIssues ? <Badge tone="warning">{d.openIssues} point(s) à vérifier</Badge> : null}
                    <Badge tone={tone[d.status]} dot>
                      {DOCUMENT_STATUS_LABELS[d.status]}
                    </Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <CctpLaunchDialog open={launching} onOpenChange={setLaunching} projectId={projectId} />
    </div>
  );
}
