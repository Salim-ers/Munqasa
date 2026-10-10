import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { Archive, ArchiveRestore, Check, Copy, CopyCheck, Database, Eye, History, Library, Pencil, Plus, RotateCcw, SlidersHorizontal, Store, Upload, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  COUNTRY_LABELS,
  CURRENCIES,
  PRICE_KIND_LABELS,
  PRICE_ORIGIN_LABELS,
  PRICE_SCOPE_LABELS,
  PRICE_VALUE_STATUS_LABELS,
  RELIABILITY_LABELS,
  VALIDATION_STATUS_LABELS,
} from "../../../shared/enums";
import { defaultReliability, isStalePrice } from "../../../shared/prices";
import { priceItemInput, priceTaxIssue } from "../../../shared/schemas";
import type { AlertSettings } from "../../../shared/settings";
import { TRADE_FAMILIES, tradeLabel } from "../../../shared/trades";
import { DownloadMenu } from "../../components/DownloadMenu";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { DataTable, Pagination } from "../../components/ui/DataTable";
import { Modal } from "../../components/ui/Dialog";
import { EmptyState, InlineError } from "../../components/ui/Feedback";
import { Field, optionsOf, SelectField, TextareaField } from "../../components/ui/Field";
import { ActionMenu } from "../../components/ui/Menu";
import { PageHeader } from "../../components/ui/PageHeader";
import { SearchInput } from "../../components/ui/SearchInput";
import { Segmented } from "../../components/ui/Segmented";
import { api, ApiError, errorMessage, query } from "../../lib/api";
import { cn } from "../../lib/cn";
import { formatMoney } from "../../lib/format";
import { useListParams } from "../../lib/list-params";
import { reliabilityTone, whenLabel, zoneLabel } from "../../lib/prices";
import type { LibraryFacets, Paged, PriceItem, Supplier } from "../../lib/types";
import { DuplicatesDialog } from "./DuplicatesDialog";
import { PriceDetailDialog } from "./PriceDetailDialog";
import { PriceImportDialog } from "./PriceImportDialog";
import { PriceSourcesDialog } from "./PriceSourcesDialog";
import { SuppliersDialog } from "./SuppliersDialog";

const PAGE_SIZE = 25;
const KEY = ["library"] as const;
const col = createColumnHelper<PriceItem>();
const statusTone = { a_verifier: "warning", verifie: "success", rejete: "neutral" } as const;
/** Paramètres d'adresse des filtres, repris tels quels par la liste et les exports. */
const FILTER_KEYS = ["q", "pays", "nature", "statut", "source", "region", "ville", "fiabilite", "portee", "valeur", "famille", "min", "max", "depuis", "anciens", "archives"] as const;
const ADVANCED_KEYS = ["portee", "valeur", "famille", "min", "max", "depuis"] as const;

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

/** Champ compact des filtres avancés (prix minimal, date). */
function FilterInput({ label, value, onChange, type = "text", inputMode }: { label: string; value: string; onChange: (v: string) => void; type?: string; inputMode?: "decimal" }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="grid gap-1">
      <span className="text-2xs font-semibold text-ink-3">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== value && onChange(draft)}
        onKeyDown={(e) => e.key === "Enter" && onChange(draft)}
        className="h-9 w-full rounded-xl border border-line-strong bg-surface px-3 text-xs text-ink outline-none focus:border-accent"
      />
    </label>
  );
}

