import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Calculator, Sparkles, TableProperties } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { darkGroup, documentGroup, DownloadMenu } from "../../components/DownloadMenu";
import { JobProgress } from "../../components/JobProgress";
import { QualityPanel } from "../../components/QualityPanel";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { SelectField } from "../../components/ui/Field";
import { api, errorMessage } from "../../lib/api";
import { formatMoney, formatNumber } from "../../lib/format";
import { useJobs } from "../../lib/jobs";
import type { BreakdownList, DpgfSummary } from "../../lib/types";
import { BreakdownDialog } from "./BreakdownDialog";
import { SousDetailLaunchDialog } from "./SousDetailLaunchDialog";
import { breakdownState } from "./state";

/** Onglet Sous-détails d'une affaire : postes d'une DPGF, leur sous-détail, report des prix validés. */
export function SousDetailTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [launching, setLaunching] = useState(false);
  const [openLine, setOpenLine] = useState<string | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);
  const jobs = useJobs(projectId);
  const documents = useQuery({ queryKey: ["project", projectId, "dpgf"], queryFn: ({ signal }) => api<{ items: DpgfSummary[] }>(`/projects/${projectId}/dpgf`, { signal }) });
  const items = documents.data?.items ?? [];
  const dpgf = items.find((d) => d.id === params.get("dpgf")) ?? items[0] ?? null;
  const list = useQuery({
    queryKey: ["project", projectId, "breakdowns", dpgf?.id],
    queryFn: ({ signal }) => api<BreakdownList>(`/dpgf/${dpgf!.id}/breakdowns`, { signal }),
    enabled: Boolean(dpgf),
  });
  const runs = (jobs.data?.items ?? []).filter((j) => j.kind === "sous_detail").slice(0, 3);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["project", projectId] });

  const select = (id: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("dpgf", id);
        return next;
      },
      { replace: true },
    );

  const applyRates = useMutation({
    mutationFn: () => api<{ updated: number }>(`/dpgf/${dpgf!.id}/breakdowns/apply-rates`, { body: {} }),
    onSuccess: (r) => {
      toast.success(r.updated ? `Taux des paramètres appliqués à ${r.updated} sous-détail(s).` : "Aucun sous-détail non validé à mettre à jour.");
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (documents.isPending) return <Skeleton className="h-64" />;
  if (!dpgf) {
    return (
      <Card className="p-6">
        <EmptyState icon={<Calculator className="size-5" />} title="Aucune DPGF" text="Les sous-détails se rattachent aux postes d’une DPGF : établissez-la d’abord dans l’onglet DPGF." />
      </Card>
    );
  }

  const currency = dpgf.currency;
  const postes = list.data?.postes ?? [];
  const withBreakdown = postes.filter((p) => p.breakdown).length;
  const validated = postes.filter((p) => p.breakdown?.locked).length;
  const toApply = postes.filter((p) => p.breakdown?.locked && p.breakdown.computedUnitPrice !== null && (p.line.unitPrice === null || Number(p.line.unitPrice) !== Number(p.breakdown.computedUnitPrice))).length;
  const entry = postes.find((p) => p.line.id === openLine) ?? null;

  return (
    <div className="grid gap-4">
      <Card className="p-5">
        <CardHeader
          title="Sous-détails de prix"
          subtitle="Chaque coût vient d’un prix de votre bibliothèque ; les consommations proposées par l’agent restent des hypothèses jusqu’à ce que vous les modifiiez ou validiez le sous-détail."
          action={
            <Button size="sm" icon={<Sparkles className="size-3.5" />} onClick={() => setLaunching(true)}>
              Lancer l’agent
            </Button>
          }
        />
        {items.length > 1 ? (
          <SelectField label="DPGF" className="mt-4 max-w-md" options={items.map((d) => ({ value: d.id, label: `${d.title}, ${d.postes ?? 0} postes` }))} value={dpgf.id} onChange={(e) => select(e.target.value)} />
        ) : null}
        {runs.length ? (
          <div className="mt-4 grid gap-3">
            {runs.map((job) => (
              <JobProgress key={job.id} job={job} />
            ))}
          </div>
        ) : null}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <Card className="min-w-0 overflow-hidden">
          <div className="p-5 pb-3">
            <CardHeader title={dpgf.title} subtitle={postes.length ? `${withBreakdown} sous-détail(s) sur ${postes.length} postes, ${validated} validé(s)` : undefined} />
          </div>
          {list.isPending ? (
            <div className="grid gap-2 px-5 pb-5">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : postes.length === 0 ? (
            <EmptyState title="Aucun poste" text="Ajoutez des postes à la DPGF pour en établir les sous-détails." />
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {postes.map(({ line, breakdown }) => {
                const state = breakdownState(breakdown);
                return (
                  <li key={line.id}>
                    <button type="button" onClick={() => setOpenLine(line.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3 text-left hover:bg-surface-2">
                      <span className="w-10 shrink-0 text-xs font-semibold text-ink-2 tabular">{line.code}</span>
                      <span className="min-w-0 flex-1 basis-48">
                        <span className="block text-xs font-semibold text-ink">{line.designation}</span>
                        <span className="block text-2xs text-ink-3">
                          {[line.quantity !== null ? `${formatNumber(line.quantity)} ${line.unit ?? ""}`.trim() : "quantité à métrer", breakdown ? `${breakdown.components.length} composant(s)` : null].filter(Boolean).join(", ")}
                        </span>
                      </span>
                      <span className="ml-14 text-left sm:ml-0 sm:text-right">
                        <span className="block text-xs font-semibold text-ink tabular">{breakdown?.computedUnitPrice ? formatMoney(breakdown.computedUnitPrice, currency) : breakdown ? "à compléter" : ""}</span>
                        <span className="block text-2xs text-ink-3">{line.unitPrice !== null ? `DPGF ${formatMoney(line.unitPrice, currency)}` : "DPGF non chiffrée"}</span>
                      </span>
                      <Badge tone={state.tone} dot>
                        {state.label}
                      </Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="grid content-start gap-4">
          <Card className="p-5">
            <CardHeader title="Report dans la DPGF" subtitle="Seuls les sous-détails validés sont reportés." />
            <div className="mt-4 grid gap-2">
              <Button icon={<ArrowRightLeft className="size-4" />} disabled={toApply === 0} onClick={() => setConfirmApply(true)}>
                {toApply ? `Reporter ${toApply} prix validé(s)` : "Aucun prix à reporter"}
              </Button>
              <Button variant="secondary" icon={<Calculator className="size-4" />} loading={applyRates.isPending} disabled={withBreakdown === validated} onClick={() => applyRates.mutate()}>
                Appliquer les taux des paramètres
              </Button>
              <DownloadMenu size="md" align="start" label="Télécharger les sous-détails" groups={[documentGroup(undefined, "sous_details", dpgf.id, ["xlsx", "pdf"]), darkGroup("sous_details", dpgf.id, ["pdf"])]} />
              <Link to={`?onglet=dpgf&dpgf=${dpgf.id}`} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[0.8125rem] font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink">
                <TableProperties className="size-4" aria-hidden="true" />
                Ouvrir la DPGF
              </Link>
            </div>
            <p className="mt-3 text-2xs leading-relaxed text-ink-3">Les taux des paramètres remplacent ceux des sous-détails non validés ; les sous-détails validés gardent les leurs.</p>
          </Card>
          <QualityPanel issues={list.data?.issues ?? []} onChanged={refresh} onSelectTarget={(id) => setOpenLine(id)} />
        </div>
      </div>

      <BreakdownDialog projectId={projectId} currency={currency} entry={entry} onOpenChange={(v) => !v && setOpenLine(null)} />
      <SousDetailLaunchDialog open={launching} onOpenChange={setLaunching} projectId={projectId} dpgfId={dpgf.id} />
      <ConfirmDialog
        open={confirmApply}
        onOpenChange={setConfirmApply}
        title="Reporter les prix validés ?"
        text={`Le prix de ${toApply} sous-détail(s) validé(s) remplace le prix unitaire des postes correspondants de la DPGF, qui repassent à vérifier.`}
        confirmLabel="Reporter"
        onConfirm={async () => {
          try {
            const r = await api<{ applied: number }>(`/dpgf/${dpgf.id}/apply-breakdowns`, { body: {} });
            toast.success(r.applied ? `${r.applied} prix reporté(s) dans la DPGF.` : "Aucun nouveau prix à reporter.");
            refresh();
          } catch (error) {
            toast.error(errorMessage(error));
            throw error;
          }
        }}
      />
    </div>
  );
}
