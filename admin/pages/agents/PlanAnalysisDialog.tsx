import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { FILE_KIND_LABELS } from "../../../shared/enums";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Dialog";
import { InlineError, Skeleton } from "../../components/ui/Feedback";
import { Checkbox, SelectField } from "../../components/ui/Field";
import { api, ApiError, errorMessage, query } from "../../lib/api";
import { formatBytes } from "../../lib/format";
import { type Job, useAgentStatus } from "../../lib/jobs";
import type { Paged, ProjectDetail, ProjectRow, SourceFile } from "../../lib/types";

const READABLE = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

/** Lancement de l'agent de lecture des plans : affaire, lot, pages à lire, accord explicite d'envoi. */
export function PlanAnalysisDialog({ open, onOpenChange, projectId: fixedProject, onStarted }: { open: boolean; onOpenChange: (open: boolean) => void; projectId?: string; onStarted?: (job: Job) => void }) {
  const queryClient = useQueryClient();
  const status = useAgentStatus();
  const [projectId, setProjectId] = useState(fixedProject ?? "");
  const [lotId, setLotId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setProjectId(fixedProject ?? "");
    setLotId("");
    setConsent(false);
    setError(null);
  }, [open, fixedProject]);

  const projects = useQuery({
    queryKey: ["projects", "options"],
    queryFn: ({ signal }) => api<Paged<ProjectRow>>(`/projects${query({ pageSize: 100, sort: "nom", dir: "asc" })}`, { signal }),
    enabled: open && !fixedProject,
  });
  const detail = useQuery({ queryKey: ["project", projectId], queryFn: ({ signal }) => api<ProjectDetail>(`/projects/${projectId}`, { signal }), enabled: open && Boolean(projectId) });
  const files = useQuery({
    queryKey: ["files", projectId],
    queryFn: ({ signal }) => api<{ items: SourceFile[] }>(`/files${query({ affaire: projectId })}`, { signal }),
    enabled: open && Boolean(projectId),
  });
  const readable = useMemo(() => (files.data?.items ?? []).filter((f) => f.status === "verifie" && READABLE.includes(f.mimeType)), [files.data]);

  // Par défaut : tous les plans lisibles de l'affaire.
  useEffect(() => {
    setSelected(readable.filter((f) => f.kind === "plan").map((f) => f.id));
  }, [readable]);
  useEffect(() => {
    const go = detail.data?.lots.find((l) => l.tradeFamily === "gros_oeuvre");
    setLotId(go?.id ?? "");
  }, [detail.data]);

  const s = status.data;
  const blocked = s ? !s.simulation && (!s.openaiKey || !s.generationModel) : true;
  const launch = useMutation({
    mutationFn: () => api<{ job: Job }>(`/projects/${projectId}/analyses`, { body: { fileIds: selected, lotId: lotId || null, consent } }),
    onSuccess: ({ job }) => {
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast.success("Lecture des plans lancée.");
      onOpenChange(false);
      onStarted?.(job);
    },
    onError: (e) => setError(e instanceof ApiError && e.fields.consent ? e.fields.consent : errorMessage(e)),
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Lecture des plans et métré"
      description="L’agent lit chaque page, relève les éléments du lot choisi et leurs cotes, contrôlées dans le texte vectoriel des PDF, puis propose le métré. Les quantités sont calculées à partir des cotes relevées et restent à vérifier."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={launch.isPending} disabled={blocked || !projectId || selected.length === 0 || !consent} onClick={() => launch.mutate()}>
            Lancer la lecture
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {s && blocked ? (
          <div className="flex gap-3 rounded-xl border border-warning/25 bg-warning-soft p-3.5 text-xs leading-relaxed text-ink-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <p>
              {!s.openaiKey ? "La clé OpenAI n’est pas configurée sur le serveur. " : ""}
              {!s.generationModel ? "Aucun modèle n’est choisi. " : ""}
              <Link to="/administration/parametres?onglet=ia" className="font-semibold text-accent hover:underline">
                Ouvrir les paramètres IA
              </Link>
            </p>
          </div>
        ) : null}
        {error ? <InlineError>{error}</InlineError> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          {fixedProject ? null : (
            <SelectField
              label="Affaire"
              placeholder={projects.isPending ? "Chargement…" : "Choisir une affaire"}
              options={(projects.data?.items ?? []).map((p) => ({ value: p.id, label: `${p.reference}, ${p.name}` }))}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="sm:col-span-2"
            />
          )}
          <SelectField
            label="Lot concerné"
            optional
            placeholder="Sans lot"
            options={(detail.data?.lots ?? []).map((l) => ({ value: l.id, label: `${l.code} ${l.name}` }))}
            value={lotId}
            onChange={(e) => setLotId(e.target.value)}
            disabled={!projectId}
          />
        </div>

        {projectId ? (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-xs font-semibold text-ink-2">Pages à lire</legend>
            {files.isPending ? (
              <Skeleton className="h-16" />
            ) : readable.length === 0 ? (
              <p className="rounded-xl border border-line p-3.5 text-xs leading-relaxed text-ink-3">
                Aucun plan lisible dans cette affaire. Déposez vos plans en PDF ou en image dans l’onglet Documents de l’affaire.
              </p>
            ) : (
              <ul className="grid max-h-56 gap-1.5 overflow-y-auto">
                {readable.map((f) => (
                  <li key={f.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line px-3 py-2.5 hover:bg-surface-2">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--accent)]"
                        checked={selected.includes(f.id)}
                        onChange={(e) => setSelected((list) => (e.target.checked ? [...list, f.id] : list.filter((id) => id !== f.id)))}
                      />
                      <FileText className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-ink">{f.originalName}</span>
                        <span className="block text-2xs text-ink-3">{[FILE_KIND_LABELS[f.kind], formatBytes(f.sizeBytes)].join(", ")}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-2xs text-ink-3">PDF et images. Les fichiers DWG et DXF sont à exporter en PDF pour être lus.</p>
          </fieldset>
        ) : null}

        <div className="rounded-xl border border-line bg-surface-2 p-3.5">
          <Checkbox
            label="J’accepte que les pages sélectionnées soient transmises à l’API OpenAI pour la lecture. Les copies temporaires sont supprimées après chaque page."
            checked={consent}
            onChange={setConsent}
          />
        </div>
      </div>
    </Modal>
  );
}
