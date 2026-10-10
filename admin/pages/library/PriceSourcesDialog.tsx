import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Download, ExternalLink, RefreshCw, RotateCcw, ShieldAlert } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { COUNTRY_LABELS, PRICE_BATCH_STATUS_LABELS, type PriceBatchStatus } from "../../../shared/enums";
import { JobProgress } from "../../components/JobProgress";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog, Modal } from "../../components/ui/Dialog";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { Checkbox, Field } from "../../components/ui/Field";
import { api, errorMessage } from "../../lib/api";
import { cn } from "../../lib/cn";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "../../lib/format";
import type { PriceBatch, PriceBatchRow, PriceSourceInfo } from "../../lib/types";

const KEY = ["library"] as const;
const batchTone: Record<PriceBatchStatus, "neutral" | "accent" | "success" | "warning" | "danger"> = {
  en_cours: "accent",
  a_publier: "warning",
  quarantaine: "warning",
  publie: "success",
  sans_changement: "neutral",
  annule: "neutral",
  echoue: "danger",
};

/** Bilan d'un lot en une phrase. */
export function batchSummary(b: Pick<PriceBatch, "stats" | "status">): string {
  const s = b.stats;
  const parts = [
    s.publiees ? `${formatNumber(s.publiees)} publiées` : null,
    s.modifiees ? `${formatNumber(s.modifiees)} modifiées` : null,
    s.inchangees ? `${formatNumber(s.inchangees)} inchangées` : null,
    s.quarantaine ? `${formatNumber(s.quarantaine)} en quarantaine` : null,
    s.rejetees ? `${formatNumber(s.rejetees)} écartées` : null,
  ].filter(Boolean);
  return parts.join(", ") || PRICE_BATCH_STATUS_LABELS[b.status];
}

/**
 * Sources publiques : registre, licence et méthode, premier chargement, vérification des mises à jour,
 * réglages de publication, lots publiés ou en attente, examen de la quarantaine, annulation d'un lot.
 */
