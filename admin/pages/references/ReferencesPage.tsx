import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookMarked, Check, Download, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { REFERENCE_KIND_LABELS, REFERENCE_SCOPE_LABELS, type ReferenceScope, VALIDATION_STATUS_LABELS } from "../../../shared/enums";
import { referenceInput } from "../../../shared/schemas";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ConfirmDialog, Modal } from "../../components/ui/Dialog";
import { EmptyState, InlineError, Skeleton } from "../../components/ui/Feedback";
import { Field, optionsOf, SelectField, TextareaField } from "../../components/ui/Field";
import { ActionMenu } from "../../components/ui/Menu";
import { PageHeader } from "../../components/ui/PageHeader";
import { SearchInput } from "../../components/ui/SearchInput";
import { Segmented } from "../../components/ui/Segmented";
import { api, ApiError, errorMessage, query } from "../../lib/api";
import { useListParams } from "../../lib/list-params";
import type { TechnicalReference } from "../../lib/types";

const KEY = ["references"] as const;
const statusTone = { a_verifier: "warning", verifie: "success", rejete: "neutral" } as const;

export function ReferencesPage() {
  const queryClient = useQueryClient();
  const list = useListParams({ id: "code", desc: false });
  const scope = list.get("portee");
  const q = list.get("q");
  const [editing, setEditing] = useState<TechnicalReference | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<TechnicalReference | null>(null);
  const references = useQuery({ queryKey: [...KEY, { scope, q }], queryFn: ({ signal }) => api<{ items: TechnicalReference[] }>(`/references${query({ portee: scope, q })}`, { signal }) });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: KEY });

  const verify = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "verifie" | "a_verifier" | "rejete" }) => api(`/references/${id}/verify`, { body: { status } }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const importCatalog = useMutation({
    mutationFn: () => api<{ imported: number; skipped: number }>("/references/catalogue", { body: {} }),
    onSuccess: (r) => {
      refresh();
      toast.success(r.imported ? `${r.imported} référence(s) ajoutée(s), à vérifier.` : "Le catalogue de départ est déjà importé.");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const items = references.data?.items ?? [];
  const pending = items.filter((r) => r.verificationStatus === "a_verifier").length;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Référentiel"
        description="Les seules lois, normes, DTU et règlements qu’un document peut citer. Une référence « à vérifier » reste signalée par le contrôle qualité jusqu’à ce que vous confirmiez son édition en vigueur."
        actions={
          <>
            <Button variant="secondary" icon={<Download className="size-4" />} loading={importCatalog.isPending} onClick={() => importCatalog.mutate()}>
              Catalogue de départ
            </Button>
            <Button icon={<Plus className="size-4" />} onClick={() => setEditing(null)}>
              Ajouter une référence
            </Button>
          </>
        }
      />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <SearchInput value={q} onChange={(v) => list.set({ q: v })} placeholder="Code, intitulé, domaine" label="Rechercher une référence" className="lg:w-80" />
          <div className="flex flex-wrap items-center gap-3">
            {pending ? <Badge tone="warning">{pending} à vérifier</Badge> : null}
            <Segmented
              value={(scope || "tous") as "tous" | ReferenceScope}
              onChange={(v) => list.set({ portee: v === "tous" ? null : v })}
              options={[{ value: "tous", label: "Tous" }, ...optionsOf(REFERENCE_SCOPE_LABELS)]}
              label="Périmètre"
            />
          </div>
        </div>
        {references.isPending ? (
          <div className="grid gap-2 px-5 pb-5">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<BookMarked className="size-5" />}
            title={q || scope ? "Aucune référence ne correspond" : "Référentiel vide"}
            text={q || scope ? undefined : "Importez le catalogue de départ (références courantes du gros œuvre, à vérifier) ou ajoutez vos références."}
          />
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {items.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold text-ink">{r.code}</p>
                    <Badge>{REFERENCE_KIND_LABELS[r.kind]}</Badge>
                    <Badge>{REFERENCE_SCOPE_LABELS[r.scope]}</Badge>
                    {r.cited ? <Badge tone="accent">Citée {r.cited} fois</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-2xs leading-relaxed text-ink-2">{[r.title, r.version].filter(Boolean).join(", ")}</p>
                </div>
                <Badge tone={statusTone[r.verificationStatus]} dot>
                  {VALIDATION_STATUS_LABELS[r.verificationStatus]}
                </Badge>
                {r.verificationStatus !== "verifie" ? (
                  <Button size="sm" variant="ghost" icon={<Check className="size-3.5" />} onClick={() => verify.mutate({ id: r.id, status: "verifie" })}>
                    Vérifiée
                  </Button>
                ) : null}
                <ActionMenu
                  actions={[
                    { label: "Modifier", icon: <Pencil />, onSelect: () => setEditing(r) },
                    ...(r.verificationStatus !== "a_verifier" ? [{ label: "Remettre à vérifier", icon: <RotateCcw />, onSelect: () => verify.mutate({ id: r.id, status: "a_verifier" }) }] : []),
                    ...(r.verificationStatus !== "rejete" ? [{ label: "Rejeter", icon: <X />, onSelect: () => verify.mutate({ id: r.id, status: "rejete" }) }] : []),
                    { label: "Supprimer", icon: <Trash2 />, tone: "danger" as const, onSelect: () => setDeleting(r) },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <ReferenceDialog open={editing !== undefined} onOpenChange={(open) => !open && setEditing(undefined)} reference={editing ?? null} onSaved={refresh} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Supprimer cette référence ?"
        text={deleting ? `${deleting.code} sera retirée du référentiel. Une référence citée dans un CCTP ne peut pas être supprimée : rejetez-la plutôt.` : ""}
        confirmLabel="Supprimer"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await api(`/references/${deleting.id}`, { method: "DELETE" });
            toast.success("Référence supprimée.");
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

function ReferenceDialog({ open, onOpenChange, reference, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; reference: TechnicalReference | null; onSaved: () => void }) {
  const blank = { scope: "MA", kind: "norme", code: "", title: "", version: "", publishedOn: "", domain: "", sourceUrl: "", notes: "" };
  const [values, setValues] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValues(
      reference
        ? {
            scope: reference.scope,
            kind: reference.kind,
            code: reference.code,
            title: reference.title,
            version: reference.version ?? "",
            publishedOn: reference.publishedOn ?? "",
            domain: reference.domain ?? "",
            sourceUrl: reference.sourceUrl ?? "",
            notes: reference.notes ?? "",
          }
        : blank,
    );
    setErrors({});
    setGeneral(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reference]);

  const save = useMutation({
    mutationFn: (data: unknown) => (reference ? api(`/references/${reference.id}`, { method: "PATCH", body: data }) : api("/references", { body: data })),
    onSuccess: () => {
      onSaved();
      toast.success(reference ? "Référence modifiée, à vérifier de nouveau." : "Référence ajoutée, à vérifier.");
      onOpenChange(false);
    },
    onError: (e) => (e instanceof ApiError && Object.keys(e.fields).length ? setErrors(e.fields) : setGeneral(errorMessage(e))),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = referenceInput.safeParse(values);
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
      title={reference ? "Modifier la référence" : "Nouvelle référence"}
      description="Saisissez la référence telle qu’elle est publiée. Elle sera « à vérifier » jusqu’à votre confirmation."
      size="lg"
      onSubmit={submit}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" loading={save.isPending}>
            {reference ? "Enregistrer" : "Ajouter"}
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
        <SelectField label="Périmètre" options={optionsOf(REFERENCE_SCOPE_LABELS)} value={values.scope} onChange={(e) => set("scope", e.target.value)} />
        <SelectField label="Nature" options={optionsOf(REFERENCE_KIND_LABELS)} value={values.kind} onChange={(e) => set("kind", e.target.value)} />
        <Field label="Code" value={values.code} onChange={(e) => set("code", e.target.value)} error={errors.code} placeholder="NF DTU 21" />
        <Field label="Édition ou version" optional value={values.version} onChange={(e) => set("version", e.target.value)} error={errors.version} />
        <Field label="Intitulé" className="sm:col-span-2" value={values.title} onChange={(e) => set("title", e.target.value)} error={errors.title} />
        <Field label="Domaine" optional value={values.domain} onChange={(e) => set("domain", e.target.value)} placeholder="Béton, fondations…" />
        <Field label="Date de publication" optional type="date" value={values.publishedOn} onChange={(e) => set("publishedOn", e.target.value)} error={errors.publishedOn} />
        <Field label="Source" optional className="sm:col-span-2" value={values.sourceUrl} onChange={(e) => set("sourceUrl", e.target.value)} error={errors.sourceUrl} placeholder="https://" />
        <TextareaField label="Notes" optional className="sm:col-span-2" rows={3} value={values.notes} onChange={(e) => set("notes", e.target.value)} />
      </div>
    </Modal>
  );
}
