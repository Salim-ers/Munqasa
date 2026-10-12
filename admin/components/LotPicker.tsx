import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Sparkles, Star, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { searchable } from "../../shared/lots";
import { TRADE_FAMILIES, tradeLabel } from "../../shared/trades";
import { api, errorMessage } from "../lib/api";
import { cn } from "../lib/cn";
import type { LotCatalogEntry, LotCatalogList } from "../lib/types";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Dialog";
import { InlineError, Skeleton } from "./ui/Feedback";
import { Field, SelectField } from "./ui/Field";

type Custom = { code: string; name: string; tradeFamily: string };

/**
 * Sélecteur de lots : nomenclature au choix, recherche instantanée par numéro ou intitulé, regroupement par
 * corps d'état, sélection multiple et « tout sélectionner », favoris, lots récents, suggestions de l'analyse des
 * plans, lot personnalisé. Les lots déjà présents dans l'affaire restent tels quels (jamais renumérotés).
 */
export function LotPickerDialog({ open, onOpenChange, projectId, existingCodes, onAdded }: { open: boolean; onOpenChange: (open: boolean) => void; projectId: string; existingCodes: string[]; onAdded: () => void }) {
  const queryClient = useQueryClient();
  const catalogs = useQuery({ queryKey: ["lot-catalogs"], queryFn: ({ signal }) => api<LotCatalogList>("/lot-catalogs", { signal }), enabled: open });
  const suggestions = useQuery({
    queryKey: ["project", projectId, "lot-suggestions"],
    queryFn: ({ signal }) => api<{ suggestions: Array<{ number: string; elements: number; examples: string[] }> }>(`/projects/${projectId}/lot-suggestions`, { signal }),
    enabled: open,
  });
  const [catalogId, setCatalogId] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customs, setCustoms] = useState<Custom[]>([]);
  const [draft, setDraft] = useState<Custom>({ code: "", name: "", tradeFamily: "gros_oeuvre" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setSelected(new Set());
    setCustoms([]);
    setError(null);
  }, [open]);
  const list = catalogs.data?.catalogs ?? [];
  const catalog = list.find((c) => c.id === catalogId) ?? list.find((c) => c.isDefault) ?? list[0];
  const existing = useMemo(() => new Set(existingCodes), [existingCodes]);
  const entries = useMemo(() => (catalog?.entries ?? []).filter((e) => !e.archived), [catalog]);
  const query = searchable(search.trim());
  const matches = (e: LotCatalogEntry) => !query || searchable(`${e.number} ${e.name}`).includes(query);
  const visible = entries.filter(matches);
  const suggested = (suggestions.data?.suggestions ?? []).map((s) => ({ ...s, entry: entries.find((e) => e.number === s.number && !e.parentId) })).filter((s) => s.entry);
  const favorites = entries.filter((e) => e.favorite);
  const recent = (catalogs.data?.recent ?? []).filter((r) => !existing.has(r.code)).slice(0, 6);

  const toggle = (id: string, on?: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on ?? !next.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });
  const selectable = (e: LotCatalogEntry) => !existing.has(e.number);
  const allVisibleSelected = visible.filter(selectable).length > 0 && visible.filter(selectable).every((e) => selected.has(e.id));

  const favorite = useMutation({
    mutationFn: (e: LotCatalogEntry) => api(`/lot-catalog-entries/${e.id}`, { method: "PATCH", body: { favorite: !e.favorite } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lot-catalogs"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const add = useMutation({
    mutationFn: () =>
      api<{ created: Array<{ code: string }>; skipped: Array<{ code: string; reason: string }> }>(`/projects/${projectId}/lots/bulk`, {
        body: { selections: [...[...selected].map((catalogEntryId) => ({ catalogEntryId })), ...customs] },
      }),
    onSuccess: (result) => {
      toast.success(result.skipped.length ? `${result.created.length} lot(s) ajouté(s), ${result.skipped.length} déjà présent(s) laissé(s) tel(s) quel(s).` : `${result.created.length} lot(s) ajouté(s).`);
      void queryClient.invalidateQueries({ queryKey: ["lot-catalogs"] });
      onAdded();
      onOpenChange(false);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const count = selected.size + customs.length;
  const groups = TRADE_FAMILIES.map((family) => ({ family, items: visible.filter((e) => e.tradeFamily === family.key) })).filter((g) => g.items.length);
  const row = (e: LotCatalogEntry) => {
    const taken = existing.has(e.number);
    return (
      <li key={e.id} className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5", e.parentId ? "ml-6" : "", taken ? "opacity-60" : "hover:bg-surface-2")}>
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
          <input type="checkbox" className="size-4 shrink-0 accent-[var(--accent)]" disabled={taken} checked={selected.has(e.id)} onChange={(ev) => toggle(e.id, ev.target.checked)} aria-label={`${e.number} ${e.name}`} />
          <span className="grid h-7 min-w-11 shrink-0 place-items-center rounded-md bg-surface-2 px-1.5 text-2xs font-semibold text-ink tabular">{e.number}</span>
          <span className="min-w-0 truncate text-xs text-ink">{e.name}</span>
          {taken ? <span className="shrink-0 text-2xs text-ink-3">déjà dans l’affaire</span> : null}
        </label>
        <button
          type="button"
          onClick={() => favorite.mutate(e)}
          className={cn("grid size-8 shrink-0 place-items-center rounded-lg hover:bg-surface-3", e.favorite ? "text-accent" : "text-ink-3")}
          aria-label={e.favorite ? `Retirer ${e.number} ${e.name} des favoris` : `Ajouter ${e.number} ${e.name} aux favoris`}
          aria-pressed={e.favorite}
        >
          <Star className={cn("size-3.5", e.favorite ? "fill-current" : "")} aria-hidden="true" />
        </button>
      </li>
    );
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Ajouter des lots"
      description="Nomenclature interne indicative et modifiable : les numéros et intitulés choisis sont recopiés dans l’affaire, ceux déjà présents ne changent pas."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={add.isPending} disabled={count === 0} onClick={() => add.mutate()}>
            {count ? `Ajouter ${count} lot(s)` : "Ajouter"}
          </Button>
        </>
      }
    >
      {catalogs.isPending ? (
        <Skeleton className="h-64" />
      ) : catalogs.error ? (
        <InlineError>{errorMessage(catalogs.error)}</InlineError>
      ) : (
        <div className="grid gap-4">
          {error ? <InlineError>{error}</InlineError> : null}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
            <SelectField label="Nomenclature" options={list.map((c) => ({ value: c.id, label: c.isDefault ? `${c.name} (par défaut)` : c.name }))} value={catalog?.id ?? ""} onChange={(e) => setCatalogId(e.target.value)} />
            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-ink-2">Rechercher</span>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Numéro ou intitulé : 01, plomberie, façades…"
                  aria-label="Rechercher un lot"
                  className="h-10 w-full rounded-xl border border-line bg-surface pr-3 pl-9 text-xs text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)]"
                />
              </div>
            </div>
          </div>

          {suggested.length || favorites.length || recent.length ? (
            <div className="grid gap-2">
              {suggested.length ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="flex items-center gap-1 text-2xs font-semibold text-ink-3">
                    <Sparkles className="size-3.5" aria-hidden="true" />
                    Suggérés par l’analyse des plans
                  </span>
                  {suggested.map((s) => (
                    <button
                      key={s.number}
                      type="button"
                      disabled={!s.entry || existing.has(s.number)}
                      onClick={() => s.entry && toggle(s.entry.id, true)}
                      title={s.examples.join(", ")}
                      className="rounded-full border border-line px-2.5 py-1 text-2xs text-ink-2 hover:border-accent hover:text-accent disabled:opacity-50"
                    >
                      {`${s.number} ${s.entry!.name}, ${s.elements} élément(s)`}
                    </button>
                  ))}
                </div>
              ) : null}
              {favorites.length ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-2xs font-semibold text-ink-3">Favoris</span>
                  {favorites.map((e) => (
                    <button key={e.id} type="button" disabled={existing.has(e.number)} onClick={() => toggle(e.id, true)} className="rounded-full border border-line px-2.5 py-1 text-2xs text-ink-2 hover:border-accent hover:text-accent disabled:opacity-50">
                      {`${e.number} ${e.name}`}
                    </button>
                  ))}
                </div>
              ) : null}
              {recent.length ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-2xs font-semibold text-ink-3">Récents</span>
                  {recent.map((r) => {
                    const match = entries.find((e) => e.number === r.code && e.name === r.name);
                    return (
                      <button
                        key={`${r.code}${r.name}`}
                        type="button"
                        onClick={() => (match ? toggle(match.id, true) : setCustoms((c) => (c.some((x) => x.code === r.code) ? c : [...c, { code: r.code, name: r.name, tradeFamily: r.tradeFamily }])))}
                        className="rounded-full border border-line px-2.5 py-1 text-2xs text-ink-2 hover:border-accent hover:text-accent"
                      >
                        {`${r.code} ${r.name}`}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <p className="text-2xs text-ink-3">{`${visible.length} lot(s)${query ? " correspondant à la recherche" : ""}, ${count} sélectionné(s)`}</p>
            <Button size="sm" variant="ghost" disabled={visible.filter(selectable).length === 0} onClick={() => visible.filter(selectable).forEach((e) => toggle(e.id, !allVisibleSelected))}>
              {allVisibleSelected ? "Tout désélectionner" : "Tout sélectionner"}
            </Button>
          </div>
          <div className="grid max-h-[22rem] gap-3 overflow-y-auto pr-1">
            {groups.length === 0 ? <p className="py-6 text-center text-xs text-ink-3">Aucun lot ne correspond : créez un lot personnalisé ci-dessous.</p> : null}
            {groups.map(({ family, items }) => {
              const free = items.filter(selectable);
              const all = free.length > 0 && free.every((e) => selected.has(e.id));
              return (
                <section key={family.key}>
                  <div className="flex items-center justify-between gap-2 border-b border-line pb-1">
                    <h3 className="text-2xs font-semibold tracking-wide text-ink-3 uppercase">{family.label}</h3>
                    <button type="button" disabled={free.length === 0} onClick={() => free.forEach((e) => toggle(e.id, !all))} className="text-2xs font-medium text-accent disabled:opacity-40">
                      {all ? "Désélectionner le groupe" : "Sélectionner le groupe"}
                    </button>
                  </div>
                  <ul className="mt-1 grid gap-0.5">{items.map(row)}</ul>
                </section>
              );
            })}
          </div>

          <div className="rounded-xl border border-line p-3">
            <p className="text-2xs font-semibold text-ink-2">Lot personnalisé</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-[6rem_1fr_minmax(0,12rem)_auto] sm:items-end">
              <Field label="Numéro" value={draft.code} onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))} maxLength={20} placeholder="31" />
              <Field label="Intitulé" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Désamiantage" />
              <SelectField label="Corps d’état" options={TRADE_FAMILIES.map((f) => ({ value: f.key, label: f.label }))} value={draft.tradeFamily} onChange={(e) => setDraft((d) => ({ ...d, tradeFamily: e.target.value }))} />
              <Button
                variant="secondary"
                icon={<Plus className="size-3.5" />}
                disabled={!draft.code.trim() || !draft.name.trim()}
                onClick={() => {
                  if (existing.has(draft.code.trim()) || customs.some((c) => c.code === draft.code.trim()) || entries.some((e) => selected.has(e.id) && e.number === draft.code.trim())) {
                    setError(`Le numéro ${draft.code.trim()} est déjà pris.`);
                    return;
                  }
                  setError(null);
                  setCustoms((c) => [...c, { code: draft.code.trim(), name: draft.name.trim(), tradeFamily: draft.tradeFamily }]);
                  setDraft({ code: "", name: "", tradeFamily: draft.tradeFamily });
                }}
              >
                Ajouter
              </Button>
            </div>
            {customs.length ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {customs.map((c) => (
                  <li key={c.code}>
                    <Badge tone="accent">
                      {`${c.code} ${c.name}, ${tradeLabel(c.tradeFamily)}`}
                      <button type="button" className="ml-1 inline-grid place-items-center" onClick={() => setCustoms((list) => list.filter((x) => x.code !== c.code))} aria-label={`Retirer ${c.code} ${c.name}`}>
                        <X className="size-3" aria-hidden="true" />
                      </button>
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      )}
    </Modal>
  );
}
