import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { REFERENCE_SCOPE_LABELS, type ReferenceScope } from "../../../shared/enums";
import { CCTP_LEVEL_LABELS, CCTP_LEVELS } from "../../../shared/schemas";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Dialog";
import { InlineError, Skeleton } from "../../components/ui/Feedback";
import { Checkbox, SelectField, TextareaField } from "../../components/ui/Field";
import { Segmented } from "../../components/ui/Segmented";
import { api, ApiError, errorMessage, query } from "../../lib/api";
import { type Job, useAgentStatus } from "../../lib/jobs";
import type { Paged, ProjectDetail, ProjectRow, TechnicalReference, WorkItem } from "../../lib/types";

type Level = (typeof CCTP_LEVELS)[number];

const LEVEL_HINTS: Record<Level, string> = {
  synthetique: "15 à 25 articles courts : pour une première consultation ou un petit lot.",
  standard: "25 à 45 articles : le niveau courant d’un dossier de consultation.",
  detaille: "40 à 70 articles développés : pour un lot complexe, seulement si le projet le justifie.",
};

/** Lancement de l'agent de rédaction du CCTP : lot, niveau de détail, métré, références citables, accord d'envoi. */
export function CctpLaunchDialog({ open, onOpenChange, projectId: fixedProject, onStarted }: { open: boolean; onOpenChange: (open: boolean) => void; projectId?: string; onStarted?: (job: Job) => void }) {
  const queryClient = useQueryClient();
  const status = useAgentStatus();
  const [projectId, setProjectId] = useState(fixedProject ?? "");
  const [lotId, setLotId] = useState("");
  const [level, setLevel] = useState<Level>("standard");
  const [useMetre, setUseMetre] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [instructions, setInstructions] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setProjectId(fixedProject ?? "");
    setConsent(false);
    setError(null);
    setInstructions("");
  }, [open, fixedProject]);

  const projects = useQuery({
    queryKey: ["projects", "options"],
    queryFn: ({ signal }) => api<Paged<ProjectRow>>(`/projects${query({ pageSize: 100, sort: "nom", dir: "asc" })}`, { signal }),
    enabled: open && !fixedProject,
  });
  const detail = useQuery({ queryKey: ["project", projectId], queryFn: ({ signal }) => api<ProjectDetail>(`/projects/${projectId}`, { signal }), enabled: open && Boolean(projectId) });
  const metre = useQuery({
    queryKey: ["project", projectId, "metre"],
    queryFn: ({ signal }) => api<{ workItems: WorkItem[] }>(`/projects/${projectId}/metre`, { signal }),
    enabled: open && Boolean(projectId),
  });
  const references = useQuery({ queryKey: ["references", { scope: "", q: "" }], queryFn: ({ signal }) => api<{ items: TechnicalReference[] }>("/references", { signal }), enabled: open });

  const country = detail.data?.project.country;
  const usable = useMemo(() => (references.data?.items ?? []).filter((r) => r.verificationStatus !== "rejete"), [references.data]);
  // Par défaut : les références du pays de l'affaire et les références internationales.
  useEffect(() => {
    if (!country) return;
    setSelected(usable.filter((r) => r.scope === country || r.scope === "INT").map((r) => r.id));
  }, [usable, country]);
  useEffect(() => {
    setLotId(detail.data?.lots.find((l) => l.tradeFamily === "gros_oeuvre")?.id ?? detail.data?.lots[0]?.id ?? "");
  }, [detail.data]);

  const lotItems = (metre.data?.workItems ?? []).filter((w) => !lotId || w.lotId === lotId);
  const s = status.data;
  const blocked = s ? !s.simulation && (!s.openaiKey || !s.generationModel) : true;
  const launch = useMutation({
    mutationFn: () =>
      api<{ job: Job }>(`/projects/${projectId}/cctp`, {
        body: { lotId: lotId || null, detailLevel: level, useMetre: useMetre && lotItems.length > 0, referenceIds: selected, instructions: instructions || null, consent },
      }),
    onSuccess: ({ job }) => {
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast.success("Rédaction du CCTP lancée.");
      onOpenChange(false);
      onStarted?.(job);
    },
    onError: (e) => setError(e instanceof ApiError && e.fields.consent ? e.fields.consent : errorMessage(e)),
  });

  const byScope = (["MA", "FR", "INT"] as ReferenceScope[]).map((scope) => ({ scope, items: usable.filter((r) => r.scope === scope) })).filter((g) => g.items.length);
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Rédaction du CCTP"
      description="L’agent établit le plan du CCTP, puis rédige chaque chapitre. Il ne cite que les références cochées et n’invente aucune valeur technique : ce qui manque est signalé comme à préciser."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={launch.isPending} disabled={blocked || !projectId || !consent} onClick={() => launch.mutate()}>
            Rédiger le CCTP
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
              className="sm:col-span-2"
              placeholder={projects.isPending ? "Chargement…" : "Choisir une affaire"}
              options={(projects.data?.items ?? []).map((p) => ({ value: p.id, label: `${p.reference}, ${p.name}` }))}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            />
          )}
          <SelectField
            label="Lot"
            optional
            placeholder="Sans lot"
            options={(detail.data?.lots ?? []).map((l) => ({ value: l.id, label: `${l.code} ${l.name}` }))}
            value={lotId}
            onChange={(e) => setLotId(e.target.value)}
            disabled={!projectId}
          />
          <div className="grid content-start gap-1.5">
            <span className="text-xs font-semibold text-ink-2">Niveau de détail</span>
            <Segmented value={level} onChange={setLevel} options={CCTP_LEVELS.map((l) => ({ value: l, label: CCTP_LEVEL_LABELS[l] }))} label="Niveau de détail" />
            <p className="text-2xs text-ink-3">{LEVEL_HINTS[level]}</p>
          </div>
        </div>

        {projectId ? (
          <Checkbox
            label={lotItems.length ? `S’appuyer sur le métré du lot (${lotItems.length} ouvrage${lotItems.length > 1 ? "s" : ""})` : "Aucun ouvrage au métré pour ce lot : le CCTP sera rédigé à partir de la description de l’affaire"}
            checked={useMetre && lotItems.length > 0}
            onChange={setUseMetre}
          />
        ) : null}

        <fieldset className="grid gap-2">
          <legend className="mb-1 flex w-full items-center justify-between text-xs font-semibold text-ink-2">
            Références citables
            <Link to="/administration/referentiel" className="text-2xs font-semibold text-accent hover:underline">
              Gérer le référentiel
            </Link>
          </legend>
          {references.isPending ? (
            <Skeleton className="h-20" />
          ) : usable.length === 0 ? (
            <p className="rounded-xl border border-line p-3.5 text-xs leading-relaxed text-ink-3">
              Le référentiel est vide : le CCTP sera rédigé sans citer de norme. Importez le catalogue de départ depuis le référentiel pour pouvoir en citer.
            </p>
          ) : (
            <div className="grid max-h-60 gap-3 overflow-y-auto rounded-xl border border-line p-3">
              {byScope.map((group) => (
                <div key={group.scope}>
                  <p className="mb-1.5 text-2xs font-semibold tracking-wide text-ink-3 uppercase">{REFERENCE_SCOPE_LABELS[group.scope]}</p>
                  <ul className="grid gap-1">
                    {group.items.map((r) => (
                      <li key={r.id}>
                        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1.5 py-1 hover:bg-surface-2">
                          <input
                            type="checkbox"
                            className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
                            checked={selected.includes(r.id)}
                            onChange={(e) => setSelected((list) => (e.target.checked ? [...list, r.id] : list.filter((id) => id !== r.id)))}
                          />
                          <span className="min-w-0 flex-1 text-2xs leading-relaxed text-ink-2">
                            <span className="font-semibold text-ink">{r.code}</span> {r.title}
                          </span>
                          {r.verificationStatus === "a_verifier" ? <Badge tone="warning">À vérifier</Badge> : null}
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <p className="text-2xs text-ink-3">{selected.length} référence(s) cochée(s). Une référence « à vérifier » citée reste signalée par le contrôle qualité.</p>
        </fieldset>

        <TextareaField
          label="Consignes particulières"
          optional
          rows={3}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Exigences du maître d’ouvrage, contraintes du site, choix constructifs déjà arrêtés…"
        />
        <div className="rounded-xl border border-line bg-surface-2 p-3.5">
          <Checkbox label="J’accepte que les informations de l’affaire (description, lot, métré, références) soient transmises à l’API OpenAI pour la rédaction." checked={consent} onChange={setConsent} />
        </div>
      </div>
    </Modal>
  );
}
