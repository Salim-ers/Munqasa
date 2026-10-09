import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { Archive, ArchiveRestore, Check, History, Library, Pencil, Plus, RotateCcw, Store, Upload, X } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { COUNTRY_LABELS, CURRENCIES, PRICE_KIND_LABELS, PRICE_ORIGIN_LABELS, VALIDATION_STATUS_LABELS } from "../../../shared/enums";
import { priceItemInput } from "../../../shared/schemas";
import type { AlertSettings } from "../../../shared/settings";
import { TRADE_FAMILIES, tradeLabel } from "../../../shared/trades";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { DataTable, Pagination } from "../../components/ui/DataTable";
import { Modal } from "../../components/ui/Dialog";
import { EmptyState, InlineError, Skeleton } from "../../components/ui/Feedback";
import { Field, optionsOf, SelectField, TextareaField } from "../../components/ui/Field";
import { ActionMenu } from "../../components/ui/Menu";
import { PageHeader } from "../../components/ui/PageHeader";
import { SearchInput } from "../../components/ui/SearchInput";
import { Segmented } from "../../components/ui/Segmented";
import { api, ApiError, errorMessage, query } from "../../lib/api";
import { cn } from "../../lib/cn";
import { formatDate, formatDateTime, formatMoney } from "../../lib/format";
import { useListParams } from "../../lib/list-params";
import type { Paged, PriceHistoryEntry, PriceItem, Supplier } from "../../lib/types";
import { PriceImportDialog } from "./PriceImportDialog";
import { SuppliersDialog } from "./SuppliersDialog";

const PAGE_SIZE = 25;
const KEY = ["library"] as const;
const col = createColumnHelper<PriceItem>();
const statusTone = { a_verifier: "warning", verifie: "success", rejete: "neutral" } as const;

/** Liste déroulante compacte des barres de filtres. */
function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: ReadonlyArray<{ value: string; label: string }> }) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full appearance-none rounded-xl border border-line-strong bg-surface pr-8 pl-3 text-xs text-ink outline-none focus:border-accent sm:w-auto"
      >
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-ink-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </label>
  );
}

/** Un prix plus ancien que le seuil des paramètres d'alerte est à revoir. */
function isStale(priceDate: string, months: number | undefined): boolean {
  if (!months) return false;
  const limit = new Date();
  limit.setMonth(limit.getMonth() - months);
  return priceDate < limit.toISOString().slice(0, 10);
}

