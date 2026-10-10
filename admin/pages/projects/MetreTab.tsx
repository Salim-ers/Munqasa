import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Eye, Layers3, Pencil, Plus, RotateCcw, ScanLine, Sparkles, Trash2, TriangleAlert, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { DRAWING_KIND_LABELS, MEASURE_SOURCE_LABELS, VALIDATION_STATUS_LABELS } from "../../../shared/enums";
import { workItemInput } from "../../../shared/schemas";
import { documentGroup, DownloadMenu } from "../../components/DownloadMenu";
import { JobProgress } from "../../components/JobProgress";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { ConfirmDialog, Modal } from "../../components/ui/Dialog";
import { EmptyState, InlineError, Skeleton } from "../../components/ui/Feedback";
import { Field, SelectField, TextareaField } from "../../components/ui/Field";
import { ActionMenu } from "../../components/ui/Menu";
import { api, ApiError, errorMessage } from "../../lib/api";
import { cn } from "../../lib/cn";
import { formatNumber } from "../../lib/format";
import { useJobs } from "../../lib/jobs";
import type { Drawing, Lot, Measurement, WorkItem } from "../../lib/types";
import { PlanAnalysisDialog } from "../agents/PlanAnalysisDialog";
import { MeasurementDialog } from "./MeasurementDialog";

const statusTone = { a_verifier: "warning", verifie: "success", rejete: "neutral" } as const;

/** Somme des mesures retenues (non rejetées), par unité. */
function totals(item: WorkItem): string {
  const sums = new Map<string, number>();
  for (const m of item.measurements) {
    if (m.status === "rejete" || m.quantity === null) continue;
    sums.set(m.unit, (sums.get(m.unit) ?? 0) + Number(m.quantity));
  }
  return [...sums].map(([unit, value]) => `${formatNumber(value)} ${unit}`).join(", ");
}

