import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Download, FolderPlus, History, ListPlus, Plus, RotateCcw, Save, ShieldCheck, Trash2 } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DOCUMENT_STATUS_LABELS, LINE_STATUS_LABELS } from "../../../shared/enums";
import { QualityPanel } from "../../components/QualityPanel";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { ConfirmDialog, Modal } from "../../components/ui/Dialog";
import { EmptyState, InlineError, Skeleton } from "../../components/ui/Feedback";
import { Field } from "../../components/ui/Field";
import { ActionMenu } from "../../components/ui/Menu";
import { api, ApiError, errorMessage } from "../../lib/api";
import { cn } from "../../lib/cn";
import { formatDateTime, formatMoney, formatNumber } from "../../lib/format";
import type { DpgfDetail, DpgfLine } from "../../lib/types";

const documentTone = { brouillon: "neutral", en_generation: "accent", a_valider: "warning", valide: "success", archive: "neutral" } as const;
const lineTone = { non_chiffre: "neutral", a_verifier: "warning", valide: "success" } as const;

/** Cellule modifiable sur place : Entrée ou sortie du champ enregistre, Échap annule. */
function EditableCell({ value, display, onSave, numeric = false, align = "left", placeholder, label }: { value: string | null; display: string; onSave: (next: string | null) => Promise<unknown>; numeric?: boolean; align?: "left" | "right"; placeholder?: string; label: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const start = () => {
    setDraft(value === null ? "" : numeric ? String(Number(value)).replace(".", ",") : value);
    setEditing(true);
  };
  const commit = async () => {
    const next = draft.trim() === "" ? null : draft.trim();
    const current = value === null ? null : numeric ? String(Number(value)).replace(".", ",") : value;
    if (next === current) return setEditing(false);
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } catch {
      input.current?.focus();
    } finally {
      setSaving(false);
    }
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") void commit();
    if (e.key === "Escape") setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={input}
        value={draft}
        disabled={saving}
        inputMode={numeric ? "decimal" : undefined}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={onKey}
        className={cn("h-8 w-full min-w-16 rounded-lg border border-accent bg-surface px-2 text-xs text-ink outline-none", align === "right" && "text-right tabular")}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={start}
      aria-label={`${label} : ${display || "vide"}, modifier`}
      className={cn("min-h-8 w-full rounded-lg px-2 py-1 text-xs hover:bg-surface-2", align === "right" ? "text-right tabular" : "text-left", display ? "text-ink" : "text-ink-3")}
    >
      {display || placeholder || ""}
    </button>
  );
}