export function LibraryPage() {
  const queryClient = useQueryClient();
  const list = useListParams({ id: "date", desc: true });
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, list.get(k)])) as Record<(typeof FILTER_KEYS)[number], string>;
  const archived = filters.archives === "1";
  const [editing, setEditing] = useState<PriceItem | null | undefined>(undefined);
  const [detail, setDetail] = useState<{ id: string; tab?: "valeur" | "historique" } | null>(null);
  const [importing, setImporting] = useState(false);
  const [suppliers, setSuppliers] = useState(false);
  const [sources, setSources] = useState(false);
  const [duplicates, setDuplicates] = useState(false);
  const [advanced, setAdvanced] = useState(ADVANCED_KEYS.some((k) => filters[k]));

  const prices = useQuery({
    queryKey: [...KEY, "prices", filters, list.page, list.sortQuery],
    queryFn: ({ signal }) => api<Paged<PriceItem>>(`/library/prices${query({ ...filters, archives: archived ? 1 : null, page: list.page, pageSize: PAGE_SIZE, ...list.sortQuery })}`, { signal }),
    placeholderData: keepPreviousData,
  });
  const facets = useQuery({ queryKey: [...KEY, "facets", filters.pays], queryFn: ({ signal }) => api<LibraryFacets>(`/library/facets${query({ pays: filters.pays })}`, { signal }) });
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
  const duplicate = useMutation({
    mutationFn: (price: PriceItem) => api<{ price: PriceItem }>(`/library/prices/${price.id}/duplicate`, { method: "POST" }),
    onSuccess: (r) => {
      refresh();
      toast.success("Copie créée dans vos prix : adaptez-la à vos conditions.");
      setEditing(r.price);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const actions = (p: PriceItem) => [
    { label: "Fiche et provenance", icon: <Eye />, onSelect: () => setDetail({ id: p.id }) },
    p.sourceId ? { label: "Dupliquer pour l’adapter", icon: <Copy />, onSelect: () => duplicate.mutate(p) } : { label: "Modifier", icon: <Pencil />, onSelect: () => setEditing(p) },
    { label: "Historique des valeurs", icon: <History />, onSelect: () => setDetail({ id: p.id, tab: "historique" }) },
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
        <Button
          size="sm"
          variant="ghost"
          icon={<Check className="size-3.5" />}
          onClick={(e) => {
            e.stopPropagation();
            verify.mutate({ id: p.id, status: "verifie" });
          }}
          aria-label={`Marquer ${p.designation} comme vérifié`}
        >
          <span className="hidden 2xl:inline">Vérifié</span>
        </Button>
      ) : null}
    </div>
  );

  const provenance = (p: PriceItem) => p.sourceName ?? [PRICE_ORIGIN_LABELS[p.origin], p.supplierName].filter(Boolean).join(", ");

  const columns = [
    col.accessor("designation", {
      id: "designation",
      header: "Désignation",
      cell: (info) => {
        const p = info.row.original;
        return (
          <div className="min-w-0">
            <p className="font-semibold text-ink">{p.designation}</p>
            <p className="truncate text-2xs text-ink-3">{[zoneLabel(p), p.code, p.subFamily ?? (p.tradeFamily ? tradeLabel(p.tradeFamily) : null)].filter(Boolean).join(", ")}</p>
          </div>
        );
      },
    }),
    col.accessor("kind", {
      header: "Nature",
      enableSorting: false,
      cell: (info) => (
        <div className="grid justify-items-start gap-1">
          <Badge>{PRICE_KIND_LABELS[info.getValue()]}</Badge>
          {info.row.original.priceScope ? <span className="text-2xs text-ink-3">{PRICE_SCOPE_LABELS[info.row.original.priceScope]}</span> : null}
        </div>
      ),
    }),
    col.accessor("unitPrice", {
      id: "prix",
      header: "Prix unitaire",
      meta: { align: "right" },
      cell: (info) => {
        const p = info.row.original;
        return (
          <div className="whitespace-nowrap">
            <p className="font-semibold text-ink tabular">
              {formatMoney(p.unitPrice, p.currency)}
              <span className="font-normal text-ink-3">
                {" "}
                / {p.unit}
                {p.taxBasis ? ` ${p.taxBasis}` : ""}
              </span>
            </p>
            {p.priceMin && p.priceMax ? <p className="text-2xs text-ink-3 tabular">{`${formatMoney(p.priceMin, p.currency)} à ${formatMoney(p.priceMax, p.currency)}`}</p> : null}
          </div>
        );
      },
    }),
    col.accessor("priceDate", {
      id: "date",
      header: "Période",
      cell: (info) => (
        <div className="whitespace-nowrap">
          <p className="text-ink-2">{whenLabel(info.row.original)}</p>
          {isStalePrice(info.getValue(), staleMonths) ? <p className="text-2xs text-warning">Ancien, à revoir</p> : <p className="text-2xs text-ink-3">{COUNTRY_LABELS[info.row.original.country]}</p>}
        </div>
      ),
    }),
    col.display({
      id: "provenance",
      header: "Provenance",
      cell: (info) => {
        const p = info.row.original;
        return (
          <div className="grid max-w-56 justify-items-start gap-1">
            <span className="line-clamp-2 text-2xs text-ink-2">{provenance(p)}</span>
            {p.reliability ? (
              <Badge tone={reliabilityTone[p.reliability]} dot>
                Fiabilité {RELIABILITY_LABELS[p.reliability].toLowerCase()}
              </Badge>
            ) : null}
          </div>
        );
      },
    }),
    col.display({ id: "statut", header: "Statut", meta: { align: "right" }, cell: (info) => statusCell(info.row.original) }),
    col.display({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      meta: { align: "right", className: "w-12" },
      cell: (info) => (
        <div onClick={(e) => e.stopPropagation()}>
          <ActionMenu actions={actions(info.row.original)} />
        </div>
      ),
    }),
  ];

  const filtered = FILTER_KEYS.some((k) => k !== "archives" && k !== "pays" && filters[k]);
  const data = prices.data;
  const cities = (facets.data?.cities ?? []).filter((c) => !filters.region || c.region === filters.region);
  const exportParams = new URLSearchParams(FILTER_KEYS.filter((k) => filters[k]).map((k) => [k, filters[k]])).toString();
  const sourceOptions = [{ value: "personnel", label: "Vos prix" }, ...(facets.data?.sources ?? []).map((s) => ({ value: s.key, label: s.name }))];
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Bibliothèque de prix"
        description="Vos prix et les références des sources publiques, chacun avec sa provenance, sa date, sa zone et sa fiabilité. L’agent des sous-détails ne chiffre qu’avec ces prix, hors taxes ; un prix à vérifier ou ancien reste signalé par le contrôle qualité."
        actions={
          <>
            <DownloadMenu
              size="md"
              label="Exporter"
              groups={[
                {
                  title: "Prix affichés, filtres compris",
                  items: (["xlsx", "csv", "pdf"] as const).map((format) => ({
                    label: format === "xlsx" ? "Excel" : format === "csv" ? "CSV" : "PDF",
                    href: `/api/admin/exports/bibliotheque/${format}${exportParams ? `?${exportParams}` : ""}`,
                  })),
                },
              ]}
            />
            <Button variant="secondary" icon={<Database className="size-4" />} onClick={() => setSources(true)}>
              Sources publiques
            </Button>
            <Button variant="secondary" icon={<CopyCheck className="size-4" />} onClick={() => setDuplicates(true)}>
              Doublons
            </Button>
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
        <div className="grid gap-3 p-4 sm:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Segmented
                value={filters.pays || "tous"}
                onChange={(v) => list.set({ pays: v === "tous" ? null : v, region: null, ville: null })}
                options={[
                  { value: "tous", label: "Tous pays" },
                  { value: "MA", label: "Maroc, MAD" },
                  { value: "FR", label: "France, EUR" },
                ]}
                label="Pays"
              />
              <SearchInput value={filters.q} onChange={(v) => list.set({ q: v })} placeholder="Désignation, code, ville" label="Rechercher un prix" className="xl:w-72" />
            </div>
            <Segmented
              value={archived ? "archives" : "actifs"}
              onChange={(v) => list.set({ archives: v === "archives" ? "1" : null })}
              options={[
                { value: "actifs", label: "En service" },
                { value: "archives", label: "Archivés" },
              ]}
              label="Afficher"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <FilterSelect label="Toutes sources" value={filters.source} onChange={(v) => list.set({ source: v })} options={sourceOptions} />
            <FilterSelect label="Toutes natures" value={filters.nature} onChange={(v) => list.set({ nature: v })} options={optionsOf(PRICE_KIND_LABELS)} />
            {(facets.data?.regions.length ?? 0) > 0 ? (
              <FilterSelect label="Toutes régions" value={filters.region} onChange={(v) => list.set({ region: v, ville: null })} options={(facets.data?.regions ?? []).map((r) => ({ value: r, label: r }))} />
            ) : null}
            {cities.length > 0 ? <FilterSelect label="Toutes villes" value={filters.ville} onChange={(v) => list.set({ ville: v })} options={cities.map((c) => ({ value: c.city, label: c.city }))} /> : null}
            <FilterSelect label="Toutes fiabilités" value={filters.fiabilite} onChange={(v) => list.set({ fiabilite: v })} options={optionsOf(RELIABILITY_LABELS)} />
            <FilterSelect label="Tous statuts" value={filters.statut} onChange={(v) => list.set({ statut: v })} options={optionsOf(VALIDATION_STATUS_LABELS)} />
            <FilterSelect label="Toutes dates" value={filters.anciens} onChange={(v) => list.set({ anciens: v })} options={[{ value: "1", label: staleMonths ? `Plus de ${staleMonths} mois` : "Prix anciens" }]} />
            <Button size="sm" variant="ghost" icon={<SlidersHorizontal className="size-3.5" />} onClick={() => setAdvanced((v) => !v)} aria-expanded={advanced} className="col-span-2 justify-self-start sm:col-span-1">
              {advanced ? "Moins de filtres" : "Plus de filtres"}
            </Button>
          </div>
          {advanced ? (
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-line p-3 sm:grid-cols-3 lg:grid-cols-6">
              <FilterSelect label="Toutes portées" value={filters.portee} onChange={(v) => list.set({ portee: v })} options={optionsOf(PRICE_SCOPE_LABELS)} />
              <FilterSelect label="Toutes valeurs" value={filters.valeur} onChange={(v) => list.set({ valeur: v })} options={optionsOf(PRICE_VALUE_STATUS_LABELS)} />
              <FilterSelect label="Toutes familles" value={filters.famille} onChange={(v) => list.set({ famille: v })} options={TRADE_FAMILIES.map((t) => ({ value: t.key, label: t.label }))} />
              <FilterInput label="Prix minimal" inputMode="decimal" value={filters.min} onChange={(v) => list.set({ min: v })} />
              <FilterInput label="Prix maximal" inputMode="decimal" value={filters.max} onChange={(v) => list.set({ max: v })} />
              <FilterInput label="Prix depuis le" type="date" value={filters.depuis} onChange={(v) => list.set({ depuis: v })} />
            </div>
          ) : null}
        </div>
        <DataTable
          label="Prix de la bibliothèque"
          columns={columns}
          data={data?.items}
          loading={prices.isPending}
          getRowId={(p) => p.id}
          sort={list.sort}
          onSortChange={list.setSort}
          onRowClick={(p) => setDetail({ id: p.id })}
          cardsBelow="xl"
          minWidth="66rem"
          empty={
            <EmptyState
              icon={<Library className="size-5" />}
              title={filtered ? "Aucun prix ne correspond" : archived ? "Aucun prix archivé" : "Bibliothèque vide"}
              text={
                filtered || archived
                  ? undefined
                  : "Chargez les sources publiques du Maroc et de la France, importez vos bordereaux, devis fournisseurs ou anciennes DPGF, ou ajoutez vos prix un par un."
              }
              action={
                !filtered && !archived ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button size="sm" icon={<Database className="size-3.5" />} onClick={() => setSources(true)}>
                      Sources publiques
                    </Button>
                    <Button size="sm" variant="secondary" icon={<Upload className="size-3.5" />} onClick={() => setImporting(true)}>
                      Importer un fichier
                    </Button>
                  </div>
                ) : undefined
              }
            />
          }
          mobileCard={(p) => (
            <div className="flex items-start gap-3 px-4 py-3.5">
              <button type="button" onClick={() => setDetail({ id: p.id })} className="min-w-0 flex-1 text-left">
                <p className="text-sm font-semibold text-ink">{p.designation}</p>
                <p className="mt-0.5 text-2xs text-ink-3">{[zoneLabel(p), whenLabel(p), provenance(p)].join(", ")}</p>
                <p className="mt-1 text-xs font-semibold text-ink tabular">
                  {formatMoney(p.unitPrice, p.currency)}
                  <span className="font-normal text-ink-3">
                    {" "}
                    / {p.unit}
                    {p.taxBasis ? ` ${p.taxBasis}` : ""}
                  </span>
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge tone={statusTone[p.verificationStatus]} dot>
                    {VALIDATION_STATUS_LABELS[p.verificationStatus]}
                  </Badge>
                  {p.reliability ? <Badge tone={reliabilityTone[p.reliability]}>{`Fiabilité ${RELIABILITY_LABELS[p.reliability].toLowerCase()}`}</Badge> : null}
                  {isStalePrice(p.priceDate, staleMonths) ? <Badge tone="warning">Ancien</Badge> : null}
                </div>
              </button>
              {p.verificationStatus !== "verifie" ? <Button size="sm" variant="ghost" icon={<Check className="size-3.5" />} onClick={() => verify.mutate({ id: p.id, status: "verifie" })} aria-label={`Marquer ${p.designation} comme vérifié`} /> : null}
              <ActionMenu actions={actions(p)} />
            </div>
          )}
        />
        {data ? <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={list.setPage} /> : null}
      </Card>
      <PriceDialog open={editing !== undefined} onOpenChange={(open) => !open && setEditing(undefined)} price={editing ?? null} onSaved={refresh} />
      <PriceDetailDialog
        priceId={detail?.id ?? null}
        initialTab={detail?.tab}
        onOpenChange={(open) => !open && setDetail(null)}
        onEdit={(p) => {
          setDetail(null);
          setEditing(p);
        }}
        onDuplicated={(p) => {
          setDetail(null);
          setEditing(p);
        }}
        onChanged={refresh}
      />
      <PriceImportDialog open={importing} onOpenChange={setImporting} onImported={refresh} />
      <SuppliersDialog open={suppliers} onOpenChange={setSuppliers} />
      <PriceSourcesDialog open={sources} onOpenChange={setSources} onChanged={refresh} />
      <DuplicatesDialog open={duplicates} onOpenChange={setDuplicates} country={filters.pays} onOpenPrice={(id) => setDetail({ id })} onChanged={refresh} />
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
    description: "",
    priceScope: "",
    taxBasis: "",
    vatRate: "",
    reliability: "",
    sourceUrl: "",
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
            description: price.description ?? "",
            priceScope: price.priceScope ?? "",
            taxBasis: price.taxBasis ?? "",
            vatRate: price.vatRate ? String(Number(price.vatRate)).replace(".", ",") : "",
            reliability: price.reliability ?? "",
            sourceUrl: price.sourceUrl ?? "",
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
    const payload = { ...values, priceScope: values.priceScope || null, taxBasis: values.taxBasis || null, reliability: values.reliability || null, vatRate: values.taxBasis === "TTC" ? values.vatRate : "" };
    const parsed = priceItemInput.safeParse(payload);
    const next: Record<string, string> = {};
    if (!parsed.success) for (const issue of parsed.error.issues) next[issue.path.join(".")] ??= issue.message;
    const taxIssue = priceTaxIssue(parsed.success ? parsed.data : payload);
    if (taxIssue) next.vatRate = taxIssue;
    if (!parsed.success || taxIssue) return setErrors(next);
    setErrors({});
    save.mutate(parsed.data);
  }

  const set = (key: keyof typeof values, value: string) => setValues((v) => ({ ...v, [key]: value }));
  const family = TRADE_FAMILIES.find((t) => t.key === values.tradeFamily);
  const suggested = defaultReliability(values.origin as PriceItem["origin"]);
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={price ? "Modifier le prix" : "Nouveau prix"}
      description="Un prix sert de coût dans les sous-détails : indiquez d’où il vient, à quelle date il a été relevé, ce qu’il couvre et s’il est HT ou TTC. Toute nouvelle valeur est historisée."
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
        <SelectField label="Portée" optional placeholder="Non précisée" options={optionsOf(PRICE_SCOPE_LABELS)} value={values.priceScope} onChange={(e) => set("priceScope", e.target.value)} />
        <Field label="Prix unitaire" inputMode="decimal" value={values.unitPrice} onChange={(e) => set("unitPrice", e.target.value)} error={errors.unitPrice} />
        <Field label="Unité" value={values.unit} onChange={(e) => set("unit", e.target.value)} error={errors.unit} placeholder="m3, kg, h, jour, u" />
        <SelectField
          label="Assiette fiscale"
          optional
          placeholder="Non précisée"
          options={[
            { value: "HT", label: "Hors taxes" },
            { value: "TTC", label: "Toutes taxes comprises" },
          ]}
          value={values.taxBasis}
          onChange={(e) => set("taxBasis", e.target.value)}
        />
        {values.taxBasis === "TTC" ? (
          <Field label="TVA incluse, en %" inputMode="decimal" value={values.vatRate} onChange={(e) => set("vatRate", e.target.value)} error={errors.vatRate} placeholder="20" />
        ) : (
          <Field label="Code" optional value={values.code} onChange={(e) => set("code", e.target.value)} error={errors.code} />
        )}
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
        <SelectField
          label="Fiabilité"
          optional
          placeholder={`Proposée : ${RELIABILITY_LABELS[suggested].toLowerCase()}`}
          options={optionsOf(RELIABILITY_LABELS)}
          value={values.reliability}
          onChange={(e) => set("reliability", e.target.value)}
        />
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
        <Field label="Lien vers la source" optional value={values.sourceUrl} onChange={(e) => set("sourceUrl", e.target.value)} error={errors.sourceUrl} placeholder="https://" />
        {values.taxBasis === "TTC" ? <Field label="Code" optional value={values.code} onChange={(e) => set("code", e.target.value)} error={errors.code} /> : null}
        <TextareaField label="Description" optional className={cn("sm:col-span-2")} rows={2} value={values.description} onChange={(e) => set("description", e.target.value)} placeholder="Caractéristiques, marque, conditionnement…" />
        <TextareaField label="Conditions commerciales" optional className="sm:col-span-2" rows={2} value={values.commercialConditions} onChange={(e) => set("commercialConditions", e.target.value)} placeholder="Franco chantier, minimum de commande, validité…" />
      </div>
    </Modal>
  );
}
