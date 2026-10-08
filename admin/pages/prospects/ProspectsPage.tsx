import { zodResolver } from "@hookform/resolvers/zod";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { Pencil, Plus, UserCheck, UserRoundSearch, UserX } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import type { z } from "zod";
import { COUNTRY_LABELS, PROSPECT_STATUS_LABELS, type Sector, SECTOR_LABELS } from "../../../shared/enums";
import { prospectInput } from "../../../shared/schemas";
import { ProspectStatusBadge } from "../../components/StatusBadge";
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
import { api, errorMessage, query } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { applyServerErrors, text } from "../../lib/forms";
import { useListParams } from "../../lib/list-params";
import type { Paged, Prospect } from "../../lib/types";

const PAGE_SIZE = 25;
const col = createColumnHelper<Prospect>();

export function ProspectsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const list = useListParams({ id: "recent", desc: true });
  const q = list.get("q");
  const status = list.get("statut");
  const [editing, setEditing] = useState<Prospect | null | undefined>(undefined);
  const [converting, setConverting] = useState<Prospect | null>(null);

  const prospects = useQuery({
    queryKey: ["prospects", { q, status, page: list.page, sort: list.sortQuery }],
    queryFn: ({ signal }) => api<Paged<Prospect>>(`/prospects${query({ q, statut: status, page: list.page, pageSize: PAGE_SIZE, ...list.sortQuery })}`, { signal }),
    placeholderData: keepPreviousData,
  });

  const markLost = useMutation({
    mutationFn: (p: Prospect) => api(`/prospects/${p.id}`, { method: "PATCH", body: { status: p.status === "perdu" ? "nouveau" : "perdu" } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["prospects"] }),
    onError: (error) => toast.error(errorMessage(error)),
  });

  const actions = (p: Prospect) => [
    { label: "Modifier", icon: <Pencil />, onSelect: () => setEditing(p) },
    ...(p.convertedClientId
      ? [{ label: "Voir le client", icon: <UserCheck />, onSelect: () => navigate(`/administration/clients/${p.convertedClientId}`) }]
      : [
          { label: "Convertir en client", icon: <UserCheck />, onSelect: () => setConverting(p) },
          { label: p.status === "perdu" ? "Réactiver" : "Marquer comme perdu", icon: <UserX />, onSelect: () => markLost.mutate(p) },
        ]),
  ];

  const columns = [
    col.accessor("name", {
      id: "nom",
      header: "Prospect",
      cell: (info) => (
        <div className="min-w-0">
          <p className="font-semibold text-ink">{info.row.original.company ?? info.getValue()}</p>
          <p className="truncate text-2xs text-ink-3">{info.row.original.company ? info.getValue() : [info.row.original.city, COUNTRY_LABELS[info.row.original.country]].filter(Boolean).join(", ")}</p>
        </div>
      ),
    }),
    col.accessor("status", { id: "statut", header: "Statut", cell: (info) => <ProspectStatusBadge status={info.getValue()} /> }),
    col.accessor("source", { header: "Origine", enableSorting: false, cell: (info) => <span className="text-ink-2">{info.getValue()}</span> }),
    col.accessor("email", {
      header: "Contact",
      enableSorting: false,
      cell: (info) => (
        <div className="min-w-0 text-ink-2">
          {info.getValue() ? (
            <a href={`mailto:${info.getValue()}`} className="block truncate hover:text-accent">
              {info.getValue()}
            </a>
          ) : null}
          <p className="truncate text-2xs text-ink-3">{info.row.original.phone}</p>
        </div>
      ),
    }),
    col.accessor("createdAt", { id: "recent", header: "Ajouté le", meta: { align: "right" }, cell: (info) => <span className="text-ink-2 tabular">{formatDate(info.getValue())}</span> }),
    col.display({ id: "actions", header: () => <span className="sr-only">Actions</span>, meta: { align: "right", className: "w-12" }, cell: (info) => <ActionMenu actions={actions(info.row.original)} /> }),
  ];

  const data = prospects.data;
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Prospects"
        description="Contacts commerciaux à qualifier. Un prospect converti devient client, sans ressaisie."
        actions={
          <Button icon={<Plus className="size-4" aria-hidden="true" />} onClick={() => setEditing(null)}>
            Nouveau prospect
          </Button>
        }
      />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <SearchInput value={q} onChange={(v) => list.set({ q: v })} placeholder="Nom, entreprise, ville, e-mail" label="Rechercher un prospect" className="lg:w-80" />
          <Segmented
            value={status || "tous"}
            onChange={(v) => list.set({ statut: v === "tous" ? null : v })}
            options={[{ value: "tous", label: "Tous" }, ...optionsOf(PROSPECT_STATUS_LABELS).map((o) => ({ value: o.value as string, label: o.value === "converti" ? "Convertis" : o.label }))]}
            label="Statut"
          />
        </div>
        <DataTable
          label="Prospects"
          columns={columns}
          data={data?.items}
          loading={prospects.isPending}
          getRowId={(p) => p.id}
          sort={list.sort}
          onSortChange={list.setSort}
          onRowClick={(p) => setEditing(p)}
          minWidth="52rem"
          empty={
            <EmptyState
              icon={<UserRoundSearch className="size-5" />}
              title={q || status ? "Aucun prospect ne correspond" : "Aucun prospect pour l’instant"}
              text={q || status ? "Modifiez la recherche ou le filtre." : "Notez vos contacts commerciaux pour les qualifier, puis les convertir en clients."}
              action={q || status ? undefined : <Button size="sm" onClick={() => setEditing(null)}>Ajouter un prospect</Button>}
            />
          }
          mobileCard={(p) => (
            <div className="flex items-center gap-3 px-4 py-3.5">
              <button type="button" onClick={() => setEditing(p)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-semibold text-ink">{p.company ?? p.name}</p>
                <p className="truncate text-2xs text-ink-3">{[p.company ? p.name : null, p.city, COUNTRY_LABELS[p.country]].filter(Boolean).join(", ")}</p>
              </button>
              <ProspectStatusBadge status={p.status} />
              <ActionMenu actions={actions(p)} />
            </div>
          )}
        />
        {data ? <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={list.setPage} /> : null}
      </Card>
      <ProspectDialog open={editing !== undefined} onOpenChange={(open) => !open && setEditing(undefined)} prospect={editing} />
      <ConvertDialog prospect={converting} onOpenChange={(open) => !open && setConverting(null)} />
    </div>
  );
}