export function PriceSourcesDialog({ open, onOpenChange, onChanged }: { open: boolean; onOpenChange: (open: boolean) => void; onChanged: () => void }) {
  const queryClient = useQueryClient();
  const [reviewing, setReviewing] = useState<PriceBatch | null>(null);
  const sources = useQuery({
    queryKey: [...KEY, "sources"],
    queryFn: ({ signal }) => api<{ items: PriceSourceInfo[] }>("/library/sources", { signal }),
    enabled: open,
    refetchInterval: (q) => (q.state.data?.items.some((s) => s.job) ? 2500 : false),
  });
  const files = useQuery({ queryKey: [...KEY, "batches", "fichiers"], queryFn: ({ signal }) => api<{ items: PriceBatch[] }>("/library/batches?source=fichiers", { signal }), enabled: open });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: KEY });
    onChanged();
  };
  // Fin d'un traitement : la liste des prix et les lots sont rechargés.
  const running = sources.data?.items.filter((s) => s.job).map((s) => s.key).join(",") ?? "";
  const [lastRunning, setLastRunning] = useState("");
  useEffect(() => {
    if (lastRunning && !running) refresh();
    setLastRunning(running);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  return (
    <>
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        title="Sources publiques de prix"
        description="Données publiques ouvertes, chacune avec sa licence et sa méthode. Les valeurs douteuses restent en quarantaine jusqu’à votre décision ; tout lot publié peut être annulé."
        size="lg"
      >
        {sources.isPending ? (
          <Skeleton className="h-64" />
        ) : (
          <div className="grid gap-4">
            {(sources.data?.items ?? []).map((s) => (
              <SourceCard key={s.key} source={s} onChanged={refresh} onReview={setReviewing} />
            ))}
            <FileImports batches={files.data?.items ?? []} onChanged={refresh} />
          </div>
        )}
      </Modal>
      <BatchReviewDialog batch={reviewing} onOpenChange={(v) => !v && setReviewing(null)} onChanged={refresh} />
    </>
  );
}

function SourceCard({ source: s, onChanged, onReview }: { source: PriceSourceInfo; onChanged: () => void; onReview: (b: PriceBatch) => void }) {
  const [details, setDetails] = useState(false);
  const loaded = s.references > 0 || Boolean(s.lastCheckedAt);
  const batches = useQuery({ queryKey: [...KEY, "batches", s.key], queryFn: ({ signal }) => api<{ items: PriceBatch[] }>(`/library/batches?source=${s.key}`, { signal }), enabled: details });
  const start = useMutation({
    mutationFn: (mode: "load" | "refresh") => api(`/library/sources/${s.key}/${mode}`, { method: "POST" }),
    onSuccess: (_, mode) => {
      onChanged();
      toast.success(mode === "load" ? "Chargement lancé." : "Vérification des mises à jour lancée.");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const pendingBatch = s.lastBatch && (s.lastBatch.status === "quarantaine" || s.lastBatch.status === "a_publier") ? s.lastBatch : null;

  return (
    <section className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-ink">{s.name}</h3>
            <Badge>{COUNTRY_LABELS[s.country]}</Badge>
            {s.lastBatch ? (
              <Badge tone={batchTone[s.lastBatch.status]} dot>
                {PRICE_BATCH_STATUS_LABELS[s.lastBatch.status]}
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 text-2xs text-ink-3">{s.publisher}</p>
        </div>
        {!loaded && s.snapshot ? (
          <Button size="sm" icon={<Download className="size-3.5" />} loading={start.isPending} disabled={Boolean(s.job)} onClick={() => start.mutate("load")}>
            Charger {formatNumber(s.snapshot.references)} références
          </Button>
        ) : (
          <Button size="sm" variant="secondary" icon={<RefreshCw className="size-3.5" />} loading={start.isPending} disabled={Boolean(s.job)} onClick={() => start.mutate("refresh")}>
            Vérifier les mises à jour
          </Button>
        )}
      </div>
      {s.description ? <p className="mt-2 text-xs leading-relaxed text-ink-2">{s.description}</p> : null}
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["En service", formatNumber(s.references)],
          ["Instantané livré", s.snapshot ? `${formatNumber(s.snapshot.references)}, ${formatDate(s.snapshot.generatedAt)}` : "aucun"],
          ["Dernière vérification", s.lastCheckedAt ? formatDate(s.lastCheckedAt) : "jamais"],
          ["En attente", formatNumber(s.pending)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-surface-2 px-3 py-2">
            <dt className="text-2xs text-ink-3">{label}</dt>
            <dd className="mt-0.5 text-xs font-semibold text-ink tabular">{value}</dd>
          </div>
        ))}
      </dl>
      {s.job ? (
        <div className="mt-3">
          <JobProgress job={s.job} />
        </div>
      ) : null}
      {pendingBatch && s.pending > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-warning/30 bg-warning-soft px-3 py-2.5">
          <ShieldAlert className="size-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-xs text-ink-2">
            {formatNumber(s.pending)} valeur{s.pending > 1 ? "s" : ""} attend{s.pending > 1 ? "ent" : ""} votre décision, lot « {pendingBatch.label} ».
          </p>
          <Button size="sm" variant="secondary" onClick={() => onReview(pendingBatch)}>
            Examiner
          </Button>
        </div>
      ) : null}
      <button type="button" onClick={() => setDetails((v) => !v)} className="mt-3 inline-flex items-center gap-1 text-2xs font-semibold text-accent hover:underline" aria-expanded={details}>
        Méthode, licence, réglages et lots
        <ChevronDown className={cn("size-3.5 transition-transform", details && "rotate-180")} aria-hidden="true" />
      </button>
      {details ? (
        <div className="mt-3 grid gap-3">
          <dl className="grid gap-2 text-xs leading-relaxed text-ink-2">
            {s.coverage ? (
              <div>
                <dt className="text-2xs font-semibold text-ink-3">Couverture</dt>
                <dd>{s.coverage}</dd>
              </div>
            ) : null}
            {s.method ? (
              <div>
                <dt className="text-2xs font-semibold text-ink-3">Méthode</dt>
                <dd>{s.method}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-2xs font-semibold text-ink-3">Licence et page de la source</dt>
              <dd className="flex flex-wrap gap-x-4 gap-y-1">
                <a href={s.licenseUrl ?? s.homepage} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-accent hover:underline">
                  {s.license}
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
                <a href={s.homepage} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-accent hover:underline">
                  Page de la source
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              </dd>
            </div>
          </dl>
          <SourceSettings source={s} onChanged={onChanged} />
          <BatchList batches={batches.data?.items} loading={batches.isPending} onReview={onReview} onChanged={onChanged} />
        </div>
      ) : null}
    </section>
  );
}

function SourceSettings({ source: s, onChanged }: { source: PriceSourceInfo; onChanged: () => void }) {
  const [values, setValues] = useState({ autoPublish: s.autoPublish, enabled: s.enabled, maxVariation: String(Number(s.maxVariation)), refreshDays: String(s.refreshDays) });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () => api(`/library/sources/${s.key}`, { method: "PATCH", body: { ...values, maxVariation: Number(values.maxVariation.replace(",", ".")), refreshDays: Number(values.refreshDays) } }),
    onSuccess: () => {
      onChanged();
      setErrors({});
      toast.success("Réglages de la source enregistrés.");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    const variation = Number(values.maxVariation.replace(",", "."));
    const days = Number(values.refreshDays);
    if (!(variation >= 5 && variation <= 200)) next.maxVariation = "Entre 5 et 200 %.";
    if (!(Number.isInteger(days) && days >= 7 && days <= 365)) next.refreshDays = "Entre 7 et 365 jours.";
    setErrors(next);
    if (Object.keys(next).length === 0) save.mutate();
  }
  return (
    <form onSubmit={submit} noValidate className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2">
      <div className="grid gap-2 sm:col-span-2">
        <Checkbox label="Publier d’office les valeurs saines (les valeurs douteuses restent en quarantaine)" checked={values.autoPublish} onChange={(v) => setValues((x) => ({ ...x, autoPublish: v }))} />
        <Checkbox label="Vérifier automatiquement les mises à jour" checked={values.enabled} onChange={(v) => setValues((x) => ({ ...x, enabled: v }))} />
      </div>
      <Field label="Seuil de variation, en % par an" inputMode="decimal" value={values.maxVariation} onChange={(e) => setValues((x) => ({ ...x, maxVariation: e.target.value }))} error={errors.maxVariation} />
      <Field label="Vérification tous les, en jours" inputMode="numeric" value={values.refreshDays} onChange={(e) => setValues((x) => ({ ...x, refreshDays: e.target.value }))} error={errors.refreshDays} />
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" variant="secondary" loading={save.isPending}>
          Enregistrer les réglages
        </Button>
      </div>
    </form>
  );
}

function BatchList({ batches, loading, onReview, onChanged }: { batches: PriceBatch[] | undefined; loading: boolean; onReview: (b: PriceBatch) => void; onChanged: () => void }) {
  const [reverting, setReverting] = useState<PriceBatch | null>(null);
  const publish = useMutation({
    mutationFn: (b: PriceBatch) => api(`/library/batches/${b.id}/publish`, { body: {} }),
    onSuccess: () => {
      onChanged();
      toast.success("Lot publié.");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (loading) return <Skeleton className="h-20" />;
  if (!batches?.length) return <EmptyState title="Aucun lot" text="Le premier chargement crée le premier lot de la source." />;
  return (
    <>
      <ol className="grid gap-2">
        {batches.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold text-ink">{b.label}</p>
                <Badge tone={batchTone[b.status]} dot>
                  {PRICE_BATCH_STATUS_LABELS[b.status]}
                </Badge>
              </div>
              <p className="mt-0.5 text-2xs text-ink-3">{[formatDateTime(b.createdAt), batchSummary(b)].join(", ")}</p>
              {b.message ? <p className="mt-0.5 text-2xs text-ink-2">{b.message}</p> : null}
            </div>
            {b.status === "quarantaine" || b.status === "a_publier" ? (
              <Button size="sm" variant="secondary" onClick={() => onReview(b)}>
                Examiner
              </Button>
            ) : null}
            {b.status === "a_publier" ? (
              <Button size="sm" loading={publish.isPending} onClick={() => publish.mutate(b)}>
                Publier
              </Button>
            ) : null}
            {b.status === "publie" || b.status === "quarantaine" || b.status === "a_publier" ? (
              <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => setReverting(b)}>
                Annuler
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
      <RevertDialog batch={reverting} onOpenChange={(v) => !v && setReverting(null)} onChanged={onChanged} />
    </>
  );
}

function RevertDialog({ batch, onOpenChange, onChanged }: { batch: PriceBatch | null; onOpenChange: (open: boolean) => void; onChanged: () => void }) {
  return (
    <ConfirmDialog
      open={batch !== null}
      onOpenChange={onOpenChange}
      title="Annuler ce lot"
      text={
        <>
          Les références créées par « {batch?.label} » seront archivées et les valeurs qu’il a remplacées rétablies. Rien n’est supprimé : chaque retour est inscrit dans l’historique des prix.
        </>
      }
      confirmLabel="Annuler le lot"
      onConfirm={async () => {
        try {
          await api(`/library/batches/${batch!.id}/revert`, { method: "POST" });
          onChanged();
          toast.success("Lot annulé.");
        } catch (e) {
          toast.error(errorMessage(e));
          throw e;
        }
      }}
    />
  );
}

function FileImports({ batches, onChanged }: { batches: PriceBatch[]; onChanged: () => void }) {
  const [reverting, setReverting] = useState<PriceBatch | null>(null);
  if (batches.length === 0) return null;
  return (
    <section className="rounded-xl border border-line p-4">
      <h3 className="text-sm font-semibold text-ink">Imports de fichiers</h3>
      <p className="mt-0.5 text-2xs text-ink-3">Chaque import de fichier peut être annulé en bloc : ses prix sont archivés, jamais supprimés.</p>
      <ol className="mt-3 grid gap-2">
        {batches.slice(0, 10).map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-xs font-semibold text-ink">{b.label}</p>
                <Badge tone={batchTone[b.status]} dot>
                  {PRICE_BATCH_STATUS_LABELS[b.status]}
                </Badge>
              </div>
              <p className="mt-0.5 text-2xs text-ink-3">{[formatDateTime(b.createdAt), batchSummary(b)].join(", ")}</p>
            </div>
            {b.status === "publie" ? (
              <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => setReverting(b)}>
                Annuler l’import
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
      <RevertDialog batch={reverting} onOpenChange={(v) => !v && setReverting(null)} onChanged={onChanged} />
    </section>
  );
}

/** Examen des valeurs en attente d'un lot : valeur publiée, valeur proposée, motif ; publication ou rejet. */
function BatchReviewDialog({ batch, onOpenChange, onChanged }: { batch: PriceBatch | null; onOpenChange: (open: boolean) => void; onChanged: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  useEffect(() => {
    setSelected(new Set());
    setPage(1);
  }, [batch?.id]);
  const decision = batch?.status === "a_publier" ? "a_publier" : "quarantaine";
  const rows = useQuery({
    queryKey: [...KEY, "batch-rows", batch?.id, decision, page],
    queryFn: ({ signal }) => api<{ items: PriceBatchRow[]; total: number; pageSize: number }>(`/library/batches/${batch!.id}/rows?decision=${decision}&page=${page}&pageSize=50`, { signal }),
    enabled: Boolean(batch),
  });
  const act = useMutation({
    mutationFn: (kind: "publish" | "reject") => api(`/library/batches/${batch!.id}/${kind}`, { body: { rowIds: [...selected] } }),
    onSuccess: (_, kind) => {
      setSelected(new Set());
      void rows.refetch();
      onChanged();
      toast.success(kind === "publish" ? "Valeurs publiées." : "Valeurs écartées : la valeur publiée reste celle d’avant.");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const items = rows.data?.items ?? [];
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = items.length > 0 && items.every((r) => selected.has(r.id));
  const total = rows.data?.total ?? 0;
  return (
    <Modal
      open={batch !== null}
      onOpenChange={onOpenChange}
      title={decision === "quarantaine" ? "Valeurs en quarantaine" : "Valeurs à publier"}
      description={batch ? `${batch.label} : chaque valeur proposée, la valeur publiée qu’elle remplacerait et le motif de mise à l’écart.` : undefined}
      size="lg"
      footer={
        <>
          <Button variant="secondary" disabled={selected.size === 0} loading={act.isPending && act.variables === "reject"} onClick={() => act.mutate("reject")}>
            Écarter la sélection
          </Button>
          <Button disabled={selected.size === 0} loading={act.isPending && act.variables === "publish"} onClick={() => act.mutate("publish")}>
            Publier la sélection
          </Button>
        </>
      }
    >
      {rows.isPending ? (
        <Skeleton className="h-48" />
      ) : items.length === 0 ? (
        <EmptyState title="Plus rien en attente" text="Toutes les valeurs de ce lot ont reçu une décision." />
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between gap-3">
            <Checkbox label={`Tout sélectionner sur cette page (${items.length})`} checked={allSelected} onChange={(v) => setSelected(v ? new Set(items.map((r) => r.id)) : new Set())} />
            <span className="text-2xs text-ink-3">{formatNumber(total)} en attente</span>
          </div>
          <ol className="grid gap-2">
            {items.map((r) => {
              const rec = r.payload;
              return (
                <li key={r.id} className={cn("rounded-xl border p-3", selected.has(r.id) ? "border-accent/40 bg-accent-soft" : "border-line")}>
                  <label className="flex cursor-pointer items-start gap-3">
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="mt-0.5 size-4 accent-[var(--accent)]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-ink">{rec.designation}</p>
                      <p className="text-2xs text-ink-3">{[rec.city ?? (rec.region ? `Région ${rec.region}` : "Niveau national"), rec.period].filter(Boolean).join(", ")}</p>
                      <p className="mt-1 text-xs text-ink-2 tabular">
                        {r.previous ? (
                          <>
                            {formatMoney(r.previous.unitPrice, rec.currency)} / {r.previous.unit}
                            {r.previous.period ? `, valeur ${r.previous.period},` : ""} devient{" "}
                          </>
                        ) : (
                          "Nouvelle référence : "
                        )}
                        <span className="font-semibold text-ink">
                          {formatMoney(rec.unitPrice, rec.currency)} / {rec.unit}
                        </span>
                      </p>
                      {r.reason ? <p className="mt-1 text-2xs text-warning">{r.reason}</p> : null}
                    </div>
                  </label>
                </li>
              );
            })}
          </ol>
          {total > 50 ? (
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage((x) => x - 1)}>
                Précédentes
              </Button>
              <Button size="sm" variant="secondary" disabled={page * 50 >= total} onClick={() => setPage((x) => x + 1)}>
                Suivantes
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Modal>
  );
}
