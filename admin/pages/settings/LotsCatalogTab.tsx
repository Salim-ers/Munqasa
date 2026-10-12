import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Combine, Pencil, Plus, Scissors, Star, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PROJECT_TYPES, searchable } from "../../../shared/lots";
import { TRADE_FAMILIES, tradeLabel } from "../../../shared/trades";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { ConfirmDialog, Modal } from "../../components/ui/Dialog";
import { InlineError, Skeleton } from "../../components/ui/Feedback";
import { Field, SelectField } from "../../components/ui/Field";
import { ActionMenu } from "../../components/ui/Menu";
import { api, ApiError, errorMessage } from "../../lib/api";
import { cn } from "../../lib/cn";
import type { LotCatalog, LotCatalogEntry, LotCatalogList } from "../../lib/types";

const familyOptions = TRADE_FAMILIES.map((f) => ({ value: f.key, label: f.label }));

/** Nomenclatures de lots : modèles modifiables recopiés dans les affaires, jamais propagés aux affaires existantes. */
export function LotsCatalogTab() {
  const queryClient = useQueryClient();
  const data = useQuery({ queryKey: ["lot-catalogs"], queryFn: ({ signal }) => api<LotCatalogList>("/lot-catalogs", { signal }) });
  const [catalogId, setCatalogId] = useState("");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ entry: LotCatalogEntry | null; parent: LotCatalogEntry | null } | null>(null);
  const [splitting, setSplitting] = useState<LotCatalogEntry | null>(null);
  const [merging, setMerging] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<LotCatalog | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["lot-catalogs"] });

  const catalogs = data.data?.catalogs ?? [];
  const catalog = catalogs.find((c) => c.id === catalogId) ?? catalogs.find((c) => c.isDefault) ?? catalogs[0];
  useEffect(() => setSelected(new Set()), [catalog?.id]);
  const query = searchable(search.trim());
  const entries = useMemo(() => (catalog?.entries ?? []).filter((e) => (showArchived || !e.archived) && (!query || searchable(`${e.number} ${e.name}`).includes(query))), [catalog, showArchived, query]);

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api(`/lot-catalog-entries/${id}`, { method: "PATCH", body }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/lot-catalog-entries/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Lot retiré de la nomenclature.");
      void refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const makeDefault = useMutation({
    mutationFn: (id: string) => api(`/lot-catalogs/${id}`, { method: "PATCH", body: { isDefault: true } }),
    onSuccess: () => {
      toast.success("Nomenclature proposée par défaut.");
      void refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (data.isPending) return <Skeleton className="h-96" />;
  if (data.error || !catalog) return <InlineError>{errorMessage(data.error)}</InlineError>;
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="grid gap-4">
      <Card className="p-5">
        <CardHeader
          title="Nomenclatures de lots"
          subtitle="Nomenclature interne indicative, pas une codification réglementaire. Les lots choisis sont recopiés dans l’affaire : modifier une nomenclature ne change aucune affaire existante."
          action={
            <Button size="sm" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)}>
              Nouvelle nomenclature
            </Button>
          }
        />
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <SelectField
            className="min-w-64"
            label="Nomenclature"
            options={catalogs.map((c) => ({ value: c.id, label: `${c.name}${c.country ? `, ${c.country === "FR" ? "France" : "Maroc"}` : ""}${c.isDefault ? " (par défaut)" : ""}` }))}
            value={catalog.id}
            onChange={(e) => setCatalogId(e.target.value)}
          />
          {!catalog.isDefault ? (
            <Button size="sm" variant="secondary" loading={makeDefault.isPending} onClick={() => makeDefault.mutate(catalog.id)}>
              Proposer par défaut
            </Button>
          ) : null}
          {catalogs.length > 1 ? (
            <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => setDeleting(catalog)}>
              Supprimer cette nomenclature
            </Button>
          ) : null}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 p-5 pb-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un lot"
            aria-label="Rechercher un lot dans la nomenclature"
            className="h-10 min-w-56 flex-1 rounded-xl border border-line bg-surface px-3 text-xs text-ink outline-none placeholder:text-ink-3 focus:border-accent"
          />
          <label className="flex items-center gap-2 text-2xs text-ink-2">
            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Afficher les lots retirés
          </label>
          <Button size="sm" variant="secondary" icon={<Combine className="size-3.5" />} disabled={selected.size < 2} onClick={() => setMerging(true)}>
            {selected.size >= 2 ? `Fusionner ${selected.size} lots` : "Fusionner la sélection"}
          </Button>
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setEditing({ entry: null, parent: null })}>
            Ajouter un lot
          </Button>
        </div>
        <ul className="divide-y divide-line border-t border-line">
          {entries.map((e) => {
            const parent = catalog.entries.find((p) => p.id === e.parentId) ?? null;
            return (
              <li key={e.id} className={cn("flex items-center gap-3 py-2.5 pr-5", e.parentId ? "pl-12" : "pl-5", e.archived ? "opacity-60" : "")}>
                <input type="checkbox" className="size-4 shrink-0 accent-[var(--accent)]" checked={selected.has(e.id)} onChange={() => toggle(e.id)} aria-label={`Sélectionner ${e.number} ${e.name}`} disabled={e.archived} />
                <span className="grid h-8 min-w-11 shrink-0 place-items-center rounded-lg bg-surface-2 px-2 text-2xs font-semibold text-ink tabular">{e.number.split("~")[0]}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-ink">{e.name}</p>
                  <p className="truncate text-2xs text-ink-3">{[parent ? `Sous-lot de ${parent.number}` : null, tradeLabel(e.tradeFamily), e.archived ? "retiré" : null].filter(Boolean).join(", ")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => patch.mutate({ id: e.id, body: { favorite: !e.favorite } })}
                  className={cn("grid size-8 shrink-0 place-items-center rounded-lg hover:bg-surface-2", e.favorite ? "text-accent" : "text-ink-3")}
                  aria-label={e.favorite ? `Retirer ${e.number} des favoris` : `Ajouter ${e.number} aux favoris`}
                  aria-pressed={e.favorite}
                >
                  <Star className={cn("size-3.5", e.favorite ? "fill-current" : "")} aria-hidden="true" />
                </button>
                <ActionMenu
                  actions={[
                    { label: "Modifier", icon: <Pencil />, onSelect: () => setEditing({ entry: e, parent }) },
                    ...(!e.parentId ? [{ label: "Ajouter un sous-lot", icon: <Plus />, onSelect: () => setEditing({ entry: null, parent: e }) }] : []),
                    { label: "Séparer en deux lots", icon: <Scissors />, onSelect: () => setSplitting(e) },
                    { label: e.archived ? "Rétablir" : "Retirer de la nomenclature", icon: <Trash2 />, onSelect: () => patch.mutate({ id: e.id, body: { archived: !e.archived } }) },
                    { label: "Supprimer définitivement", icon: <Trash2 />, tone: "danger" as const, onSelect: () => remove.mutate(e.id) },
                  ]}
                />
              </li>
            );
          })}
        </ul>
        {entries.length === 0 ? <p className="p-6 text-center text-xs text-ink-3">Aucun lot ne correspond.</p> : null}
      </Card>

      <EntryDialog catalogId={catalog.id} target={editing} onOpenChange={(open) => !open && setEditing(null)} onSaved={refresh} />
      <SplitDialog entry={splitting} onOpenChange={(open) => !open && setSplitting(null)} onSaved={refresh} />
      <MergeEntriesDialog
        open={merging}
        catalogId={catalog.id}
        entries={catalog.entries.filter((e) => selected.has(e.id))}
        onOpenChange={setMerging}
        onSaved={() => {
          setSelected(new Set());
          void refresh();
        }}
      />
      <CatalogDialog open={creating} catalogs={catalogs} onOpenChange={setCreating} onSaved={(id) => {
        setCatalogId(id);
        void refresh();
      }} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Supprimer cette nomenclature ?"
        text={deleting ? `La nomenclature « ${deleting.name} » sera supprimée. Les affaires qui en ont repris des lots les gardent tels quels.` : ""}
        confirmLabel="Supprimer"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await api(`/lot-catalogs/${deleting.id}`, { method: "DELETE" });
            toast.success("Nomenclature supprimée.");
            setCatalogId("");
            await refresh();
          } catch (error) {
            toast.error(errorMessage(error));
            throw error;
          }
        }}
      />
    </div>
  );
}

