import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Dialog";
import { InlineError } from "../../components/ui/Feedback";
import { Checkbox, Field, SelectField, TextareaField } from "../../components/ui/Field";
import { api, ApiError, errorMessage, query } from "../../lib/api";
import { type Job, useAgentStatus } from "../../lib/jobs";
import type { CctpDocumentSummary, CompanyProfile, Paged, ProjectRow } from "../../lib/types";

/** Lancement de l'agent DPGF : CCTP source, taux de taxe saisi, consigne, accord d'envoi. */
export function DpgfLaunchDialog({ open, onOpenChange, projectId: fixedProject, onStarted }: { open: boolean; onOpenChange: (open: boolean) => void; projectId?: string; onStarted?: (job: Job) => void }) {
  const queryClient = useQueryClient();
  const status = useAgentStatus();
  const [projectId, setProjectId] = useState(fixedProject ?? "");
  const [cctpId, setCctpId] = useState("");
  const [vatRate, setVatRate] = useState("");
  const [instructions, setInstructions] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setProjectId(fixedProject ?? "");
    setInstructions("");
    setConsent(false);
    setErrors({});
    setError(null);
  }, [open, fixedProject]);

  const projects = useQuery({
    queryKey: ["projects", "options"],
    queryFn: ({ signal }) => api<Paged<ProjectRow>>(`/projects${query({ pageSize: 100, sort: "nom", dir: "asc" })}`, { signal }),
    enabled: open && !fixedProject,
  });
  const cctps = useQuery({ queryKey: ["project", projectId, "cctp"], queryFn: ({ signal }) => api<{ items: CctpDocumentSummary[] }>(`/projects/${projectId}/cctp`, { signal }), enabled: open && Boolean(projectId) });
  const companies = useQuery({ queryKey: ["company", "profiles"], queryFn: ({ signal }) => api<{ items: CompanyProfile[] }>("/company/profiles", { signal }), enabled: open });
  const defaultVat = companies.data?.items.find((c) => c.isDefault)?.defaultVatRate ?? null;

  useEffect(() => {
    setCctpId(cctps.data?.items.find((c) => c.status === "valide")?.id ?? cctps.data?.items[0]?.id ?? "");
  }, [cctps.data]);
  useEffect(() => {
    if (open && defaultVat && !vatRate) setVatRate(String(Number(defaultVat)).replace(".", ","));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultVat]);

  const s = status.data;
  const blocked = s ? !s.simulation && (!s.openaiKey || !s.generationModel) : true;
  const launch = useMutation({
    mutationFn: () => api<{ job: Job }>(`/projects/${projectId}/dpgf`, { body: { cctpDocumentId: cctpId, vatRate: vatRate || null, instructions: instructions || null, consent } }),
    onSuccess: ({ job }) => {
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast.success("Établissement de la DPGF lancé.");
      onOpenChange(false);
      onStarted?.(job);
    },
    onError: (e) => {
      if (e instanceof ApiError && Object.keys(e.fields).length) {
        setErrors(e.fields);
        setError(e.fields.consent ?? null);
      } else setError(errorMessage(e));
    },
  });

  const items = cctps.data?.items ?? [];
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="DPGF depuis le CCTP"
      description="L’agent établit les postes de la DPGF à partir de chaque chapitre du CCTP. Les quantités viennent du métré ; les postes sans métré restent « à métrer ». Aucun prix n’est proposé à ce stade."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={launch.isPending} disabled={blocked || !projectId || !cctpId || !consent} onClick={() => launch.mutate()}>
            Établir la DPGF
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
        {fixedProject ? null : (
          <SelectField
            label="Affaire"
            placeholder={projects.isPending ? "Chargement…" : "Choisir une affaire"}
            options={(projects.data?.items ?? []).map((p) => ({ value: p.id, label: `${p.reference}, ${p.name}` }))}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          />
        )}
        {projectId && !cctps.isPending && items.length === 0 ? (
          <p className="rounded-xl border border-line p-3.5 text-xs leading-relaxed text-ink-3">Cette affaire n’a pas encore de CCTP : rédigez-le d’abord dans l’onglet CCTP.</p>
        ) : (
          <SelectField
            label="CCTP source"
            placeholder={cctps.isPending ? "Chargement…" : "Choisir un CCTP"}
            options={items.map((c) => ({ value: c.id, label: `${c.title}${c.status === "valide" ? ", validé" : ""}` }))}
            value={cctpId}
            onChange={(e) => setCctpId(e.target.value)}
            error={errors.cctpDocumentId}
            disabled={!projectId}
          />
        )}
        <Field
          label="Taux de TVA (%)"
          optional
          inputMode="decimal"
          value={vatRate}
          onChange={(e) => setVatRate(e.target.value)}
          error={errors.vatRate}
          hint={defaultVat ? "Repris de votre entité émettrice par défaut ; modifiable." : "Saisi par vous, jamais supposé. Laissez vide pour un total hors taxes seulement."}
        />
        <TextareaField label="Consigne" optional rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Découpage souhaité, postes à regrouper, présentation du maître d’ouvrage…" />
        <div className="rounded-xl border border-line bg-surface-2 p-3.5">
          <Checkbox label="J’accepte que le CCTP et le métré de l’affaire soient transmis à l’API OpenAI pour établir la DPGF." checked={consent} onChange={setConsent} />
        </div>
      </div>
    </Modal>
  );
}
