import { Building2, Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { COUNTRY_LABELS, CURRENCY_LABELS, DESIGN_PHASE_LABELS, MARKET_TYPE_LABELS, SECTOR_LABELS } from "../../../shared/enums";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/Feedback";
import { formatDate, formatDateTime, formatFullDateTime } from "../../lib/format";
import type { ProjectDetail } from "../../lib/types";

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs text-ink-3">{label}</dt>
      <dd className="mt-0.5 text-xs font-medium break-words text-ink">{children || <span className="font-normal text-ink-3">Non renseigné</span>}</dd>
    </div>
  );
}

function TextBlock({ title, value }: { title: string; value: string | null }) {
  return (
    <Card className="p-5">
      <CardHeader title={title} />
      {value ? <p className="mt-3 text-xs leading-relaxed whitespace-pre-line text-ink-2">{value}</p> : <p className="mt-3 text-xs text-ink-3">Non renseigné.</p>}
    </Card>
  );
}

export function OverviewTab({ detail, onEdit }: { detail: ProjectDetail; onEdit: () => void }) {
  const { project, client } = detail;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid content-start gap-4 lg:col-span-2">
        <Card className="p-5">
          <CardHeader
            title="Informations"
            subtitle={`Créée le ${formatDate(project.createdAt)}, modifiée ${formatDateTime(project.updatedAt)}`}
            action={
              <Button variant="ghost" size="sm" icon={<Pencil className="size-3.5" />} onClick={onEdit}>
                Modifier
              </Button>
            }
          />
          <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
            <Item label="Type de marché">{MARKET_TYPE_LABELS[project.marketType]}</Item>
            <Item label="Secteur">{SECTOR_LABELS[project.sector]}</Item>
            <Item label="Phase de conception">{DESIGN_PHASE_LABELS[project.designPhase]}</Item>
            <Item label="Nature des travaux">{project.worksNature}</Item>
            <Item label="Localisation">{[project.city, COUNTRY_LABELS[project.country]].filter(Boolean).join(", ")}</Item>
            <Item label="Adresse du site">{project.siteAddress}</Item>
            <Item label="Remise des offres">{project.submissionDeadline ? formatFullDateTime(project.submissionDeadline) : null}</Item>
            <Item label="Démarrage prévu">{project.startDate ? formatDate(project.startDate) : null}</Item>
            <Item label="Devise">{CURRENCY_LABELS[project.currency]}</Item>
          </dl>
        </Card>
        <TextBlock title="Description" value={project.description} />
        <div className="grid gap-4 md:grid-cols-2">
          <TextBlock title="Hypothèses" value={project.hypotheses} />
          <TextBlock title="Contraintes" value={project.constraints} />
        </div>
      </div>

      <div className="grid content-start gap-4">
        <Card className="p-5">
          <CardHeader title="Client" />
          {client ? (
            <Link to={`/administration/clients/${client.id}`} className="mt-4 flex items-center gap-3 rounded-xl border border-line p-3 transition-colors hover:bg-surface-2">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-2">
                <Building2 className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-ink">{client.name}</span>
                <span className="block truncate text-2xs text-ink-3">{[client.contactName, client.email].filter(Boolean).join(", ") || SECTOR_LABELS[client.sector]}</span>
              </span>
            </Link>
          ) : (
            <EmptyState className="px-2 py-5" title="Aucun client rattaché" text="Rattachez un client depuis la modification de l’affaire." />
          )}
        </Card>
      </div>
    </div>
  );
}