function fieldErrors(e: unknown): Record<string, string> {
  return e instanceof ApiError ? e.fields : {};
}

function EntryDialog({ catalogId, target, onOpenChange, onSaved }: { catalogId: string; target: { entry: LotCatalogEntry | null; parent: LotCatalogEntry | null } | null; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [values, setValues] = useState({ number: "", name: "", tradeFamily: "gros_oeuvre" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  useEffect(() => {
    if (!target) return;
    const { entry, parent } = target;
    setValues(entry ? { number: entry.number, name: entry.name, tradeFamily: entry.tradeFamily } : { number: parent ? `${parent.number}.` : "", name: "", tradeFamily: parent?.tradeFamily ?? "gros_oeuvre" });
    setErrors({});
    setGeneral(null);
  }, [target]);
  const save = useMutation({
    mutationFn: () =>
      target?.entry
        ? api(`/lot-catalog-entries/${target.entry.id}`, { method: "PATCH", body: values })
        : api(`/lot-catalogs/${catalogId}/entries`, { body: { ...values, parentId: target?.parent?.id ?? null } }),
    onSuccess: () => {
      toast.success(target?.entry ? "Lot mis à jour dans la nomenclature." : "Lot ajouté à la nomenclature.");
      onOpenChange(false);
      onSaved();
    },
    onError: (e) => (Object.keys(fieldErrors(e)).length ? setErrors(fieldErrors(e)) : setGeneral(errorMessage(e))),
  });
  return (
    <Modal
      open={target !== null}
      onOpenChange={onOpenChange}
      title={target?.entry ? "Modifier le lot" : target?.parent ? `Nouveau sous-lot de ${target.parent.number}` : "Nouveau lot"}
      size="sm"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        save.mutate();
      }}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" loading={save.isPending}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {general ? <InlineError>{general}</InlineError> : null}
        <div className="grid grid-cols-[6.5rem_1fr] gap-3">
          <Field label="Numéro" value={values.number} onChange={(e) => setValues((v) => ({ ...v, number: e.target.value }))} error={errors.number} maxLength={20} />
          <Field label="Intitulé" value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} error={errors.name} />
        </div>
        <SelectField label="Corps d’état" options={familyOptions} value={values.tradeFamily} onChange={(e) => setValues((v) => ({ ...v, tradeFamily: e.target.value }))} error={errors.tradeFamily} />
      </div>
    </Modal>
  );
}

