import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ChevronDown, Coins, FileStack, Layers, Pencil, TriangleAlert } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { PROJECT_STATUS_LABELS, PROJECT_STATUSES, type ProjectStatus } from "../../../shared/enums";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { PageHeader } from "../../components/ui/PageHeader";
import { TabPanel, Tabs } from "../../components/ui/Tabs";
import { api, ApiError, errorMessage } from "../../lib/api";
import { cn } from "../../lib/cn";
import { formatFullDateTime, formatMoney, formatRelative } from "../../lib/format";
import type { ProjectDetail } from "../../lib/types";
import { DeadlinesTab } from "./DeadlinesTab";
import { FilesTab } from "./FilesTab";
import { HistoryTab } from "./HistoryTab";
import { LotsTab } from "./LotsTab";
import { MetreTab } from "./MetreTab";
import { OverviewTab } from "./OverviewTab";
import { ProjectFormDialog } from "./ProjectFormDialog";

const TABS = ["synthese", "lots", "echeances", "documents", "metre", "historique"] as const;
type Tab = (typeof TABS)[number];

export function ProjectDetailPage() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get("onglet") ?? "") ? (params.get("onglet") as Tab) : "synthese";
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const detail = useQuery({ queryKey: ["project", id], queryFn: ({ signal }) => api<ProjectDetail>(`/projects/${id}`, { signal }) });

  // « Reprendre mon travail » : la dernière ouverture classe l'affaire en tête du tableau de bord.
  useEffect(() => {
    if (!id) return;
    api(`/projects/${id}/open`, { body: {} })
      .then(() => queryClient.invalidateQueries({ queryKey: ["dashboard"] }))
      .catch(() => undefined);
  }, [id, queryClient]);

  const changeStatus = useMutation({
    mutationFn: (status: ProjectStatus) => api(`/projects/${id}`, { method: "PATCH", body: { status } }),
    onSuccess: (_, status) => {
      void queryClient.invalidateQueries({ queryKey: ["project", id] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`Statut : ${PROJECT_STATUS_LABELS[status]}.`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (detail.isError) {
    const notFound = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <Card className="mx-auto max-w-xl p-6">
        <EmptyState
          icon={<TriangleAlert className="size-5" />}
          title={notFound ? "Affaire introuvable" : "Affaire indisponible"}
          text={notFound ? "Cette affaire n’existe pas ou plus." : "La fiche n’a pas pu être chargée."}
          action={
            <Link to="/administration/affaires" className="text-xs font-semibold text-accent hover:underline">
              Retour aux affaires
            </Link>
          }
        />
      </Card>
    );
  }

  const data = detail.data;
  const project = data?.project;
  const fileCount = data?.fileCounts.reduce((acc, f) => acc + f.count, 0) ?? 0;
  const pendingDeadlines = data?.deadlines.filter((d) => !d.doneAt).length ?? 0;

  return (
    <div className="mx-auto max-w-[96rem]">
      <PageHeader
        back={{ to: "/administration/affaires", label: "Mes affaires" }}
        eyebrow={project ? [project.reference, data?.client?.name].filter(Boolean).join(", ") : <Skeleton className="h-4 w-40" />}
        title={project ? project.name : <Skeleton className="h-8 w-80 max-w-full" />}
        actions={
          project ? (
            <>
              <label className="sr-only" htmlFor="statut-affaire">
                Statut de l’affaire
              </label>
              <div className="relative">
                <select
                  id="statut-affaire"
                  value={project.status}
                  disabled={changeStatus.isPending}
                  onChange={(e) => changeStatus.mutate(e.target.value as ProjectStatus)}
                  className="h-10 appearance-none rounded-xl border border-line-strong bg-surface pr-9 pl-3 text-xs font-semibold text-ink outline-none focus:border-accent"
                >
                  {PROJECT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {PROJECT_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden="true" />
              </div>
              <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
                Modifier
              </Button>
            </>
          ) : null
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={<CalendarClock />}
          label="Remise des offres"
          value={project ? (project.submissionDeadline ? formatRelative(project.submissionDeadline) : "Non fixée") : undefined}
          note={project?.submissionDeadline ? formatFullDateTime(project.submissionDeadline) : undefined}
          tone={project?.submissionDeadline && new Date(project.submissionDeadline).getTime() - Date.now() < 3 * 86_400_000 && new Date(project.submissionDeadline).getTime() > Date.now() ? "danger" : undefined}
        />
        <Kpi icon={<Layers />} label="Lots" value={data ? String(data.lots.length) : undefined} note={data ? `${pendingDeadlines} échéance${pendingDeadlines > 1 ? "s" : ""} à venir` : undefined} />
        <Kpi icon={<FileStack />} label="Documents vérifiés" value={data ? String(fileCount) : undefined} note="Plans et pièces du dossier" />
        <Kpi
          icon={<Coins />}
          label="Estimation"
          value={project ? (project.manualEstimate ? formatMoney(project.manualEstimate, project.currency) : "Non estimée") : undefined}
          note={project ? `Hors taxes, en ${project.currency}` : undefined}
        />
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) =>
          setParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              if (v === "synthese") next.delete("onglet");
              else next.set("onglet", v);
              return next;
            },
            { replace: true },
          )
        }
        items={[
          { value: "synthese", label: "Synthèse" },
          { value: "lots", label: "Lots", count: data?.lots.length },
          { value: "echeances", label: "Échéances", count: data ? data.deadlines.length + (project?.submissionDeadline ? 1 : 0) : undefined },
          { value: "documents", label: "Documents", count: data ? fileCount : undefined },
          { value: "metre", label: "Plans et métré" },
          { value: "historique", label: "Historique" },
        ]}
      >
        {data ? (
          <>
            <TabPanel value="synthese">
              <OverviewTab detail={data} onEdit={() => setEditing(true)} />
            </TabPanel>
            <TabPanel value="lots">
              <LotsTab projectId={id} lots={data.lots} />
            </TabPanel>
            <TabPanel value="echeances">
              <DeadlinesTab project={data.project} deadlines={data.deadlines} />
            </TabPanel>
            <TabPanel value="documents">
              <FilesTab projectId={id} />
            </TabPanel>
            <TabPanel value="metre">
              <MetreTab projectId={id} lots={data.lots} />
            </TabPanel>
            <TabPanel value="historique">
              <HistoryTab projectId={id} />
            </TabPanel>
          </>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-64 lg:col-span-2" />
            <Skeleton className="h-64" />
          </div>
        )}
      </Tabs>

      {project ? <ProjectFormDialog open={editing} onOpenChange={setEditing} project={project} client={data?.client} /> : null}
    </div>
  );
}

function Kpi({ icon, label, value, note, tone }: { icon: ReactNode; label: string; value: string | undefined; note?: string; tone?: "danger" }) {
  return (
    <Card className="flex min-h-[6.5rem] flex-col justify-between gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xs font-semibold text-ink-3">{label}</p>
        <span className={cn("grid size-7 place-items-center rounded-lg [&_svg]:size-3.5 [&_svg]:stroke-[1.75]", tone === "danger" ? "bg-danger-soft text-danger" : "bg-surface-2 text-ink-2")}>
          {icon}
        </span>
      </div>
      <div className="min-w-0">
        {value === undefined ? (
          <Skeleton className="h-6 w-20" />
        ) : (
          <p className={cn("truncate text-base leading-tight font-semibold first-letter:uppercase sm:text-lg", tone === "danger" ? "text-danger" : "text-ink")} title={value}>
            {value}
          </p>
        )}
        {note ? <p className="mt-0.5 truncate text-2xs text-ink-3">{note}</p> : null}
      </div>
    </Card>
  );
}
