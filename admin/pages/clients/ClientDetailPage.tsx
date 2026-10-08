import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, FolderPlus, Mail, MapPin, Pencil, Phone, TriangleAlert, User } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { COUNTRY_LABELS, type ProjectStatus, SECTOR_LABELS } from "../../../shared/enums";
import { LEGAL_ID_FIELDS } from "../../../shared/schemas";
import { ProjectStatusBadge } from "../../components/StatusBadge";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { PageHeader } from "../../components/ui/PageHeader";
import { api, ApiError, errorMessage } from "../../lib/api";
import { formatDate } from "../../lib/format";
import type { Client } from "../../lib/types";
import { ProjectFormDialog } from "../projects/ProjectFormDialog";
import { ClientFormDialog } from "./ClientFormDialog";

interface ClientDetail {
  client: Client;
  projects: Array<{ id: string; reference: string; name: string; status: ProjectStatus; submissionDeadline: string | null }>;
}

export function ClientDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const detail = useQuery({ queryKey: ["client", id], queryFn: ({ signal }) => api<ClientDetail>(`/clients/${id}`, { signal }) });

  const toggleArchive = useMutation({
    mutationFn: (client: Client) => api(`/clients/${client.id}/${client.archivedAt ? "restore" : "archive"}`, { body: {} }),
    onSuccess: (_, client) => {
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
      void queryClient.invalidateQueries({ queryKey: ["client", id] });
      toast.success(client.archivedAt ? "Client restauré." : "Client archivé.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (detail.isError) {
    const notFound = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <Card className="mx-auto max-w-xl p-6">
        <EmptyState
          icon={<TriangleAlert className="size-5" />}
          title={notFound ? "Client introuvable" : "Fiche indisponible"}
          text={notFound ? "Ce client n’existe pas ou plus." : "La fiche n’a pas pu être chargée."}
          action={
            <Link to="/administration/clients" className="text-xs font-semibold text-accent hover:underline">
              Retour aux clients
            </Link>
          }
        />
      </Card>
    );
  }

  const client = detail.data?.client;
  const legalFields = client ? LEGAL_ID_FIELDS[client.country] : [];
  const legalIds = client ? legalFields.filter((f) => client.legalIds[f.key]) : [];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        back={{ to: "/administration/clients", label: "Clients" }}
        eyebrow={client ? [SECTOR_LABELS[client.sector], COUNTRY_LABELS[client.country]].join(", ") : <Skeleton className="h-4 w-32" />}
        title={client ? client.name : <Skeleton className="h-8 w-64" />}
        actions={
          client ? (
            <>
              {client.archivedAt ? <Badge tone="warning">Archivé</Badge> : null}
              <Button variant="secondary" icon={client.archivedAt ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />} onClick={() => toggleArchive.mutate(client)} loading={toggleArchive.isPending}>
                {client.archivedAt ? "Restaurer" : "Archiver"}
              </Button>
              <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
                Modifier
              </Button>
              <Button icon={<FolderPlus className="size-4" />} onClick={() => setCreatingProject(true)}>
                Nouvelle affaire
              </Button>
            </>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <CardHeader title="Coordonnées" />
          {client ? (
            <ul className="mt-4 grid gap-3 text-xs">
              <ContactRow icon={<User />} label="Interlocuteur" value={client.contactName} />
              <ContactRow icon={<Mail />} label="E-mail" value={client.email} href={client.email ? `mailto:${client.email}` : undefined} />
              <ContactRow icon={<Phone />} label="Téléphone" value={client.phone} href={client.phone ? `tel:${client.phone.replace(/\s/g, "")}` : undefined} />
              <ContactRow icon={<MapPin />} label="Adresse" value={[client.address, client.city].filter(Boolean).join(", ") || null} />
            </ul>
          ) : (
            <Skeleton className="mt-4 h-32" />
          )}
          {client && (client.legalForm || legalIds.length) ? (
            <dl className="mt-5 grid gap-2 border-t border-line pt-4 text-xs">
              {client.legalForm ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">Forme juridique</dt>
                  <dd className="text-right font-medium text-ink">{client.legalForm}</dd>
                </div>
              ) : null}
              {legalIds.map((f) => (
                <div key={f.key} className="flex justify-between gap-3">
                  <dt className="text-ink-3">{f.label}</dt>
                  <dd className="text-right font-medium text-ink tabular">{client.legalIds[f.key]}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {client?.notes ? <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed whitespace-pre-line text-ink-2">{client.notes}</p> : null}
        </Card>

        <Card className="overflow-hidden lg:col-span-2">
          <div className="p-5 pb-3">
            <CardHeader title="Affaires" subtitle={detail.data ? `${detail.data.projects.length} affaire${detail.data.projects.length > 1 ? "s" : ""} pour ce client` : undefined} />
          </div>
          {!detail.data ? (
            <div className="grid gap-2 px-5 pb-5">
              <Skeleton className="h-11" />
              <Skeleton className="h-11" />
            </div>
          ) : detail.data.projects.length === 0 ? (
            <EmptyState
              title="Aucune affaire"
              text="Les affaires rattachées à ce client apparaîtront ici."
              action={
                <Button size="sm" onClick={() => setCreatingProject(true)}>
                  Créer une affaire
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {detail.data.projects.map((p) => (
                <li key={p.id}>
                  <Link to={`/administration/affaires/${p.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-surface-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-ink">{p.name}</p>
                      <p className="text-2xs text-ink-3 tabular">{p.reference}</p>
                    </div>
                    <ProjectStatusBadge status={p.status} />
                    <span className="w-24 text-right text-2xs text-ink-3 tabular">{formatDate(p.submissionDeadline)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {client ? (
        <>
          <ClientFormDialog open={editing} onOpenChange={setEditing} client={client} />
          <ProjectFormDialog open={creatingProject} onOpenChange={setCreatingProject} defaults={{ clientId: client.id, country: client.country, sector: client.sector }} onSaved={(p) => navigate(`/administration/affaires/${p.id}`)} />
        </>
      ) : null}
    </div>
  );
}

function ContactRow({ icon, label, value, href }: { icon: ReactNode; label: string; value: string | null; href?: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-3 [&_svg]:size-3.5">{icon}</span>
      <div className="min-w-0">
        <p className="text-2xs text-ink-3">{label}</p>
        {value ? (
          href ? (
            <a href={href} className="font-medium break-words text-ink hover:text-accent">
              {value}
            </a>
          ) : (
            <p className="font-medium break-words text-ink">{value}</p>
          )
        ) : (
          <p className="text-ink-3">Non renseigné</p>
        )}
      </div>
    </li>
  );
}