type Values = z.input<typeof prospectInput>;
type Output = z.output<typeof prospectInput>;

function ProspectDialog({ open, onOpenChange, prospect }: { open: boolean; onOpenChange: (open: boolean) => void; prospect: Prospect | null | undefined }) {
  const queryClient = useQueryClient();
  const [general, setGeneral] = useState<string | null>(null);
  const initial = (p?: Prospect | null): Values => ({
    name: text(p?.name),
    company: text(p?.company),
    country: p?.country ?? "MA",
    city: text(p?.city),
    email: text(p?.email),
    phone: text(p?.phone),
    source: text(p?.source),
    status: p?.status ?? "nouveau",
    notes: text(p?.notes),
  });
  const form = useForm<Values, unknown, Output>({ resolver: zodResolver(prospectInput), defaultValues: initial(prospect) });
  const { register, reset, setError, handleSubmit, formState } = form;
  const errors = formState.errors;

  useEffect(() => {
    if (!open) return;
    reset(initial(prospect));
    setGeneral(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prospect, reset]);

  const save = useMutation({
    mutationFn: (data: Output) => {
      // Un prospect converti garde son statut.
      const { status, ...rest } = data;
      if (!prospect) return api("/prospects", { body: data });
      return api(`/prospects/${prospect.id}`, { method: "PATCH", body: prospect.status === "converti" ? rest : { ...rest, status } });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["prospects"] });
      toast.success(prospect ? "Prospect mis à jour." : "Prospect ajouté.");
      onOpenChange(false);
    },
    onError: (error) => setGeneral(applyServerErrors(error, setError)),
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={prospect ? "Prospect" : "Nouveau prospect"}
      size="lg"
      onSubmit={handleSubmit((data) => {
        setGeneral(null);
        save.mutate(data);
      })}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" loading={save.isPending}>
            {prospect ? "Enregistrer" : "Ajouter"}
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
        <Field label="Nom du contact" autoComplete="name" {...register("name")} error={errors.name?.message} />
        <Field label="Entreprise ou organisme" optional autoComplete="organization" {...register("company")} error={errors.company?.message} />
        <SelectField label="Pays" options={optionsOf(COUNTRY_LABELS)} {...register("country")} error={errors.country?.message} />
        <Field label="Ville" optional {...register("city")} error={errors.city?.message} />
        <Field label="E-mail" optional type="email" autoComplete="email" {...register("email")} error={errors.email?.message} />
        <Field label="Téléphone" optional type="tel" autoComplete="tel" {...register("phone")} error={errors.phone?.message} />
        <Field label="Origine" optional placeholder="Recommandation, salon, site web…" {...register("source")} error={errors.source?.message} />
        {prospect?.status === "converti" ? (
          <div className="grid content-start gap-1.5">
            <p className="text-xs font-semibold text-ink-2">Statut</p>
            <div className="flex h-11 items-center">
              <ProspectStatusBadge status="converti" />
            </div>
          </div>
        ) : (
          <SelectField label="Statut" options={optionsOf(PROSPECT_STATUS_LABELS).filter((o) => o.value !== "converti")} {...register("status")} error={errors.status?.message} />
        )}
        <TextareaField label="Notes" optional className="sm:col-span-2" rows={4} {...register("notes")} error={errors.notes?.message} />
      </div>
    </Modal>
  );
}

function ConvertDialog({ prospect, onOpenChange }: { prospect: Prospect | null; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [sector, setSector] = useState<Sector>("prive");
  const convert = useMutation({
    mutationFn: (p: Prospect) => api<{ clientId: string }>(`/prospects/${p.id}/convert`, { body: { sector } }),
    onSuccess: ({ clientId }) => {
      void queryClient.invalidateQueries({ queryKey: ["prospects"] });
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
      onOpenChange(false);
      toast.success("Client créé à partir du prospect.", { action: { label: "Ouvrir", onClick: () => navigate(`/administration/clients/${clientId}`) } });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Modal
      open={prospect !== null}
      onOpenChange={onOpenChange}
      title="Convertir en client"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={convert.isPending} onClick={() => prospect && convert.mutate(prospect)}>
            Créer le client
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="text-xs leading-relaxed text-ink-2">
          Les coordonnées de <strong className="font-semibold text-ink">{prospect?.company ?? prospect?.name}</strong> sont reprises dans une nouvelle fiche client. Le prospect reste dans la liste, marqué comme converti.
        </p>
        <SelectField label="Secteur du client" options={optionsOf(SECTOR_LABELS)} value={sector} onChange={(e) => setSector(e.target.value as Sector)} />
        {prospect?.convertedClientId ? (
          <Link to={`/administration/clients/${prospect.convertedClientId}`} className="text-xs font-semibold text-accent hover:underline">
            Voir le client
          </Link>
        ) : null}
      </div>
    </Modal>
  );
}
