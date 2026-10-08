import { FILE_STATUS_LABELS, type FileStatus, PROJECT_STATUS_LABELS, PROSPECT_STATUS_LABELS, type ProjectStatus, type ProspectStatus } from "../../shared/enums";
import { Badge } from "./ui/Badge";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

const projectTone: Record<ProjectStatus, Tone> = {
  brouillon: "neutral",
  analyse: "accent",
  etude_technique: "accent",
  chiffrage: "accent",
  controle_qualite: "warning",
  pret_a_remettre: "success",
  archive: "neutral",
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <Badge tone={projectTone[status]} dot>
      {PROJECT_STATUS_LABELS[status]}
    </Badge>
  );
}

const prospectTone: Record<ProspectStatus, Tone> = { nouveau: "accent", qualifie: "warning", converti: "success", perdu: "neutral" };

export function ProspectStatusBadge({ status }: { status: ProspectStatus }) {
  return (
    <Badge tone={prospectTone[status]} dot>
      {PROSPECT_STATUS_LABELS[status]}
    </Badge>
  );
}

const fileTone: Record<FileStatus, Tone> = {
  en_attente: "neutral",
  televerse: "neutral",
  verifie: "success",
  en_traitement: "accent",
  traite: "success",
  echec: "danger",
  rejete: "danger",
};

export function FileStatusBadge({ status }: { status: FileStatus }) {
  return (
    <Badge tone={fileTone[status]} dot>
      {FILE_STATUS_LABELS[status]}
    </Badge>
  );
}