export function MetreTab({ projectId, lots }: { projectId: string; lots: Lot[] }) {
  const queryClient = useQueryClient();
  const [launching, setLaunching] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkItem | null | undefined>(undefined);
  const [measureFor, setMeasureFor] = useState<{ item: WorkItem; measurement: Measurement | null } | null>(null);
  const [deleting, setDeleting] = useState<{ kind: "item" | "measurement"; id: string; label: string } | null>(null);
  const [viewing, setViewing] = useState<Drawing | null>(null);

  const jobs = useJobs(projectId);
  const drawings = useQuery({ queryKey: ["project", projectId, "drawings"], queryFn: ({ signal }) => api<{ items: Drawing[] }>(`/projects/${projectId}/drawings`, { signal }) });
  const metre = useQuery({ queryKey: ["project", projectId, "metre"], queryFn: ({ signal }) => api<{ workItems: WorkItem[]; orphanMeasurements: Measurement[] }>(`/projects/${projectId}/metre`, { signal }) });
  const analyses = (jobs.data?.items ?? []).filter((j) => j.kind === "analyse_plans").slice(0, 2);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
  const validate = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "verifie" | "a_verifier" | "rejete" }) => api(`/measurements/${id}/validate`, { body: { status } }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });

  const items = metre.data?.workItems ?? [];
  const pages = drawings.data?.items ?? [];
  const toVerify = items.reduce((n, item) => n + item.measurements.filter((m) => m.status === "a_verifier").length, 0);

  return (
    <div className="grid gap-4">
      <Card className="p-5">
        <CardHeader
          title="Lecture des plans"
          subtitle="L’agent relève les éléments de gros œuvre de chaque page et propose le métré."
          action={
            <div className="flex flex-wrap justify-end gap-2">
              <DownloadMenu
                groups={[
                  documentGroup("Note de métrés", "metre", projectId, ["xlsx", "docx", "pdf"]),
                  documentGroup("Rapport d’analyse des plans", "analyse", projectId, ["docx", "pdf"]),
                ]}
              />
              <Button size="sm" icon={<ScanLine className="size-3.5" />} onClick={() => setLaunching(true)}>
                Lancer la lecture
              </Button>
            </div>
          }
        />
        {analyses.length ? (
          <div className="mt-4 grid gap-3">
            {analyses.map((job) => (
              <JobProgress key={job.id} job={job} />
            ))}
          </div>
        ) : null}
      </Card>

      <Card className="p-5">
        <CardHeader title="Planches lues" subtitle={pages.length ? `${pages.filter((p) => p.analysed).length} page(s) analysée(s)` : undefined} />
        {drawings.isPending ? (
          <Skeleton className="mt-4 h-24" />
        ) : pages.length === 0 ? (
          <EmptyState icon={<Layers3 className="size-5" />} title="Aucune planche lue" text="Déposez vos plans dans l’onglet Documents, puis lancez la lecture." />
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pages.map((d) => (
              <li key={d.id}>
                <button type="button" onClick={() => setViewing(d)} className="flex h-full w-full flex-col rounded-xl border border-line p-3.5 text-left transition-colors hover:bg-surface-2">
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-ink">{d.title ?? d.fileName}</span>
                      <span className="block truncate text-2xs text-ink-3">{[d.fileName, `page ${d.pageNumber}`].join(", ")}</span>
                    </span>
                    <Eye className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
                  </span>
                  <span className="mt-3 flex flex-wrap gap-1.5">
                    {d.analysed ? (
                      <>
                        <Badge>{DRAWING_KIND_LABELS[d.kind]}</Badge>
                        {d.level ? <Badge>{d.level}</Badge> : null}
                        {d.scaleText ? <Badge>{d.scaleText}</Badge> : null}
                        <Badge tone="accent">{d.elementCount} élément(s)</Badge>
                        {d.readable === false ? <Badge tone="warning">Non exploitable</Badge> : null}
                        {d.uncertainties.length ? <Badge tone="warning">{d.uncertainties.length} incertitude(s)</Badge> : null}
                      </>
                    ) : (
                      <Badge>Pas encore lue</Badge>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="p-5 pb-4">
          <CardHeader
            title="Métré"
            subtitle={items.length ? `${items.length} ouvrage(s), ${toVerify} mesure(s) à vérifier` : "Ouvrages et quantités, chacune avec sa formule et sa source"}
            action={
              <Button size="sm" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => setEditingItem(null)}>
                Ajouter un ouvrage
              </Button>
            }
          />
        </div>
        {metre.isPending ? (
          <div className="grid gap-2 px-5 pb-5">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={<Sparkles className="size-5" />} title="Aucun ouvrage" text="La lecture des plans propose les ouvrages et leurs métrés ; vous pouvez aussi les saisir." />
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {items.map((item) => (
              <WorkItemRow
                key={item.id}
                item={item}
                onEdit={() => setEditingItem(item)}
                onDelete={() => setDeleting({ kind: "item", id: item.id, label: item.designation })}
                onAddMeasure={() => setMeasureFor({ item, measurement: null })}
                onEditMeasure={(m) => setMeasureFor({ item, measurement: m })}
                onDeleteMeasure={(m) => setDeleting({ kind: "measurement", id: m.id, label: m.label })}
                onValidate={(id, status) => validate.mutate({ id, status })}
              />
            ))}
          </ul>
        )}
      </Card>

      <PlanAnalysisDialog open={launching} onOpenChange={setLaunching} projectId={projectId} />
      <WorkItemDialog open={editingItem !== undefined} onOpenChange={(open) => !open && setEditingItem(undefined)} projectId={projectId} item={editingItem ?? null} lots={lots} />
      <MeasurementDialog open={measureFor !== null} onOpenChange={(open) => !open && setMeasureFor(null)} projectId={projectId} item={measureFor?.item ?? null} measurement={measureFor?.measurement} drawings={pages} />
      <DrawingDialog drawing={viewing} onOpenChange={(open) => !open && setViewing(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={deleting?.kind === "item" ? "Supprimer cet ouvrage ?" : "Supprimer cette mesure ?"}
        text={deleting ? `« ${deleting.label} »${deleting.kind === "item" ? " et ses mesures seront supprimés." : " sera supprimée."}` : ""}
        confirmLabel="Supprimer"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await api(deleting.kind === "item" ? `/work-items/${deleting.id}` : `/measurements/${deleting.id}`, { method: "DELETE" });
            toast.success("Supprimé.");
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

function WorkItemRow({
  item,
  onEdit,
  onDelete,
  onAddMeasure,
  onEditMeasure,
  onDeleteMeasure,
  onValidate,
}: {
  item: WorkItem;
  onEdit: () => void;
  onDelete: () => void;
  onAddMeasure: () => void;
  onEditMeasure: (m: Measurement) => void;
  onDeleteMeasure: (m: Measurement) => void;
  onValidate: (id: string, status: "verifie" | "a_verifier" | "rejete") => void;
}) {
  const [open, setOpen] = useState(item.measurements.some((m) => m.status === "a_verifier"));
  return (
    <li>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={open}>
          <ChevronDown className={cn("size-4 shrink-0 text-ink-3 transition-transform", open && "rotate-180")} aria-hidden="true" />
          {item.code ? <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-2xs font-semibold text-ink-2 tabular">{item.code}</span> : null}
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-ink">{item.designation}</span>
            <span className="block truncate text-2xs text-ink-3">{[item.location, `${item.measurements.length} mesure(s)`].filter(Boolean).join(", ")}</span>
          </span>
        </button>
        {item.origin === "proposition_ia" ? <Badge tone="accent">Proposition IA</Badge> : null}
        <span className="text-xs font-semibold text-ink tabular">{totals(item)}</span>
        <ActionMenu
          actions={[
            { label: "Ajouter une mesure", icon: <Plus />, onSelect: onAddMeasure },
            { label: "Modifier l’ouvrage", icon: <Pencil />, onSelect: onEdit },
            { label: "Supprimer", icon: <Trash2 />, tone: "danger", onSelect: onDelete },
          ]}
        />
      </div>
      {open ? (
        <div className="border-t border-line bg-surface-2/50 px-5 py-3">
          {item.attributes.length ? (
            <p className="mb-2 text-2xs leading-relaxed text-ink-3">{item.attributes.map((a) => `${a.name} : ${a.value} (${a.source})`).join(" ; ")}</p>
          ) : null}
          {item.measurements.length === 0 ? (
            <p className="py-2 text-2xs text-ink-3">Aucune mesure.</p>
          ) : (
            <ul className="grid gap-2">
              {item.measurements.map((m) => (
                <li key={m.id} className={cn("rounded-xl border border-line bg-surface p-3", m.status === "rejete" && "opacity-60")}>
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-xs font-medium text-ink", m.status === "rejete" && "line-through")}>{m.label}</p>
                      <p className="mt-0.5 font-mono text-2xs break-words text-ink-2">
                        {m.formula}
                        {Object.keys(m.inputs).length ? <span className="text-ink-3">{`  avec ${Object.entries(m.inputs).map(([k, v]) => `${k} = ${v}`).join(", ")}`}</span> : null}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-ink tabular">{m.quantity !== null ? `${formatNumber(m.quantity)} ${m.unit}` : "Non calculée"}</span>
                    <Badge tone={statusTone[m.status]} dot>
                      {VALIDATION_STATUS_LABELS[m.status]}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-2xs text-ink-3">{MEASURE_SOURCE_LABELS[m.source]}</span>
                    <span className="flex-1" />
                    {m.status !== "verifie" ? (
                      <Button size="sm" variant="ghost" icon={<Check className="size-3.5" />} onClick={() => onValidate(m.id, "verifie")} disabled={m.quantity === null}>
                        Valider
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => onValidate(m.id, "a_verifier")}>
                        À revoir
                      </Button>
                    )}
                    {m.status !== "rejete" ? (
                      <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={() => onValidate(m.id, "rejete")}>
                        Rejeter
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => onEditMeasure(m)}>
                      Modifier
                    </Button>
                    <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => onDeleteMeasure(m)} aria-label={`Supprimer ${m.label}`} />
                  </div>
                  {m.notes ? <p className="mt-2 border-t border-line pt-2 text-2xs leading-relaxed whitespace-pre-line text-ink-3">{m.notes}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </li>
  );
}

function WorkItemDialog({ open, onOpenChange, projectId, item, lots }: { open: boolean; onOpenChange: (open: boolean) => void; projectId: string; item: WorkItem | null; lots: Lot[] }) {
  const queryClient = useQueryClient();
  const blank = { code: "", designation: "", unit: "", location: "", description: "", lotId: lots.find((l) => l.tradeFamily === "gros_oeuvre")?.id ?? "" };
  const [values, setValues] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValues(item ? { code: item.code ?? "", designation: item.designation, unit: item.unit ?? "", location: item.location ?? "", description: item.description ?? "", lotId: item.lotId ?? "" } : blank);
    setErrors({});
    setGeneral(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item]);

  const save = useMutation({
    mutationFn: (data: unknown) => (item ? api(`/work-items/${item.id}`, { method: "PATCH", body: data }) : api(`/projects/${projectId}/work-items`, { body: data })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["project", projectId, "metre"] });
      toast.success(item ? "Ouvrage mis à jour." : "Ouvrage ajouté.");
      onOpenChange(false);
    },
    onError: (error) => (error instanceof ApiError && Object.keys(error.fields).length ? setErrors(error.fields) : setGeneral(errorMessage(error))),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = workItemInput.safeParse(values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[issue.path.join(".")] ??= issue.message;
      return setErrors(next);
    }
    setErrors({});
    save.mutate(parsed.data);
  }

  const set = (key: keyof typeof values, value: string) => setValues((v) => ({ ...v, [key]: value }));
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={item ? "Modifier l’ouvrage" : "Nouvel ouvrage"}
      onSubmit={submit}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" loading={save.isPending}>
            {item ? "Enregistrer" : "Ajouter"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[7rem_1fr]">
        {general ? (
          <div className="sm:col-span-2">
            <InlineError>{general}</InlineError>
          </div>
        ) : null}
        <Field label="Code" optional value={values.code} onChange={(e) => set("code", e.target.value)} error={errors.code} placeholder="GO-01" />
        <Field label="Désignation" value={values.designation} onChange={(e) => set("designation", e.target.value)} error={errors.designation} />
        <Field label="Unité" value={values.unit} onChange={(e) => set("unit", e.target.value)} error={errors.unit} placeholder="m3" />
        <Field label="Localisation" optional value={values.location} onChange={(e) => set("location", e.target.value)} />
        <SelectField
          label="Lot"
          optional
          className="sm:col-span-2"
          placeholder="Sans lot"
          options={lots.map((l) => ({ value: l.id, label: `${l.code} ${l.name}` }))}
          value={values.lotId}
          onChange={(e) => set("lotId", e.target.value)}
        />
        <TextareaField label="Description" optional className="sm:col-span-2" rows={3} value={values.description} onChange={(e) => set("description", e.target.value)} />
      </div>
    </Modal>
  );
}

const SOURCE_LABELS = { cote_lue: "cote lue", texte_lu: "texte lu", deduit: "déduite" } as const;

function DrawingDialog({ drawing, onOpenChange }: { drawing: Drawing | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Modal
      open={drawing !== null}
      onOpenChange={onOpenChange}
      title={drawing?.title ?? drawing?.fileName ?? "Planche"}
      description={drawing ? [drawing.fileName, `page ${drawing.pageNumber}`, drawing.scaleText, drawing.level].filter(Boolean).join(", ") : undefined}
      size="lg"
    >
      {drawing ? (
        <div className="grid gap-4">
          {drawing.uncertainties.length ? (
            <div className="flex gap-2.5 rounded-xl border border-warning/25 bg-warning-soft p-3 text-2xs leading-relaxed text-ink-2">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
              <ul className="grid gap-1">
                {drawing.uncertainties.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {drawing.elements.length === 0 ? (
            <p className="text-xs text-ink-3">Aucun élément relevé sur cette page.</p>
          ) : (
            <ul className="grid gap-2">
              {drawing.elements.map((e, i) => (
                <li key={i} className="rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold text-ink">{e.designation}</p>
                    {e.count ? <Badge>{e.count} u</Badge> : null}
                    <Badge tone={e.confidence === "elevee" ? "success" : e.confidence === "moyenne" ? "warning" : "danger"}>
                      Confiance {e.confidence === "elevee" ? "élevée" : e.confidence}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-2xs text-ink-3">{[e.location, e.material].filter(Boolean).join(", ")}</p>
                  {e.dimensions.length ? (
                    <p className="mt-1.5 text-2xs text-ink-2 tabular">{e.dimensions.map((d) => `${d.name} ${d.value} ${d.unit} (${SOURCE_LABELS[d.source]})`).join(" ; ")}</p>
                  ) : null}
                  {e.note ? <p className="mt-1 text-2xs text-ink-3">{e.note}</p> : null}
                </li>
              ))}
            </ul>
          )}
          {drawing.notes.length ? (
            <div>
              <p className="text-2xs font-semibold tracking-wide text-ink-3 uppercase">Notes relevées</p>
              <ul className="mt-1 grid gap-1 text-2xs text-ink-2">
                {drawing.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
