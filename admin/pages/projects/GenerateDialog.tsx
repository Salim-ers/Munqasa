import { useMutation, useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { GENERATION_DOCUMENT_LABELS, GENERATION_DOCUMENTS, type GenerationDocument } from "../../../shared/dossier";
import { REFERENCE_SCOPE_LABELS } from "../../../shared/enums";
import { CCTP_LEVEL_LABELS, CCTP_LEVELS } from "../../../shared/schemas";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Dialog";
import { InlineError } from "../../components/ui/Feedback";
import { Checkbox, Field, TextareaField } from "../../components/ui/Field";
import { Segmented } from "../../components/ui/Segmented";
import { api, ApiError, errorMessage } from "../../lib/api";
import { useAgentStatus } from "../../lib/jobs";
import type { Lot, TechnicalReference } from "../../lib/types";

export interface GenerationPlan {
  id: string;
  name: string;
  mimeType: string;
  pageCount: number | null;
}

/** Ce que fait chaque document demandé, tel qu'affiché dans la fenêtre de génération. */
const DOCUMENT_HINTS: Record<GenerationDocument, string> = {
  metre: "Lecture des plans choisis, ouvrages classés par lot et mesurés",
  cctp: "Un CCTP par lot, appuyé sur les ouvrages du métré",
  dpgf: "Postes tirés du CCTP, quantités reprises du métré",
  sous_details: "Décomposition des postes avec les prix de la bibliothèque",
  prix: "Prix d’ouvrage de la bibliothèque choisis par l’agent pour les postes sans prix, à vérifier",
  devis: "Devis brouillon repris des DPGF des lots, sans appel à l’IA",
};

/**
 * Options de la génération du dossier (documents à produire, plans, lots, TVA, niveau du CCTP, consignes) et
 * accord d'envoi des données à l'API OpenAI, communs à la fenêtre « Générer le dossier » et à la création d'une
 * affaire. « active » réinitialise les choix à chaque ouverture.
 */
export function useGeneration({ projectId, lots, plans, active, onStarted }: { projectId: string; lots: Lot[]; plans: GenerationPlan[]; active: boolean; onStarted: () => void }): { fields: ReactNode; submit: () => void; pending: boolean; disabled: boolean } {
  const status = useAgentStatus();
  const [documents, setDocuments] = useState<GenerationDocument[]>([]);
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [lotIds, setLotIds] = useState<string[]>([]);
  const [level, setLevel] = useState<(typeof CCTP_LEVELS)[number]>("standard");
  const [vatRate, setVatRate] = useState("");
  const [instructions, setInstructions] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const has = (d: GenerationDocument) => documents.includes(d);
  const toggle = (d: GenerationDocument, on: boolean) => setDocuments((list) => (on ? GENERATION_DOCUMENTS.filter((x) => x === d || list.includes(x)) : list.filter((x) => x !== d)));
  const usesAi = documents.some((d) => d !== "devis");
  const project = useQuery({ queryKey: ["project", projectId], queryFn: ({ signal }) => api<{ project: { country: "MA" | "FR" } }>(`/projects/${projectId}`, { signal }), enabled: active });
  const references = useQuery({ queryKey: ["references", { scope: "", q: "" }], queryFn: ({ signal }) => api<{ items: TechnicalReference[] }>("/references", { signal }), enabled: active });
  const country = project.data?.project.country;
  // Références du pays de l'affaire et internationales, non rejetées : les seules citables par le CCTP.
  const selected = useMemo(() => (references.data?.items ?? []).filter((r) => r.verificationStatus !== "rejete" && (r.scope === country || r.scope === "INT")), [references.data, country]);
  const planKey = plans.map((p) => p.id).join(",");
  const lotKey = lots.map((l) => l.id).join(",");
  useEffect(() => {
    if (!active) return;
    setDocuments([...(plans.length ? (["metre"] as const) : []), "cctp", "dpgf", "sous_details"]);
    setFileIds(plans.map((p) => p.id));
    const first = lots.find((l) => l.tradeFamily === "gros_oeuvre") ?? lots[0];
    setLotIds(first ? [first.id] : []);
    setConsent(false);
    setError(null);
    // Choix remis à zéro à l'ouverture, ou quand les plans ou les lots de l'affaire changent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, planKey, lotKey]);
  const s = status.data;
  const blocked = usesAi && (s ? !s.simulation && (!s.openaiKey || !s.generationModel || (has("metre") && !s.extractionModel)) : true);
  const launch = useMutation({
    mutationFn: () =>
      api(`/projects/${projectId}/dossier/generate`, {
        body: { documents, fileIds: has("metre") ? fileIds : [], lotIds, lotId: null, detailLevel: level, referenceIds: selected.map((r) => r.id), vatRate: vatRate || null, instructions: instructions || null, consent: usesAi ? consent : false },
      }),
    onSuccess: () => {
      toast.success("Génération du dossier lancée.");
      onStarted();
    },
    onError: (e) => setError(e instanceof ApiError && Object.values(e.fields)[0] ? Object.values(e.fields)[0]! : errorMessage(e)),
  });

  const fields = (
    <div className="grid gap-4">
      {s && blocked ? (
        <div className="flex gap-3 rounded-xl border border-warning/25 bg-warning-soft p-3.5 text-xs leading-relaxed text-ink-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <p>
            {!s.openaiKey ? "La clé OpenAI n’est pas configurée sur le serveur. " : ""}
            {!s.generationModel || !s.extractionModel ? "Les modèles ne sont pas tous choisis. " : ""}
            <Link to="/administration/parametres?onglet=ia" className="font-semibold text-accent hover:underline">
              Ouvrir les paramètres IA
            </Link>
          </p>
        </div>
      ) : null}
      {error ? <InlineError>{error}</InlineError> : null}
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-xs font-semibold text-ink-2">Documents à produire</legend>
        {GENERATION_DOCUMENTS.map((d) => (
          <div key={d}>
            <Checkbox label={GENERATION_DOCUMENT_LABELS[d]} checked={has(d)} onChange={(v) => toggle(d, v)} disabled={d === "metre" && plans.length === 0} />
            <p className="pl-[26px] text-2xs leading-relaxed text-ink-3">{d === "metre" && plans.length === 0 ? "Aucun plan vérifié dans l’onglet Documents : le métré existant est conservé." : DOCUMENT_HINTS[d]}</p>
          </div>
        ))}
      </fieldset>
      {has("metre") ? (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-xs font-semibold text-ink-2">Plans à lire</legend>
          {plans.map((p) => (
            <Checkbox
              key={p.id}
              label={`${p.name}${p.pageCount ? `, ${p.pageCount} page${p.pageCount > 1 ? "s" : ""}` : ""}`}
              checked={fileIds.includes(p.id)}
              onChange={(v) => setFileIds((list) => (v ? [...list, p.id] : list.filter((x) => x !== p.id)))}
            />
          ))}
        </fieldset>
      ) : null}
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-xs font-semibold text-ink-2">Lots</legend>
        {lots.length === 0 ? (
          <p className="rounded-xl border border-line p-3 text-xs leading-relaxed text-ink-3">Aucun lot dans l’affaire : les documents sont établis sans lot. Les lots s’ajoutent dans l’onglet Lots.</p>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {lots.map((l) => (
                <Checkbox key={l.id} label={`${l.code} ${l.name}`} checked={lotIds.includes(l.id)} onChange={(v) => setLotIds((list) => (v ? lots.filter((x) => x.id === l.id || list.includes(x.id)).map((x) => x.id) : list.filter((x) => x !== l.id)))} />
              ))}
            </div>
            <p className="text-2xs leading-relaxed text-ink-3">{lotIds.length > 1 ? `${lotIds.length} lots : un CCTP et une DPGF par lot, un seul devis.` : lotIds.length === 0 ? "Aucun lot coché : les documents sont établis sans lot." : "Un lot coché."}</p>
          </>
        )}
      </fieldset>
      {has("dpgf") || has("cctp") ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {has("dpgf") ? <Field label="Taux de TVA de la DPGF, en %" optional inputMode="decimal" value={vatRate} onChange={(e) => setVatRate(e.target.value)} hint="Saisi par vous, jamais supposé." /> : null}
          {has("cctp") ? (
            <div className="grid content-start gap-1.5 sm:col-span-2">
              <span className="text-xs font-semibold text-ink-2">Niveau de détail du CCTP</span>
              <Segmented value={level} onChange={setLevel} options={CCTP_LEVELS.map((l) => ({ value: l, label: CCTP_LEVEL_LABELS[l] }))} label="Niveau de détail du CCTP" />
            </div>
          ) : null}
        </div>
      ) : null}
      {has("cctp") ? (
        <p className="text-2xs leading-relaxed text-ink-3">
          {references.isPending
            ? "Références en cours de chargement."
            : `${selected.length} référence(s) du référentiel citables par le CCTP : ${country ? REFERENCE_SCOPE_LABELS[country] : "pays de l’affaire"} et international, hors références rejetées.`}
        </p>
      ) : null}
      {usesAi ? <TextareaField label="Consignes particulières" optional rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Variantes, exclusions, prescriptions du maître d’ouvrage…" /> : null}
      {usesAi ? (
        <Checkbox
          label="J’accepte que les pages des plans choisis, le métré, le CCTP, les postes de la DPGF et les prix candidats soient transmis à l’API OpenAI pour la génération."
          checked={consent}
          onChange={setConsent}
        />
      ) : (
        <p className="text-2xs leading-relaxed text-ink-3">Aucun agent n’est appelé : le devis reprend les DPGF existantes des lots cochés, rien n’est transmis à l’API OpenAI.</p>
      )}
    </div>
  );
  return { fields, submit: () => launch.mutate(), pending: launch.isPending, disabled: documents.length === 0 || blocked || (usesAi && !consent) || (has("metre") && fileIds.length === 0) };
}

/** Fenêtre « Générer le dossier » de l'onglet Dossier. */
export function GenerateDialog({ open, onOpenChange, projectId, lots, plans, onStarted }: { open: boolean; onOpenChange: (open: boolean) => void; projectId: string; lots: Lot[]; plans: GenerationPlan[]; onStarted: () => void }) {
  const generation = useGeneration({
    projectId,
    lots,
    plans,
    active: open,
    onStarted: () => {
      onStarted();
      onOpenChange(false);
    },
  });
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Générer le dossier"
      description="Seuls travaillent les agents des documents choisis ; un CCTP ou une DPGF déjà établis pour un lot sont repris. Rien n’est inventé : ce qui manque est signalé, et chaque document reste à vérifier."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={generation.pending} disabled={generation.disabled} onClick={generation.submit}>
            Générer le dossier
          </Button>
        </>
      }
    >
      {generation.fields}
    </Modal>
  );
}
