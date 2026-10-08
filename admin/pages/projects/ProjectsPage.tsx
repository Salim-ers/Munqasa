import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { FolderOpen, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { COUNTRY_LABELS, PROJECT_STATUS_LABELS, PROJECT_STATUSES } from "../../../shared/enums";
import { ProjectStatusBadge } from "../../components/StatusBadge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { DataTable, Pagination } from "../../components/ui/DataTable";
import { EmptyState } from "../../components/ui/Feedback";
import { PageHeader } from "../../components/ui/PageHeader";
import { SearchInput } from "../../components/ui/SearchInput";
import { api, query } from "../../lib/api";
import { cn } from "../../lib/cn";
import { formatDate, formatMoney, formatRelative } from "../../lib/format";
import { useListParams } from "../../lib/list-params";
import type { Paged, ProjectRow } from "../../lib/types";
import { ProjectFormDialog } from "./ProjectFormDialog";

const PAGE_SIZE = 25;
const col = createColumnHelper<ProjectRow>();

/** Échéance proche (moins de 3 jours) : mise en évidence. */
function DeadlineCell({ value }: { value: string | null }) {
  if (!value) return <span className="text-ink-3">Non fixée</span>;
  const soon = new Date(value).getTime() - Date.now() < 3 * 24 * 3600 * 1000 && new Date(value).getTime() > Date.now();
  const past = new Date(value).getTime() < Date.now();
  return (
    <div className="tabular">
      <p className={cn("font-medium", soon ? "text-danger" : past ? "text-ink-3" : "text-ink")}>{formatDate(value)}</p>
      <p className="text-2xs text-ink-3">{formatRelative(value)}</p>
    </div>
  );
}

const selectClass = "h-10 rounded-xl border border-line bg-surface px-3 pr-8 text-xs font-medium text-ink-2 outline-none focus:border-accent";

export function ProjectsPage() {
  const navigate = useNavigate();
  const list = useListParams({ id: "recent", desc: true });
  const q = list.get("q");
  const status = list.get("statut");
  const country = list.get("pays");
  const archived = list.get("archives") === "1";
  const [creating, setCreating] = useState(false);

  const projects = useQuery({
    queryKey: ["projects", { q, status, country, archived, page: list.page, sort: list.sortQuery }],
    queryFn: ({ signal }) =>
      api<Paged<ProjectRow>>(`/projects${query({ q, statut: status, pays: country, archives: archived, page: list.page, pageSize: PAGE_SIZE, ...list.sortQuery })}`, { signal }),
    placeholderData: keepPreviousData,
  });

  const columns = [
    col.accessor("name", {
      id: "nom",
      header: "Affaire",
      cell: (info) => (
        <div className="min-w-0 max-w-[22rem]">
          <Link to={`/administration/affaires/${info.row.original.id}`} className="line-clamp-2 font-semibold text-ink hover:text-accent">
            {info.getValue()}
          </Link>
          <p className="text-2xs text-ink-3 tabular">{info.row.original.reference}</p>
        </div>
      ),
    }),
    col.accessor("clientName", { header: "Client", enableSorting: false, cell: (info) => <span className="line-clamp-2 text-ink-2">{info.getValue()}</span> }),
    col.accessor("status", { id: "statut", header: "Statut", cell: (info) => <ProjectStatusBadge status={info.getValue()} /> }),
    col.accessor("country", {
      header: "Pays",
      enableSorting: false,
      cell: (info) => <span className="text-ink-2">{[info.row.original.city, COUNTRY_LABELS[info.getValue()]].filter(Boolean).join(", ")}</span>,
    }),
    col.accessor("lotCount", { header: "Lots", enableSorting: false, meta: { align: "right" }, cell: (info) => <span className="text-ink-2 tabular">{info.getValue()}</span> }),
    col.accessor("manualEstimate", {
      header: "Estimation",
      enableSorting: false,
      meta: { align: "right" },
      cell: (info) => <span className="font-medium text-ink tabular">{formatMoney(info.getValue(), info.row.original.currency)}</span>,
    }),
    col.accessor("submissionDeadline", { id: "echeance", header: "Remise", meta: { align: "right" }, cell: (info) => <DeadlineCell value={info.getValue()} /> }),
  ];

  const data = projects.data;
  const filtered = Boolean(q || status || country);
  return (
    <div className="mx-auto max-w-[96rem]">
      <PageHeader
        title="Mes affaires"
        description="Chaque affaire réunit ses lots, ses échéances, ses documents sources et, plus tard, ses CCTP, DPGF et devis."
        actions={
          <Button icon={<Plus className="size-4" aria-hidden="true" />} onClick={() => setCreating(true)}>
            Nouvelle affaire
          </Button>
        }
      />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center">
          <SearchInput value={q} onChange={(v) => list.set({ q: v })} placeholder="Intitulé, référence, ville, client" label="Rechercher une affaire" className="lg:w-80" />
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
            <label className="sr-only" htmlFor="filtre-statut">
              Statut
            </label>
            <select id="filtre-statut" className={selectClass} value={status} onChange={(e) => list.set({ statut: e.target.value || null })}>
              <option value="">Tous les statuts</option>
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="filtre-pays">
              Pays
            </label>
            <select id="filtre-pays" className={selectClass} value={country} onChange={(e) => list.set({ pays: e.target.value || null })}>
              <option value="">Tous les pays</option>
              <option value="MA">Maroc</option>
              <option value="FR">France</option>
            </select>
            <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl px-2 text-xs font-medium text-ink-2">
              <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={archived} onChange={(e) => list.set({ archives: e.target.checked ? "1" : null })} />
              Inclure les archives
            </label>
          </div>
        </div>
        <DataTable
          label="Affaires"
          columns={columns}
          data={data?.items}
          loading={projects.isPending}
          getRowId={(p) => p.id}
          sort={list.sort.id === "recent" ? null : list.sort}
          onSortChange={list.setSort}
          onRowClick={(p) => navigate(`/administration/affaires/${p.id}`)}
          minWidth="64rem"
          cardsBelow="xl"
          empty={
            <EmptyState
              icon={<FolderOpen className="size-5" />}
              title={filtered ? "Aucune affaire ne correspond" : "Aucune affaire pour l’instant"}
              text={filtered ? "Modifiez la recherche ou les filtres." : "Créez votre première affaire : la référence est attribuée automatiquement."}
              action={filtered ? undefined : <Button size="sm" onClick={() => setCreating(true)}>Créer une affaire</Button>}
            />
          }
          mobileCard={(p) => (
            <Link to={`/administration/affaires/${p.id}`} className="block px-4 py-3.5 active:bg-surface-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-semibold text-ink">{p.name}</p>
                  <p className="mt-0.5 truncate text-2xs text-ink-3">{[p.reference, p.clientName].filter(Boolean).join(", ")}</p>
                </div>
                <ProjectStatusBadge status={p.status} />
              </div>
              <div className="mt-2 flex items-center justify-between text-2xs text-ink-3">
                <span>{p.submissionDeadline ? `Remise ${formatDate(p.submissionDeadline)}` : "Remise non fixée"}</span>
                <span className="font-medium text-ink-2 tabular">{formatMoney(p.manualEstimate, p.currency)}</span>
              </div>
            </Link>
          )}
        />
        {data ? <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={list.setPage} /> : null}
      </Card>
      <ProjectFormDialog open={creating} onOpenChange={setCreating} onSaved={(p) => navigate(`/administration/affaires/${p.id}`)} />
    </div>
  );
}