export function DpgfView({ projectId, dpgfId, onBack }: { projectId: string; dpgfId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ["project", projectId, "dpgf", dpgfId], queryFn: ({ signal }) => api<DpgfDetail>(`/dpgf/${dpgfId}`, { signal }) });
  const [adding, setAdding] = useState<{ kind: DpgfLine["kind"]; parentId: string | null } | null>(null);
  const [deleting, setDeleting] = useState<DpgfLine | null>(null);
  const [deletingDoc, setDeletingDoc] = useState(false);
  const [versionNote, setVersionNote] = useState<string | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["project", projectId] });

  const patchLine = async (id: string, body: Record<string, unknown>) => {
    try {
      await api(`/dpgf/lines/${id}`, { method: "PATCH", body });
      refresh();
    } catch (e) {
      toast.error(e instanceof ApiError && Object.values(e.fields)[0] ? Object.values(e.fields)[0]! : errorMessage(e));
      throw e;
    }
  };
  const validateLine = useMutation({
    mutationFn: ({ id, validated }: { id: string; validated: boolean }) => api(`/dpgf/lines/${id}/validate`, { body: { validated } }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const validate = useMutation({
    mutationFn: () => api<{ version: number }>(`/dpgf/${dpgfId}/validate`, { body: {} }),
    onSuccess: (r) => {
      toast.success(`DPGF validée, version ${r.version} figée.`);
      refresh();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      refresh();
    },
  });
  const saveVersion = useMutation({
    mutationFn: (note: string) => api<{ version: number }>(`/dpgf/${dpgfId}/versions`, { body: { note } }),
    onSuccess: (r) => {
      toast.success(`Version ${r.version} enregistrée.`);
      setVersionNote(null);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (detail.isPending) return <Skeleton className="h-96" />;
  if (detail.isError || !detail.data) return <Card className="p-6"><EmptyState title="DPGF indisponible" text={errorMessage(detail.error)} /></Card>;

  const { dpgf, lines, totals, issues, versions, cctp } = detail.data;
  const currency = dpgf.currency;
  const blocking = issues.some((i) => i.status === "ouverte" && i.severity === "bloquante");
  const scrollTo = (id: string) => window.document.getElementById(`ligne-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="size-3.5" />} onClick={onBack}>
          DPGF de l’affaire
        </Button>
        <span className="flex-1" />
        <a href={`/api/admin/dpgf/${dpgfId}/export.xlsx`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-xs font-semibold text-ink hover:bg-surface-2">
          <Download className="size-3.5" aria-hidden="true" />
          Exporter en Excel
        </a>
        <Button variant="secondary" size="sm" icon={<Save className="size-3.5" />} onClick={() => setVersionNote("")}>
          Enregistrer une version
        </Button>
        <Button size="sm" icon={<ShieldCheck className="size-3.5" />} loading={validate.isPending} disabled={blocking || dpgf.status === "valide"} onClick={() => validate.mutate()}>
          {dpgf.status === "valide" ? "DPGF validée" : "Valider la DPGF"}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight text-ink">{dpgf.title}</h2>
              <p className="mt-0.5 text-2xs text-ink-3">{[cctp ? `Établie depuis « ${cctp.title} »` : null, `version ${dpgf.currentVersion}`, `montants en ${currency}`].filter(Boolean).join(", ")}</p>
            </div>
            <Badge tone={documentTone[dpgf.status]} dot>
              {DOCUMENT_STATUS_LABELS[dpgf.status]}
            </Badge>
          </div>
          <div className="mt-4 flex items-center justify-between text-2xs text-ink-3">
            <span>
              {totals.priced} poste(s) chiffré(s) sur {totals.postes}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={totals.postes ? Math.round((totals.priced / totals.postes) * 100) : 0} aria-valuemin={0} aria-valuemax={100} aria-label="Postes chiffrés">
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${totals.postes ? (totals.priced / totals.postes) * 100 : 0}%` }} />
          </div>
        </Card>
        <Card className="p-5">
          <dl className="grid gap-2 text-xs">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-3">Total hors taxes</dt>
              <dd className="text-base font-semibold text-ink tabular">{formatMoney(totals.totalHt, currency)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-1 text-ink-3">
                TVA
                <span className="w-20">
                  <EditableCell
                    label="Taux de TVA"
                    value={dpgf.vatRate}
                    display={dpgf.vatRate !== null ? `${formatNumber(dpgf.vatRate)} %` : ""}
                    placeholder="taux à saisir"
                    numeric
                    onSave={async (next) => {
                      try {
                        await api(`/dpgf/${dpgfId}`, { method: "PATCH", body: { vatRate: next } });
                        refresh();
                      } catch (e) {
                        toast.error(e instanceof ApiError && e.fields.vatRate ? e.fields.vatRate : errorMessage(e));
                        throw e;
                      }
                    }}
                  />
                </span>
              </dt>
              <dd className="text-ink tabular">{totals.vat !== null ? formatMoney(totals.vat, currency) : ""}</dd>
            </div>
            {totals.totalTtc !== null ? (
              <div className="flex items-center justify-between gap-3 border-t border-line pt-2">
                <dt className="font-semibold text-ink">Total toutes taxes</dt>
                <dd className="text-base font-semibold text-accent tabular">{formatMoney(totals.totalTtc, currency)}</dd>
              </div>
            ) : null}
          </dl>
        </Card>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[1fr_22rem]">
        <Card className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-3">
            <CardHeader title="Décomposition" subtitle="Cliquez une désignation, une unité, une quantité ou un prix pour le modifier." />
            <Button size="sm" variant="secondary" icon={<FolderPlus className="size-3.5" />} onClick={() => setAdding({ kind: "chapitre", parentId: null })}>
              Ajouter un chapitre
            </Button>
          </div>
          {lines.length === 0 ? (
            <EmptyState title="DPGF vide" text="Ajoutez un chapitre, puis ses postes." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] text-left text-xs">
                <thead>
                  <tr className="border-y border-line text-2xs font-semibold tracking-wide text-ink-3 uppercase">
                    <th className="w-16 py-2.5 pl-5">N°</th>
                    <th className="px-2 py-2.5">Désignation</th>
                    <th className="w-20 px-2 py-2.5">Unité</th>
                    <th className="w-28 px-2 py-2.5 text-right">Quantité</th>
                    <th className="w-32 px-2 py-2.5 text-right">Prix unitaire</th>
                    <th className="w-36 px-2 py-2.5 text-right">Montant</th>
                    <th className="w-16 px-2 py-2.5">CCTP</th>
                    <th className="w-28 py-2.5 pr-5 text-right">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) =>
                    line.kind === "poste" ? (
                      <tr key={line.id} id={`ligne-${line.id}`} className="border-b border-line align-top last:border-0 hover:bg-surface-2/50">
                        <td className="py-2 pl-5 font-medium text-ink-2 tabular">{line.code}</td>
                        <td className="px-1 py-1">
                          <EditableCell label="Désignation" value={line.designation} display={line.designation} onSave={(v) => patchLine(line.id, { designation: v ?? "" })} />
                          {line.description ? <p className="px-2 pb-1 text-2xs text-ink-3">{line.description}</p> : null}
                        </td>
                        <td className="px-1 py-1">
                          <EditableCell label="Unité" value={line.unit} display={line.unit ?? ""} placeholder="unité" onSave={(v) => patchLine(line.id, { unit: v })} />
                        </td>
                        <td className="px-1 py-1">
                          <EditableCell label="Quantité" value={line.quantity} display={line.quantity !== null ? formatNumber(line.quantity) : ""} placeholder="à métrer" numeric align="right" onSave={(v) => patchLine(line.id, { quantity: v })} />
                          {line.quantitySource ? <p className="px-2 pb-1 text-right text-[0.625rem] leading-tight text-ink-3">{line.quantitySource}</p> : null}
                        </td>
                        <td className="px-1 py-1">
                          <EditableCell label="Prix unitaire" value={line.unitPrice} display={line.unitPrice !== null ? formatMoney(line.unitPrice, currency) : ""} placeholder="à chiffrer" numeric align="right" onSave={(v) => patchLine(line.id, { unitPrice: v })} />
                          {line.priceSource ? <p className="px-2 pb-1 text-right text-[0.625rem] leading-tight text-ink-3">{line.priceSource}</p> : null}
                        </td>
                        <td className="px-2 py-2.5 text-right font-semibold text-ink tabular">{line.amount !== null ? formatMoney(line.amount, currency) : ""}</td>
                        <td className="px-2 py-2.5 text-ink-3 tabular">{line.cctpRef}</td>
                        <td className="py-1.5 pr-5">
                          <div className="flex items-center justify-end gap-1">
                            <Badge tone={lineTone[line.status]}>{LINE_STATUS_LABELS[line.status]}</Badge>
                            <ActionMenu
                              actions={[
                                line.status === "valide"
                                  ? { label: "À revoir", icon: <RotateCcw />, onSelect: () => validateLine.mutate({ id: line.id, validated: false }) }
                                  : { label: "Valider le poste", icon: <Check />, onSelect: () => validateLine.mutate({ id: line.id, validated: true }), disabled: line.quantity === null || line.unitPrice === null },
                                { label: "Supprimer", icon: <Trash2 />, tone: "danger", onSelect: () => setDeleting(line) },
                              ]}
                            />
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={line.id} id={`ligne-${line.id}`} className={cn("border-b border-line", line.kind === "chapitre" ? "bg-surface-2" : "bg-surface-2/40")}>
                        <td className={cn("py-2.5 pl-5 tabular", line.kind === "chapitre" ? "font-semibold text-accent" : "font-semibold text-ink-2")}>{line.code}</td>
                        <td className="px-1 py-1" colSpan={4}>
                          <EditableCell label="Intitulé" value={line.designation} display={line.designation} onSave={(v) => patchLine(line.id, { designation: v ?? "" })} />
                        </td>
                        <td className="px-2 py-2.5 text-right font-semibold text-ink tabular">{totals.subtotals[line.id] ? formatMoney(totals.subtotals[line.id], currency) : ""}</td>
                        <td className="px-2 py-2.5 text-ink-3 tabular">{line.cctpRef}</td>
                        <td className="py-1.5 pr-5 text-right">
                          <ActionMenu
                            actions={[
                              { label: "Ajouter un poste", icon: <Plus />, onSelect: () => setAdding({ kind: "poste", parentId: line.id }) },
                              ...(line.kind === "chapitre" ? [{ label: "Ajouter un sous-chapitre", icon: <ListPlus />, onSelect: () => setAdding({ kind: "sous_chapitre", parentId: line.id }) }] : []),
                              { label: "Supprimer avec son contenu", icon: <Trash2 />, tone: "danger" as const, onSelect: () => setDeleting(line) },
                            ]}
                          />
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <div className="grid content-start gap-4">
          <QualityPanel issues={issues} onChanged={refresh} onSelectTarget={scrollTo} />
          <Card className="p-5">
            <CardHeader title="Versions" subtitle="Instantanés figés, jamais modifiés" />
            <ul className="mt-3 grid gap-2">
              {[...versions].reverse().map((v) => (
                <li key={v.id} className="flex items-start gap-2.5 text-2xs">
                  <History className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">
                      Version {v.version} {v.validated ? <Badge tone="success">Validée</Badge> : null}
                    </p>
                    <p className="text-ink-3">{[v.note, formatDateTime(v.createdAt)].filter(Boolean).join(", ")}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <Button variant="danger" size="sm" className="justify-self-start" icon={<Trash2 className="size-3.5" />} onClick={() => setDeletingDoc(true)}>
            Supprimer cette DPGF
          </Button>
        </div>
      </div>

      <AddLineDialog target={adding} dpgfId={dpgfId} onOpenChange={(v) => !v && setAdding(null)} onSaved={refresh} />
      <Modal
        open={versionNote !== null}
        onOpenChange={(v) => !v && setVersionNote(null)}
        title="Enregistrer une version"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setVersionNote(null)}>
              Annuler
            </Button>
            <Button loading={saveVersion.isPending} onClick={() => saveVersion.mutate(versionNote ?? "")}>
              Enregistrer
            </Button>
          </>
        }
      >
        <Field label="Note" optional value={versionNote ?? ""} onChange={(e) => setVersionNote(e.target.value)} maxLength={300} />
      </Modal>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Supprimer cette ligne ?"
        text={deleting ? `« ${deleting.designation} »${deleting.kind === "poste" ? "" : " et tout son contenu"} sera supprimé de la DPGF.` : ""}
        confirmLabel="Supprimer"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await api(`/dpgf/lines/${deleting.id}`, { method: "DELETE" });
            refresh();
          } catch (error) {
            toast.error(errorMessage(error));
            throw error;
          }
        }}
      />
      <ConfirmDialog
        open={deletingDoc}
        onOpenChange={setDeletingDoc}
        title="Supprimer cette DPGF ?"
        text={`« ${dpgf.title} », ses versions et ses points de contrôle seront supprimés. Le CCTP et le métré ne sont pas touchés.`}
        confirmLabel="Supprimer"
        onConfirm={async () => {
          try {
            await api(`/dpgf/${dpgfId}`, { method: "DELETE" });
            toast.success("DPGF supprimée.");
            refresh();
            onBack();
          } catch (error) {
            toast.error(errorMessage(error));
            throw error;
          }
        }}
      />
    </div>
  );
}

function AddLineDialog({ target, dpgfId, onOpenChange, onSaved }: { target: { kind: DpgfLine["kind"]; parentId: string | null } | null; dpgfId: string; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const blank = { designation: "", unit: "", quantity: "", unitPrice: "", cctpRef: "" };
  const [values, setValues] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  useEffect(() => {
    if (!target) return;
    setValues(blank);
    setErrors({});
    setGeneral(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  const save = useMutation({
    mutationFn: () => api(`/dpgf/${dpgfId}/lines`, { body: { kind: target!.kind, parentId: target!.parentId, ...values } }),
    onSuccess: () => {
      onSaved();
      onOpenChange(false);
    },
    onError: (e) => (e instanceof ApiError && Object.keys(e.fields).length ? setErrors(e.fields) : setGeneral(errorMessage(e))),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };
  const isPoste = target?.kind === "poste";
  const set = (key: keyof typeof values, value: string) => setValues((v) => ({ ...v, [key]: value }));
  return (
    <Modal
      open={target !== null}
      onOpenChange={onOpenChange}
      title={isPoste ? "Nouveau poste" : target?.kind === "sous_chapitre" ? "Nouveau sous-chapitre" : "Nouveau chapitre"}
      size={isPoste ? "md" : "sm"}
      onSubmit={submit}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" loading={save.isPending} disabled={!values.designation.trim()}>
            Ajouter
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {general ? (
          <div className="sm:col-span-2">
            <InlineError>{general}</InlineError>
          </div>
        ) : null}
        <Field label={isPoste ? "Désignation" : "Intitulé"} className="sm:col-span-2" value={values.designation} onChange={(e) => set("designation", e.target.value)} error={errors.designation} />
        {isPoste ? (
          <>
            <Field label="Unité" value={values.unit} onChange={(e) => set("unit", e.target.value)} error={errors.unit} placeholder="m3, m2, ml, u, ens" />
            <Field label="Article du CCTP" optional value={values.cctpRef} onChange={(e) => set("cctpRef", e.target.value)} placeholder="3.2" />
            <Field label="Quantité" optional inputMode="decimal" value={values.quantity} onChange={(e) => set("quantity", e.target.value)} error={errors.quantity} />
            <Field label="Prix unitaire" optional inputMode="decimal" value={values.unitPrice} onChange={(e) => set("unitPrice", e.target.value)} error={errors.unitPrice} />
          </>
        ) : null}
      </div>
    </Modal>
  );
}