export function LibraryPage() {
  const queryClient = useQueryClient();
  const list = useListParams({ id: "date", desc: true });
  const q = list.get("q");
  const kind = list.get("nature");
  const country = list.get("pays");
  const status = list.get("statut");
  const archived = list.get("archives") === "1";
  const [editing, setEditing] = useState<PriceItem | null | undefined>(undefined);
  const [history, setHistory] = useState<PriceItem | null>(null);
  const [importing, setImporting] = useState(false);
  const [suppliers, setSuppliers] = useState(false);

  const prices = useQuery({
    queryKey: [...KEY, "prices", { q, kind, country, status, archived, page: list.page, sort: list.sortQuery }],
    queryFn: ({ signal }) =>
      api<Paged<PriceItem>>(`/library/prices${query({ q, nature: kind, pays: country, statut: status, archives: archived ? 1 : null, page: list.page, pageSize: PAGE_SIZE, ...list.sortQuery })}`, { signal }),
    placeholderData: keepPreviousData,
  });
  const alerts = useQuery({ queryKey: ["settings", "alertes"], queryFn: ({ signal }) => api<{ value: AlertSettings }>("/settings/alertes", { signal }) });
  const staleMonths = alerts.data?.value.stalePriceMonths;
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: KEY });
    void queryClient.invalidateQueries({ queryKey: ["agents", "status"] });
  };

  const verify = useMutation({
    mutationFn: ({ id, status: next }: { id: string; status: "verifie" | "a_verifier" | "rejete" }) => api(`/library/prices/${id}/verify`, { body: { status: next } }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const archive = useMutation({
    mutationFn: (price: PriceItem) => api(`/library/prices/${price.id}/archive`, { body: { archived: !price.archivedAt } }),
    onSuccess: (_, price) => {
      refresh();
      toast.success(price.archivedAt ? "Prix restauré." : "Prix archivé : il n’est plus proposé aux sous-détails.");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const actions = (p: PriceItem) => [
    { label: "Modifier", icon: <Pencil />, onSelect: () => setEditing(p) },
    { label: "Historique des valeurs", icon: <History />, onSelect: () => setHistory(p) },
    ...(p.verificationStatus !== "a_verifier" ? [{ label: "Remettre à vérifier", icon: <RotateCcw />, onSelect: () => verify.mutate({ id: p.id, status: "a_verifier" }) }] : []),
    ...(p.verificationStatus !== "rejete" ? [{ label: "Rejeter", icon: <X />, onSelect: () => verify.mutate({ id: p.id, status: "rejete" }) }] : []),
    p.archivedAt ? { label: "Restaurer", icon: <ArchiveRestore />, onSelect: () => archive.mutate(p) } : { label: "Archiver", icon: <Archive />, onSelect: () => archive.mutate(p) },
  ];

  const statusCell = (p: PriceItem) => (
    <div className="flex items-center justify-end gap-1.5">
      <Badge tone={statusTone[p.verificationStatus]} dot>
        {VALIDATION_STATUS_LABELS[p.verificationStatus]}
      </Badge>
      {p.verificationStatus !== "verifie" ? (
        <Button size="sm" variant="ghost" icon={<Check className="size-3.5" />} onClick={() => verify.mutate({ id: p.id, status: "verifie" })} aria-label={`Marquer ${p.designation} comme vérifié`}>
          <span className="hidden xl:inline">Vérifié</span>
        </Button>
      ) : null}
    </div>
  );

  const columns = [
    col.accessor("designation", {
      id: "designation",
      header: "Désignation",
      cell: (info) => {
        const p = info.row.original;
        return (
          <div className="min-w-0">
            <p className="font-semibold text-ink">{p.designation}</p>
            <p className="truncate text-2xs text-ink-3">{[p.code, p.subFamily ?? (p.tradeFamily ? tradeLabel(p.tradeFamily) : null), p.supplierName].filter(Boolean).join(", ")}</p>
          </div>
        );
      },
    }),
    col.accessor("kind", { header: "Nature", enableSorting: false, cell: (info) => <Badge>{PRICE_KIND_LABELS[info.getValue()]}</Badge> }),
    col.accessor("unitPrice", {
      id: "prix",
      header: "Prix unitaire",
      meta: { align: "right" },
      cell: (info) => (
        <span className="font-semibold whitespace-nowrap text-ink tabular">
          {formatMoney(info.getValue(), info.row.original.currency)}
          <span className="font-normal text-ink-3"> / {info.row.original.unit}</span>
        </span>
      ),
    }),
    col.accessor("priceDate", {
      id: "date",
      header: "Date",
      cell: (info) => (
        <div className="whitespace-nowrap">
          <p className="text-ink-2">{formatDate(info.getValue())}</p>
          <p className="text-2xs text-ink-3">{isStale(info.getValue(), staleMonths) ? <span className="text-warning">Ancien, à revoir</span> : COUNTRY_LABELS[info.row.original.country]}</p>
        </div>
      ),
    }),
    col.accessor("origin", { header: "Provenance", enableSorting: false, cell: (info) => <span className="text-2xs text-ink-2">{PRICE_ORIGIN_LABELS[info.getValue()]}</span> }),
    col.display({ id: "statut", header: "Statut", meta: { align: "right" }, cell: (info) => statusCell(info.row.original) }),
    col.display({ id: "actions", header: () => <span className="sr-only">Actions</span>, meta: { align: "right", className: "w-12" }, cell: (info) => <ActionMenu actions={actions(info.row.original)} /> }),
  ];

  const filtered = Boolean(q || kind || country || status);
  const data = prices.data;
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Bibliothèque de prix"
        description="Vos prix, chacun avec sa provenance, sa date et sa zone. L’agent des sous-détails ne chiffre qu’avec ces prix ; un prix à vérifier ou ancien reste signalé par le contrôle qualité."
        actions={
          <>
            <Button variant="secondary" icon={<Store className="size-4" />} onClick={() => setSuppliers(true)}>
              Fournisseurs
            </Button>
            <Button variant="secondary" icon={<Upload className="size-4" />} onClick={() => setImporting(true)}>
              Importer un fichier
            </Button>
            <Button icon={<Plus className="size-4" />} onClick={() => setEditing(null)}>
              Ajouter un prix
            </Button>
          </>
        }
      />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 p-4 sm:p-5 xl:flex-row xl:items-center xl:justify-between">
          <SearchInput value={q} onChange={(v) => list.set({ q: v })} placeholder="Désignation, code, sous-famille" label="Rechercher un prix" className="xl:w-80" />
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <FilterSelect label="Toutes natures" value={kind} onChange={(v) => list.set({ nature: v })} options={optionsOf(PRICE_KIND_LABELS)} />
            <FilterSelect label="Tous pays" value={country} onChange={(v) => list.set({ pays: v })} options={optionsOf(COUNTRY_LABELS)} />
            <FilterSelect label="Tous statuts" value={status} onChange={(v) => list.set({ statut: v })} options={optionsOf(VALIDATION_STATUS_LABELS)} />
            <Segmented
              value={archived ? "archives" : "actifs"}
              onChange={(v) => list.set({ archives: v === "archives" ? "1" : null })}
              options={[
                { value: "actifs", label: "En service" },
                { value: "archives", label: "Archivés" },
              ]}
              label="Afficher"
              className="col-span-2 sm:col-span-1"
            />
          </div>
        </div>
        <DataTable
          label="Prix de la bibliothèque"
          columns={columns}
          data={data?.items}
          loading={prices.isPending}
          getRowId={(p) => p.id}
          sort={list.sort}
          onSortChange={list.setSort}
          cardsBelow="xl"
          minWidth="60rem"
          empty={
            <EmptyState
              icon={<Library className="size-5" />}
              title={filtered ? "Aucun prix ne correspond" : archived ? "Aucun prix archivé" : "Bibliothèque vide"}
              text={filtered || archived ? undefined : "Importez vos bordereaux, devis fournisseurs ou anciennes DPGF en CSV ou Excel, ou ajoutez vos prix un par un. Aucun prix n’est fourni d’office."}
              action={
                !filtered && !archived ? (
                  <Button size="sm" icon={<Upload className="size-3.5" />} onClick={() => setImporting(true)}>
                    Importer un fichier
                  </Button>
                ) : undefined
              }
            />
          }
          mobileCard={(p) => (
            <div className="flex items-start gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{p.designation}</p>
                <p className="mt-0.5 text-2xs text-ink-3">{[PRICE_KIND_LABELS[p.kind], formatDate(p.priceDate), PRICE_ORIGIN_LABELS[p.origin]].join(", ")}</p>
                <p className="mt-1 text-xs font-semibold text-ink tabular">
                  {formatMoney(p.unitPrice, p.currency)}
                  <span className="font-normal text-ink-3"> / {p.unit}</span>
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge tone={statusTone[p.verificationStatus]} dot>
                    {VALIDATION_STATUS_LABELS[p.verificationStatus]}
                  </Badge>
                  {isStale(p.priceDate, staleMonths) ? <Badge tone="warning">Ancien</Badge> : null}
                </div>
              </div>
              {p.verificationStatus !== "verifie" ? <Button size="sm" variant="ghost" icon={<Check className="size-3.5" />} onClick={() => verify.mutate({ id: p.id, status: "verifie" })} aria-label={`Marquer ${p.designation} comme vérifié`} /> : null}
              <ActionMenu actions={actions(p)} />
            </div>
          )}
        />
        {data ? <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={list.setPage} /> : null}
      </Card>
      <PriceDialog open={editing !== undefined} onOpenChange={(open) => !open && setEditing(undefined)} price={editing ?? null} onSaved={refresh} />
      <HistoryDialog price={history} onOpenChange={(open) => !open && setHistory(null)} />
      <PriceImportDialog open={importing} onOpenChange={setImporting} onImported={refresh} />
      <SuppliersDialog open={suppliers} onOpenChange={setSuppliers} />
    </div>
  );
}

function PriceDialog({ open, onOpenChange, price, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; price: PriceItem | null; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const blank = {
    designation: "",
    code: "",
    kind: "materiau",
    unit: "",
    unitPrice: "",
    currency: "MAD",
    country: "MA",
    region: "",
    city: "",
    tradeFamily: "",
    subFamily: "",
    origin: "devis_fournisseur",
    supplierId: "",
    sourceRef: "",
    priceDate: today,
    commercialConditions: "",
  };
  const [values, setValues] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const suppliers = useQuery({ queryKey: [...KEY, "suppliers"], queryFn: ({ signal }) => api<{ items: Supplier[] }>("/library/suppliers", { signal }), enabled: open });

  useEffect(() => {
    if (!open) return;
    setValues(
      price
        ? {
            designation: price.designation,
            code: price.code ?? "",
            kind: price.kind,
            unit: price.unit,
            unitPrice: String(Number(price.unitPrice)).replace(".", ","),
            currency: price.currency,
            country: price.country,
            region: price.region ?? "",
            city: price.city ?? "",
            tradeFamily: price.tradeFamily ?? "",
            subFamily: price.subFamily ?? "",
            origin: price.origin,
            supplierId: price.supplierId ?? "",
            sourceRef: price.sourceRef ?? "",
            priceDate: price.priceDate,
            commercialConditions: price.commercialConditions ?? "",
          }
        : blank,
    );
    setErrors({});
    setGeneral(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, price]);

  const save = useMutation({
    mutationFn: (data: unknown) => (price ? api<{ price: PriceItem }>(`/library/prices/${price.id}`, { method: "PATCH", body: data }) : api<{ price: PriceItem }>("/library/prices", { body: data })),
    onSuccess: (r) => {
      onSaved();
      const revalued = price && (Number(r.price.unitPrice) !== Number(price.unitPrice) || r.price.priceDate !== price.priceDate || r.price.currency !== price.currency);
      toast.success(!price ? "Prix ajouté, à vérifier." : revalued ? "Nouvelle valeur enregistrée et historisée, à vérifier." : "Prix modifié.");
      onOpenChange(false);
    },
    onError: (e) => (e instanceof ApiError && Object.keys(e.fields).length ? setErrors(e.fields) : setGeneral(errorMessage(e))),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = priceItemInput.safeParse(values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[issue.path.join(".")] ??= issue.message;
      return setErrors(next);
    }
    setErrors({});
    save.mutate(parsed.data);
  }

  const set = (key: keyof typeof values, value: string) => setValues((v) => ({ ...v, [key]: value }));
  const family = TRADE_FAMILIES.find((t) => t.key === values.tradeFamily);
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={price ? "Modifier le prix" : "Nouveau prix"}
      description="Un prix sert de coût dans les sous-détails : indiquez d’où il vient et à quelle date il a été relevé. Toute nouvelle valeur est historisée."
      size="lg"
      onSubmit={submit}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" loading={save.isPending}>
            {price ? "Enregistrer" : "Ajouter"}
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
        <Field label="Désignation" className="sm:col-span-2" value={values.designation} onChange={(e) => set("designation", e.target.value)} error={errors.designation} placeholder="Béton C25/30 prêt à l’emploi" />
        <SelectField label="Nature" options={optionsOf(PRICE_KIND_LABELS)} value={values.kind} onChange={(e) => set("kind", e.target.value)} />
        <Field label="Code" optional value={values.code} onChange={(e) => set("code", e.target.value)} error={errors.code} />
        <Field label="Prix unitaire" inputMode="decimal" value={values.unitPrice} onChange={(e) => set("unitPrice", e.target.value)} error={errors.unitPrice} />
        <Field label="Unité" value={values.unit} onChange={(e) => set("unit", e.target.value)} error={errors.unit} placeholder="m3, kg, h, jour, u" />
        <SelectField label="Devise" options={CURRENCIES.map((c) => ({ value: c, label: c }))} value={values.currency} onChange={(e) => set("currency", e.target.value)} />
        <SelectField label="Pays" options={optionsOf(COUNTRY_LABELS)} value={values.country} onChange={(e) => set("country", e.target.value)} />
        <Field label="Région" optional value={values.region} onChange={(e) => set("region", e.target.value)} />
        <Field label="Ville" optional value={values.city} onChange={(e) => set("city", e.target.value)} />
        <SelectField label="Famille" optional placeholder="Aucune" options={TRADE_FAMILIES.map((t) => ({ value: t.key, label: t.label }))} value={values.tradeFamily} onChange={(e) => set("tradeFamily", e.target.value)} />
        <SelectField
          label="Sous-famille"
          optional
          placeholder="Aucune"
          options={(family?.subFamilies ?? (values.subFamily ? [values.subFamily] : [])).map((s) => ({ value: s, label: s }))}
          value={values.subFamily}
          onChange={(e) => set("subFamily", e.target.value)}
          disabled={!family && !values.subFamily}
        />
        <SelectField label="Provenance" options={optionsOf(PRICE_ORIGIN_LABELS)} value={values.origin} onChange={(e) => set("origin", e.target.value)} />
        <Field label="Date du prix" type="date" value={values.priceDate} onChange={(e) => set("priceDate", e.target.value)} error={errors.priceDate} />
        <SelectField
          label="Fournisseur"
          optional
          placeholder={suppliers.isPending ? "Chargement…" : "Aucun"}
          options={(suppliers.data?.items ?? []).map((s) => ({ value: s.id, label: `${s.name}${s.city ? `, ${s.city}` : ""}` }))}
          value={values.supplierId}
          onChange={(e) => set("supplierId", e.target.value)}
        />
        <Field label="Référence dans la source" optional value={values.sourceRef} onChange={(e) => set("sourceRef", e.target.value)} placeholder="Devis n° 2026-118, ligne 4" />
        <TextareaField label="Conditions commerciales" optional className="sm:col-span-2" rows={2} value={values.commercialConditions} onChange={(e) => set("commercialConditions", e.target.value)} placeholder="Franco chantier, minimum de commande, validité…" />
      </div>
    </Modal>
  );
}

function HistoryDialog({ price, onOpenChange }: { price: PriceItem | null; onOpenChange: (open: boolean) => void }) {
  const history = useQuery({
    queryKey: [...KEY, "history", price?.id],
    queryFn: ({ signal }) => api<{ items: PriceHistoryEntry[] }>(`/library/prices/${price!.id}/history`, { signal }),
    enabled: Boolean(price),
  });
  const items = history.data?.items ?? [];
  return (
    <Modal open={price !== null} onOpenChange={onOpenChange} title="Historique des valeurs" description={price?.designation} size="md">
      {history.isPending ? (
        <Skeleton className="h-24" />
      ) : items.length === 0 ? (
        <EmptyState title="Aucune valeur enregistrée" />
      ) : (
        <ol className="grid gap-2">
          {items.map((h, i) => (
            <HistoryRow key={h.id} current={i === 0}>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-ink tabular">
                  {formatMoney(h.unitPrice, h.currency)}
                  {price ? <span className="font-normal text-ink-3"> / {price.unit}</span> : null}
                </p>
                <p className="text-2xs text-ink-3">{[`prix du ${formatDate(h.priceDate)}`, PRICE_ORIGIN_LABELS[h.origin], h.note].filter(Boolean).join(", ")}</p>
              </div>
              <p className="shrink-0 text-2xs text-ink-3">{formatDateTime(h.recordedAt)}</p>
            </HistoryRow>
          ))}
        </ol>
      )}
    </Modal>
  );
}

function HistoryRow({ current, children }: { current: boolean; children: ReactNode }) {
  return <li className={cn("flex items-start gap-3 rounded-xl border p-3", current ? "border-accent/30 bg-accent-soft" : "border-line")}>{children}</li>;
}
