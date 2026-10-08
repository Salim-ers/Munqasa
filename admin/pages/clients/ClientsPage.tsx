import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { Archive, ArchiveRestore, Building2, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { COUNTRY_LABELS, SECTOR_LABELS } from "../../../shared/enums";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { DataTable, Pagination } from "../../components/ui/DataTable";
import { EmptyState } from "../../components/ui/Feedback";
import { ActionMenu } from "../../components/ui/Menu";
import { PageHeader } from "../../components/ui/PageHeader";
import { SearchInput } from "../../components/ui/SearchInput";
import { Segmented } from "../../components/ui/Segmented";
import { api, errorMessage, query } from "../../lib/api";
import { useListParams } from "../../lib/list-params";
import type { Client, Paged } from "../../lib/types";
import { ClientFormDialog } from "./ClientFormDialog";

const PAGE_SIZE = 25;
const col = createColumnHelper<Client>();

export function ClientsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const list = useListParams({ id: "recent", desc: true });
  const q = list.get("q");
  const archived = list.get("archives") === "1";
  const [editing, setEditing] = useState<Client | null | undefined>(undefined);

  const clients = useQuery({
    queryKey: ["clients", { q, archived, page: list.page, sort: list.sortQuery }],
    queryFn: ({ signal }) => api<Paged<Client>>(`/clients${query({ q, archives: archived, page: list.page, pageSize: PAGE_SIZE, ...list.sortQuery })}`, { signal }),
    placeholderData: keepPreviousData,
  });

  const toggleArchive = useMutation({
    mutationFn: (client: Client) => api(`/clients/${client.id}/${client.archivedAt ? "restore" : "archive"}`, { body: {} }),
    onSuccess: (_, client) => {
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success(client.archivedAt ? "Client restauré." : "Client archivé.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const actions = (client: Client) => [
    { label: "Modifier", icon: <Pencil />, onSelect: () => setEditing(client) },
    client.archivedAt
      ? { label: "Restaurer", icon: <ArchiveRestore />, onSelect: () => toggleArchive.mutate(client) }
      : { label: "Archiver", icon: <Archive />, onSelect: () => toggleArchive.mutate(client) },
  ];

  const columns = [
    col.accessor("name", {
      id: "nom",
      header: "Client",
      cell: (info) => (
        <div className="min-w-0">
          <Link to={`/administration/clients/${info.row.original.id}`} className="font-semibold text-ink hover:text-accent">
            {info.getValue()}
          </Link>
          <p className="truncate text-2xs text-ink-3">{[info.row.original.city, COUNTRY_LABELS[info.row.original.country]].filter(Boolean).join(", ")}</p>
        </div>
      ),
    }),
    col.accessor("sector", { header: "Secteur", enableSorting: false, cell: (info) => <Badge>{SECTOR_LABELS[info.getValue()]}</Badge> }),
    col.accessor("contactName", {
      header: "Contact",
      enableSorting: false,
      cell: (info) => (
        <div className="min-w-0 text-ink-2">
          <p className="truncate">{info.getValue()}</p>
          <p className="truncate text-2xs text-ink-3">{info.row.original.email}</p>
        </div>
      ),
    }),
    col.accessor("country", { id: "pays", header: "Pays", cell: (info) => <span className="text-ink-2">{COUNTRY_LABELS[info.getValue()]}</span> }),
    col.accessor("projectCount", { header: "Affaires", enableSorting: false, meta: { align: "right" }, cell: (info) => <span className="font-semibold text-ink tabular">{info.getValue() ?? 0}</span> }),
    col.display({ id: "actions", header: () => <span className="sr-only">Actions</span>, meta: { align: "right", className: "w-12" }, cell: (info) => <ActionMenu actions={actions(info.row.original)} /> }),
  ];

  const data = clients.data;
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Clients"
        description="Maîtres d’ouvrage publics et privés. Chaque affaire peut être rattachée à un client."
        actions={
          <Button icon={<Plus className="size-4" aria-hidden="true" />} onClick={() => setEditing(null)}>
            Nouveau client
          </Button>
        }
      />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <SearchInput value={q} onChange={(v) => list.set({ q: v })} placeholder="Nom, ville, contact, e-mail" label="Rechercher un client" className="sm:w-80" />
          <Segmented
            value={archived ? "archives" : "actifs"}
            onChange={(v) => list.set({ archives: v === "archives" ? "1" : null })}
            options={[
              { value: "actifs", label: "Actifs" },
              { value: "archives", label: "Archivés" },
            ]}
            label="Afficher"
          />
        </div>
        <DataTable
          label="Clients"
          columns={columns}
          data={data?.items}
          loading={clients.isPending}
          getRowId={(c) => c.id}
          sort={list.sort.id === "recent" ? null : list.sort}
          onSortChange={list.setSort}
          onRowClick={(c) => navigate(`/administration/clients/${c.id}`)}
          minWidth="52rem"
          empty={
            <EmptyState
              icon={<Building2 className="size-5" />}
              title={q ? "Aucun client ne correspond" : archived ? "Aucun client archivé" : "Aucun client pour l’instant"}
              text={q ? "Essayez un autre nom, une ville ou une adresse e-mail." : archived ? undefined : "Ajoutez vos maîtres d’ouvrage pour leur rattacher des affaires et des devis."}
              action={!q && !archived ? <Button size="sm" onClick={() => setEditing(null)}>Ajouter un client</Button> : undefined}
            />
          }
          mobileCard={(c) => (
            <div className="flex items-center gap-3 px-4 py-3.5">
              <Link to={`/administration/clients/${c.id}`} className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{c.name}</p>
                <p className="truncate text-2xs text-ink-3">{[SECTOR_LABELS[c.sector], c.city, COUNTRY_LABELS[c.country]].filter(Boolean).join(", ")}</p>
              </Link>
              <span className="text-2xs font-semibold text-ink-2 tabular">{c.projectCount ?? 0} aff.</span>
              <ActionMenu actions={actions(c)} />
            </div>
          )}
        />
        {data ? <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={list.setPage} /> : null}
      </Card>
      <ClientFormDialog open={editing !== undefined} onOpenChange={(open) => !open && setEditing(undefined)} client={editing} onSaved={(c) => editing === null && navigate(`/administration/clients/${c.id}`)} />
    </div>
  );
}
