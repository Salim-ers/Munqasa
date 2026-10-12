import { useMutation, useQuery } from "@tanstack/react-query";
import { Library } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Currency } from "../../../shared/enums";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Dialog";
import { InlineError } from "../../components/ui/Feedback";
import { Field, SelectField } from "../../components/ui/Field";
import { api, query } from "../../lib/api";
import { cn } from "../../lib/cn";
import { quoteError } from "../../lib/quotes";
import type { CompanyProfile, Lot, Paged, Project, Quote } from "../../lib/types";
import { PricePickerDialog } from "./PricePickerDialog";

type Mode = "vierge" | "projet" | "dpgf" | "metre" | "bibliotheque";

const MODES: Array<{ value: Mode; label: string; text: string }> = [
  { value: "vierge", label: "Devis vierge", text: "Une page blanche, à remplir ligne par ligne ou depuis la bibliothèque." },
  { value: "projet", label: "Depuis une affaire", text: "Client, chantier et devise repris ; une section par lot choisi." },
  { value: "dpgf", label: "Depuis une DPGF", text: "Chapitres, postes, quantités et prix unitaires repris avec leur provenance." },
  { value: "metre", label: "Depuis le métré", text: "Un ouvrage par ligne avec sa quantité mesurée ; prix à établir." },
  { value: "bibliotheque", label: "Depuis la bibliothèque", text: "Les prix choisis, repris hors taxes ; quantités à préciser." },
];

/** Création d'un devis : informations connues préremplies, rien d'inventé (prix et quantités absents restent à établir). */
export function NewQuoteDialog({ open, onOpenChange, onCreated, projectId: fixedProject }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (id: string) => void; projectId?: string }) {
  const [mode, setMode] = useState<Mode>(fixedProject ? "projet" : "vierge");
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(fixedProject ?? "");
  const [lotIds, setLotIds] = useState<string[]>([]);
  const [dpgfId, setDpgfId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [priceIds, setPriceIds] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setMode(fixedProject ? "projet" : "vierge");
    setTitle("");
    setProjectId(fixedProject ?? "");
    setLotIds([]);
    setDpgfId("");
    setPriceIds([]);
    setError(null);
  }, [open, fixedProject]);

  const needsProject = mode === "projet" || mode === "metre" || mode === "dpgf";
  const projects = useQuery({ queryKey: ["projects", "choix"], queryFn: ({ signal }) => api<Paged<Project>>(`/projects${query({ pageSize: 100 })}`, { signal }), enabled: open && needsProject && !fixedProject });
  const project = useQuery({ queryKey: ["projects", projectId], queryFn: ({ signal }) => api<{ project: Project; lots: Lot[] }>(`/projects/${projectId}`, { signal }), enabled: open && Boolean(projectId) });
  const dpgfs = useQuery({ queryKey: ["dpgf", "list", projectId], queryFn: ({ signal }) => api<{ items: Array<{ id: string; title: string; postes: number; priced: number }> }>(`/projects/${projectId}/dpgf`, { signal }), enabled: open && mode === "dpgf" && Boolean(projectId) });
  const companies = useQuery({ queryKey: ["company", "profiles"], queryFn: ({ signal }) => api<{ items: CompanyProfile[] }>("/company/profiles", { signal }), enabled: open });
  const company = companies.data?.items.find((c) => c.id === companyId) ?? companies.data?.items[0] ?? null;
  const currency: Currency = project.data?.project.currency ?? company?.defaultCurrency ?? "EUR";

  const create = useMutation({
    mutationFn: () =>
      api<{ quote: Quote }>("/quotes", {
        body: {
          mode,
          title: title || null,
          projectId: needsProject ? projectId || null : null,
          dpgfId: mode === "dpgf" ? dpgfId || null : null,
          lotIds: needsProject ? lotIds : [],
          priceItemIds: mode === "bibliotheque" ? priceIds : [],
          companyProfileId: companyId || null,
        },
      }),
    onSuccess: (res) => {
      toast.success(`Devis ${res.quote.number} créé.`);
      onOpenChange(false);
      onCreated(res.quote.id);
    },
    onError: (e) => setError(quoteError(e)),
  });
  const lots = project.data?.lots ?? [];
  const ready = mode === "vierge" || (mode === "bibliotheque" ? priceIds.length > 0 : Boolean(projectId) && (mode !== "dpgf" || Boolean(dpgfId)));

  return (
    <>
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        title="Nouveau devis"
        description="Les informations déjà connues sont reprises : client, chantier, devise, conditions de règlement et mentions de l’entité émettrice. Un prix ou une quantité inconnus restent à établir, jamais remplacés par une valeur supposée."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button disabled={!ready} loading={create.isPending} onClick={() => create.mutate()}>
              Créer le devis
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          {error ? <InlineError>{error}</InlineError> : null}
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Point de départ">
            {MODES.filter((m) => !fixedProject || m.value !== "vierge").map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={mode === m.value}
                onClick={() => setMode(m.value)}
                className={cn("rounded-xl border px-3 py-2.5 text-left", mode === m.value ? "border-accent/50 bg-accent-soft" : "border-line hover:bg-surface-2")}
              >
                <span className="block text-xs font-semibold text-ink">{m.label}</span>
                <span className="mt-0.5 block text-2xs text-ink-3">{m.text}</span>
              </button>
            ))}
          </div>
          <Field label="Objet du devis" optional placeholder={needsProject ? "Repris de l’affaire si vide" : "Petits travaux de rénovation"} value={title} onChange={(e) => setTitle(e.target.value)} />
          {(companies.data?.items.length ?? 0) > 1 ? (
            <SelectField label="Entité émettrice" options={(companies.data?.items ?? []).map((c) => ({ value: c.id, label: `${c.label}, ${c.defaultCurrency}` }))} value={companyId || company?.id || ""} onChange={(e) => setCompanyId(e.target.value)} />
          ) : null}
          {needsProject && !fixedProject ? (
            <SelectField
              label="Affaire"
              placeholder="Choisir une affaire"
              options={(projects.data?.items ?? []).map((p) => ({ value: p.id, label: `${p.reference}, ${p.name}` }))}
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setLotIds([]);
                setDpgfId("");
              }}
            />
          ) : null}
          {mode === "dpgf" && projectId ? (
            <SelectField
              label="DPGF"
              placeholder={dpgfs.data?.items.length === 0 ? "Aucune DPGF dans cette affaire" : "Choisir une DPGF"}
              options={(dpgfs.data?.items ?? []).map((d) => ({ value: d.id, label: `${d.title}, ${d.priced} poste(s) chiffré(s) sur ${d.postes}` }))}
              value={dpgfId}
              onChange={(e) => setDpgfId(e.target.value)}
            />
          ) : null}
          {needsProject && projectId && lots.length ? (
            <fieldset>
              <legend className="text-xs font-semibold text-ink-2">Lots du devis</legend>
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
          {mode === "bibliotheque" ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-3 py-3">
              <p className="min-w-0 flex-1 text-xs text-ink-2">{priceIds.length ? `${priceIds.length} prix choisi(s), en ${currency}.` : `Aucun prix choisi pour l’instant, en ${currency}.`}</p>
              <Button size="sm" variant="secondary" icon={<Library className="size-3.5" />} onClick={() => setPicking(true)}>
                Choisir des prix
              </Button>
            </div>
          ) : null}
        </div>
      </Modal>
      <PricePickerDialog
        open={picking}
        onOpenChange={setPicking}
        currency={currency}
        onPick={(ids) => {
          setPriceIds((list) => [...new Set([...list, ...ids])]);
          setPicking(false);
        }}
      />
    </>
  );
}
