import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Dialog";
import { InlineError } from "../../components/ui/Feedback";
import { SelectField, TextareaField } from "../../components/ui/Field";
import { api, query } from "../../lib/api";
import { quoteError } from "../../lib/quotes";
import type { Lot, Paged, Project, Quote } from "../../lib/types";

/**
 * « Générer mon devis avec l'IA » : description des travaux et données de l'affaire. L'IA propose les postes ;
 * les quantités viennent du métré, de la DPGF ou des nombres écrits dans la description ; les prix, de la
 * bibliothèque ou de la DPGF ; le reste est laissé à établir, à vérifier dans le devis.
 */
export function AiQuoteDialog({ open, onOpenChange, onStarted, projectId: fixedProject }: { open: boolean; onOpenChange: (open: boolean) => void; onStarted: (id: string) => void; projectId?: string }) {
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState(fixedProject ?? "");
  const [lotIds, setLotIds] = useState<string[]>([]);
  const [sources, setSources] = useState({ useCctp: true, useDpgf: true, useMetre: true });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setDescription("");
    setProjectId(fixedProject ?? "");
    setLotIds([]);
    setSources({ useCctp: true, useDpgf: true, useMetre: true });
    setError(null);
  }, [open, fixedProject]);
  const projects = useQuery({ queryKey: ["projects", "choix"], queryFn: ({ signal }) => api<Paged<Project>>(`/projects${query({ pageSize: 100 })}`, { signal }), enabled: open && !fixedProject });
  const project = useQuery({ queryKey: ["projects", projectId], queryFn: ({ signal }) => api<{ project: Project; lots: Lot[] }>(`/projects/${projectId}`, { signal }), enabled: open && Boolean(projectId) });
  const start = useMutation({
    mutationFn: () => api<{ quote: Quote; jobId: string }>("/quotes/ia", { body: { description: description || null, projectId: projectId || null, lotIds, ...sources } }),
    onSuccess: (res) => {
      toast.success(`Devis ${res.quote.number} en préparation.`);
      onOpenChange(false);
      onStarted(res.quote.id);
    },
    onError: (e) => setError(quoteError(e)),
  });
  const lots = project.data?.lots ?? [];
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Générer mon devis avec l’IA"
      description="L’IA identifie les prestations et prépare les lignes. Elle ne donne jamais de prix ni de quantité de son propre chef : les quantités viennent du métré, de la DPGF ou des nombres écrits ci-dessous, les prix de la bibliothèque ou de la DPGF. Le devis reste un brouillon à vérifier."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button disabled={!description.trim() && !projectId} loading={start.isPending} onClick={() => start.mutate()}>
            Préparer le devis
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error ? <InlineError>{error}</InlineError> : null}
        <TextareaField
          label="Description des travaux"
          optional={Boolean(projectId)}
          rows={5}
          placeholder="Peinture acrylique de 320 m² de murs et 45 m² de boiseries dans six salles de classe, protection des sols comprise."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          hint="Écrivez les quantités connues : elles seront reprises telles quelles, citées comme source."
        />
        {!fixedProject ? (
          <SelectField
            label="Affaire"
            optional
            placeholder="Aucune, devis à partir de la description seule"
            options={(projects.data?.items ?? []).map((p) => ({ value: p.id, label: `${p.reference}, ${p.name}` }))}
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setLotIds([]);
            }}
          />
        ) : null}
        {projectId ? (
          <>
            <fieldset>
              <legend className="text-xs font-semibold text-ink-2">Données de l’affaire à exploiter</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {(
                  [
                    ["useCctp", "CCTP"],
                    ["useDpgf", "DPGF"],
                    ["useMetre", "Métré"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs text-ink">
                    <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={sources[key]} onChange={() => setSources((s) => ({ ...s, [key]: !s[key] }))} />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            {lots.length ? (
              <fieldset>
                <legend className="text-xs font-semibold text-ink-2">Lots</legend>
                <p className="text-2xs text-ink-3">Aucun lot coché : tous les lots de l’affaire.</p>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {lots.map((lot) => (
                    <label key={lot.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs text-ink">
                      <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={lotIds.includes(lot.id)} onChange={() => setLotIds((list) => (list.includes(lot.id) ? list.filter((x) => x !== lot.id) : [...list, lot.id]))} />
                      <span className="truncate">{`${lot.code} ${lot.name}`}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
          </>
        ) : null}
      </div>
    </Modal>
  );
}