function SplitDialog({ entry, onOpenChange, onSaved }: { entry: LotCatalogEntry | null; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [values, setValues] = useState({ number: "", name: "" });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setValues({ number: "", name: "" });
    setError(null);
  }, [entry]);
  const save = useMutation({
    mutationFn: () => api(`/lot-catalog-entries/${entry!.id}/split`, { body: values }),
    onSuccess: () => {
      toast.success("Lot séparé : le nouveau lot suit l’original.");
      onOpenChange(false);
      onSaved();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Modal
      open={entry !== null}
      onOpenChange={onOpenChange}
      title="Séparer en deux lots"
      description={entry ? `Le lot ${entry.number}, ${entry.name}, reste en place ; un second lot du même corps d’état est créé. Renommez l’original si besoin.` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={save.isPending} disabled={!values.number.trim() || !values.name.trim()} onClick={() => save.mutate()}>
            Créer le second lot
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        {error ? <InlineError>{error}</InlineError> : null}
        <div className="grid grid-cols-[6.5rem_1fr] gap-3">
          <Field label="Numéro" value={values.number} onChange={(e) => setValues((v) => ({ ...v, number: e.target.value }))} maxLength={20} />
          <Field label="Intitulé" value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} />
        </div>
      </div>
    </Modal>
  );
}

function MergeEntriesDialog({ open, catalogId, entries, onOpenChange, onSaved }: { open: boolean; catalogId: string; entries: LotCatalogEntry[]; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [values, setValues] = useState({ number: "", name: "" });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const first = [...entries].sort((a, b) => a.position - b.position)[0];
    setValues({ number: first?.number ?? "", name: entries.map((e) => e.name).join(" et ") });
    setError(null);
  }, [open, entries]);
  const save = useMutation({
    mutationFn: () => api(`/lot-catalogs/${catalogId}/merge`, { body: { entryIds: entries.map((e) => e.id), ...values } }),
    onSuccess: () => {
      toast.success("Lots fusionnés dans la nomenclature.");
      onOpenChange(false);
      onSaved();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Fusionner des lots"
      description="Les lots fusionnés sont retirés de la nomenclature (conservés, jamais effacés) et remplacés par un seul lot ; leurs sous-lots le suivent."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={save.isPending} disabled={!values.number.trim() || !values.name.trim()} onClick={() => save.mutate()}>
            Fusionner
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        {error ? <InlineError>{error}</InlineError> : null}
        <div className="flex flex-wrap gap-1.5">
          {entries.map((e) => (
            <Badge key={e.id}>{`${e.number} ${e.name}`}</Badge>
          ))}
        </div>
        <div className="grid grid-cols-[6.5rem_1fr] gap-3">
          <Field label="Numéro" value={values.number} onChange={(e) => setValues((v) => ({ ...v, number: e.target.value }))} maxLength={20} />
          <Field label="Intitulé" value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} />
        </div>
      </div>
    </Modal>
  );
}

function CatalogDialog({ open, catalogs, onOpenChange, onSaved }: { open: boolean; catalogs: LotCatalog[]; onOpenChange: (open: boolean) => void; onSaved: (id: string) => void }) {
  const [values, setValues] = useState({ name: "", country: "", projectType: "", copyFrom: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setValues({ name: "", country: "", projectType: "", copyFrom: catalogs.find((c) => c.isDefault)?.id ?? "" });
    setErrors({});
  }, [open, catalogs]);
  const save = useMutation({
    mutationFn: () => api<{ catalog: { id: string } }>("/lot-catalogs", { body: { name: values.name, country: values.country || null, projectType: values.projectType || null, copyFrom: values.copyFrom || null } }),
    onSuccess: (res) => {
      toast.success("Nomenclature créée.");
      onOpenChange(false);
      onSaved(res.catalog.id);
    },
    onError: (e) => setErrors(fieldErrors(e)),
  });
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Nouvelle nomenclature"
      description="Partez d’une nomenclature existante pour l’adapter (pays, type d’opération, découpage propre à un maître d’ouvrage)."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={save.isPending} disabled={!values.name.trim()} onClick={() => save.mutate()}>
            Créer
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Nom" value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} error={errors.name} placeholder="Marchés publics, Maroc" />
        <SelectField label="Pays" optional placeholder="France et Maroc" options={[{ value: "FR", label: "France" }, { value: "MA", label: "Maroc" }]} value={values.country} onChange={(e) => setValues((v) => ({ ...v, country: e.target.value }))} />
        <SelectField label="Type d’opération" optional placeholder="Tous" options={Object.entries(PROJECT_TYPES).map(([value, label]) => ({ value, label }))} value={values.projectType} onChange={(e) => setValues((v) => ({ ...v, projectType: e.target.value }))} />
        <SelectField label="Copier les lots de" optional placeholder="Nomenclature vide" options={catalogs.map((c) => ({ value: c.id, label: c.name }))} value={values.copyFrom} onChange={(e) => setValues((v) => ({ ...v, copyFrom: e.target.value }))} />
      </div>
    </Modal>
  );
}
