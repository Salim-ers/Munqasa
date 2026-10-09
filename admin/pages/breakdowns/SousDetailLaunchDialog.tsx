import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Dialog";
import { InlineError, Skeleton } from "../../components/ui/Feedback";
import { Checkbox, SelectField, TextareaField } from "../../components/ui/Field";
import { Segmented } from "../../components/ui/Segmented";
import { api, ApiError, errorMessage, query } from "../../lib/api";
import { type Job, useAgentStatus } from "../../lib/jobs";
import type { BreakdownList, DpgfSummary, Paged, ProjectRow } from "../../lib/types";

type Scope = "ouverts" | "sans" | "choix";

/** Lancement de l'agent des sous-détails : DPGF, postes retenus, consigne, accord d'envoi. */
export function SousDetailLaunchDialog({
  open,
  onOpenChange,
  projectId: fixedProject,
  dpgfId: fixedDpgf,
  onStarted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  dpgfId?: string;
  onStarted?: (job: Job) => void;
}) {
  const queryClient = useQueryClient();
  const status = useAgentStatus();
  const [projectId, setProjectId] = useState(fixedProject ?? "");
  const [dpgfId, setDpgfId] = useState(fixedDpgf ?? "");
  const [scope, setScope] = useState<Scope>("ouverts");
  const [chosen, setChosen] = useState<string[]>([]);
  const [instructions, setInstructions] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setProjectId(fixedProject ?? "");
    setDpgfId(fixedDpgf ?? "");
    setScope("ouverts");
    setChosen([]);
    setInstructions("");
    setConsent(false);
    setError(null);
  }, [open, fixedProject, fixedDpgf]);

  const projects = useQuery({
    queryKey: ["projects", "options"],
    queryFn: ({ signal }) => api<Paged<ProjectRow>>(`/projects${query({ pageSize: 100, sort: "nom", dir: "asc" })}`, { signal }),
    enabled: open && !fixedProject,
  });
  const documents = useQuery({ queryKey: ["project", projectId, "dpgf"], queryFn: ({ signal }) => api<{ items: DpgfSummary[] }>(`/projects/${projectId}/dpgf`, { signal }), enabled: open && Boolean(projectId) });
  const list = useQuery({ queryKey: ["project", projectId, "breakdowns", dpgfId], queryFn: ({ signal }) => api<BreakdownList>(`/dpgf/${dpgfId}/breakdowns`, { signal }), enabled: open && Boolean(dpgfId) });

  useEffect(() => {
    if (fixedDpgf || !documents.data) return;
    setDpgfId((current) => (documents.data.items.some((d) => d.id === current) ? current : (documents.data.items[0]?.id ?? "")));
  }, [documents.data, fixedDpgf]);

  const s = status.data;
  const blocked = s ? !s.simulation && (!s.openaiKey || !s.generationModel) : true;
  const postes = list.data?.postes ?? [];
  const openPostes = postes.filter((p) => !p.breakdown?.locked);
  const without = postes.filter((p) => !p.breakdown);
  const lineIds = scope === "ouverts" ? [] : scope === "sans" ? without.map((p) => p.line.id) : chosen;
  const count = scope === "ouverts" ? openPostes.length : lineIds.length;

  const launch = useMutation({
    mutationFn: () => api<{ job: Job }>(`/dpgf/${dpgfId}/breakdowns/generate`, { body: { lineIds, instructions: instructions || null, consent } }),
    onSuccess: ({ job }) => {
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast.success("Établissement des sous-détails lancé.");
      onOpenChange(false);
      onStarted?.(job);
    },
    onError: (e) => setError(e instanceof ApiError && Object.values(e.fields)[0] ? Object.values(e.fields)[0]! : errorMessage(e)),
  });

  const items = documents.data?.items ?? [];
  const toggle = (id: string, on: boolean) => setChosen((c) => (on ? [...c, id] : c.filter((x) => x !== id)));
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Sous-détails de prix"
      description="L’agent décompose chaque poste en matériaux, main-d’œuvre, matériel et frais. Chaque coût vient d’un prix de votre bibliothèque désigné par son identifiant ; l’agent ne propose aucun prix. Les consommations restent des hypothèses à confirmer, et le serveur calcule chaque montant au centime."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={launch.isPending} disabled={blocked || !dpgfId || count === 0 || !consent} onClick={() => launch.mutate()}>
            {count ? `Établir ${count} sous-détail(s)` : "Établir les sous-détails"}
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
        {s && s.prices === 0 ? (
          <div className="flex gap-3 rounded-xl border border-warning/25 bg-warning-soft p-3.5 text-xs leading-relaxed text-ink-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <p>
              Votre bibliothèque ne contient aucun prix utilisable : l’agent ne pourra chiffrer aucun composant.{" "}
              <Link to="/administration/bibliotheque" className="font-semibold text-accent hover:underline">
                Importer vos prix
              </Link>
            </p>
          </div>
        ) : null}
        {error ? <InlineError>{error}</InlineError> : null}
        {fixedProject ? null : (
          <SelectField
            label="Affaire"
            placeholder={projects.isPending ? "Chargement…" : "Choisir une affaire"}
            options={(projects.data?.items ?? []).map((p) => ({ value: p.id, label: `${p.reference}, ${p.name}` }))}
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setDpgfId("");
            }}
          />
        )}
        {fixedDpgf ? null : projectId && !documents.isPending && items.length === 0 ? (
          <p className="rounded-xl border border-line p-3.5 text-xs leading-relaxed text-ink-3">Cette affaire n’a pas encore de DPGF : établissez-la d’abord dans l’onglet DPGF.</p>
        ) : (
          <SelectField
            label="DPGF"
            placeholder={documents.isPending && projectId ? "Chargement…" : "Choisir une DPGF"}
            options={items.map((d) => ({ value: d.id, label: `${d.title}, ${d.postes ?? 0} postes` }))}
            value={dpgfId}
            onChange={(e) => setDpgfId(e.target.value)}
            disabled={!projectId}
          />
        )}
        {dpgfId ? (
          list.isPending ? (
            <Skeleton className="h-16" />
          ) : postes.length === 0 ? (
            <p className="rounded-xl border border-line p-3.5 text-xs leading-relaxed text-ink-3">Cette DPGF n’a aucun poste.</p>
          ) : (
            <div className="grid gap-3">
              <Segmented
                value={scope}
                onChange={setScope}
                label="Postes"
                options={[
                  { value: "ouverts", label: `Non validés, ${openPostes.length}` },
                  { value: "sans", label: `Sans sous-détail, ${without.length}` },
                  { value: "choix", label: "Choisir" },
                ]}
              />
              {scope === "choix" ? (
                <ul className="grid max-h-56 gap-2 overflow-y-auto rounded-xl border border-line p-3">
                  {openPostes.map(({ line }) => (
                    <li key={line.id}>
                      <Checkbox label={`${line.code ?? ""} ${line.designation}`.trim()} checked={chosen.includes(line.id)} onChange={(on) => toggle(line.id, on)} />
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="text-2xs leading-relaxed text-ink-3">Le sous-détail non validé d’un poste retenu est remplacé ; un sous-détail validé n’est jamais modifié.</p>
            </div>
          )
        ) : null}
        <TextareaField label="Consigne" optional rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Rendements de votre équipe, matériel disponible, sous-traitance prévue…" />
        <div className="rounded-xl border border-line bg-surface-2 p-3.5">
          <Checkbox
            label="J’accepte que les postes de la DPGF, les articles du CCTP liés et les prix candidats de ma bibliothèque soient transmis à l’API OpenAI pour établir les sous-détails."
            checked={consent}
            onChange={setConsent}
          />
        </div>
      </div>
    </Modal>
  );
}
