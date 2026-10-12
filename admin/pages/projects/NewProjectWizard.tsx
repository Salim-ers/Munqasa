import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Search, Sparkles } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import type { z } from "zod";
import { type Country, COUNTRY_LABELS, CURRENCY_LABELS, DESIGN_PHASE_LABELS, FILE_KIND_LABELS, type FileKind, MARKET_TYPE_LABELS, type Sector, SECTOR_LABELS } from "../../../shared/enums";
import { PROJECT_TYPES, searchable } from "../../../shared/lots";
import { projectInput } from "../../../shared/schemas";
import { TRADE_FAMILIES } from "../../../shared/trades";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Dialog";
import { InlineError, Skeleton } from "../../components/ui/Feedback";
import { Checkbox, Field, optionsOf, SelectField, TextareaField } from "../../components/ui/Field";
import { api, errorMessage } from "../../lib/api";
import { cn } from "../../lib/cn";
import { applyServerErrors } from "../../lib/forms";
import { useAgentStatus } from "../../lib/jobs";
import { firstPageText } from "../../lib/plan-text";
import type { Lot, LotCatalogList, Project } from "../../lib/types";
import { DropZone, UploadRow } from "./FilesTab";
import { type GenerationPlan, useGeneration } from "./GenerateDialog";
import { useUploads } from "./useUploads";

type Values = z.input<typeof projectInput>;
type Output = z.output<typeof projectInput>;
type Step = "affaire" | "lots" | "documents" | "production";
type ProjectType = keyof typeof PROJECT_TYPES;

const STEPS: Array<{ key: Step; label: string }> = [
  { key: "affaire", label: "Affaire" },
  { key: "lots", label: "Lots" },
  { key: "documents", label: "Documents" },
  { key: "production", label: "Production" },
];
const CURRENCY_OF: Record<Country, "MAD" | "EUR"> = { MA: "MAD", FR: "EUR" };

interface PrefillField {
  value: string;
  file: string;
  quote: string;
}
interface Prefill {
  name: PrefillField | null;
  client: (PrefillField & { clientId: string | null; clientName: string | null }) | null;
  siteAddress: PrefillField | null;
  city: PrefillField | null;
  worksNature: PrefillField | null;
  projectType: { value: ProjectType; reason: string } | null;
  country: { value: Country; reason: string } | null;
  notes: string[];
}
interface PlanText {
  file: File;
  text: string | null;
  problem: string | null;
}

function initialValues(defaults?: { clientId?: string; country?: Country; sector?: Sector }): Values {
  const country = defaults?.country ?? "MA";
  return {
    name: "",
    clientId: defaults?.clientId ?? "",
    country,
    city: "",
    siteAddress: "",
    marketType: "appel_offres_ouvert",
    sector: defaults?.sector ?? "public",
    worksNature: "",
    designPhase: "dce",
    currency: CURRENCY_OF[country],
    submissionDeadline: "",
    startDate: "",
    description: "",
    hypotheses: "",
    constraints: "",
    manualEstimate: "",
  };
}

const isPdf = (file: File) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);
const isPlan = (file: File) => isPdf(file) || /\.(png|jpe?g|webp|dwg|dxf|ifc)$/i.test(file.name);

/**
 * Création d'une affaire en un parcours : l'affaire (nom, maître d'ouvrage, pays et localisation, type
 * d'opération), ses lots, ses documents, puis les documents à produire et la génération. On peut commencer par
 * déposer les plans : leur cartouche, lu sur ce poste, préremplit les champs dont la valeur figure mot pour mot
 * sur un plan. Chaque étape après la première peut être remise à plus tard ; l'affaire existe dès la première.
 */
export function NewProjectWizard({ open, onOpenChange, defaults }: { open: boolean; onOpenChange: (open: boolean) => void; defaults?: { clientId?: string; country?: Country; sector?: Sector } }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("affaire");
  const [project, setProject] = useState<Project | null>(null);
  const [projectType, setProjectType] = useState<ProjectType>("batiment");
  const [pending, setPending] = useState<File[]>([]);

  useEffect(() => {
    if (!open) return;
    setStep("affaire");
    setProject(null);
    setProjectType("batiment");
    setPending([]);
  }, [open]);

  const refreshProject = () => {
    if (!project) return;
    void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    void queryClient.invalidateQueries({ queryKey: ["files", project.id] });
  };
  /** Fermer après la création ouvre l'affaire : rien de ce qui a été fait n'est perdu. */
  const finish = (tab?: string) => {
    onOpenChange(false);
    if (project) navigate(`/administration/affaires/${project.id}${tab ? `?onglet=${tab}` : ""}`);
  };

  const affaire = useAffaireStep({ open, defaults, pending, setPending, projectType, setProjectType, onCreated: (created) => {
    setProject(created);
    setStep("lots");
  } });
  const lots = useLotsStep({ project, projectType, active: step === "lots", onDone: () => setStep("documents") });
  const documents = useDocumentsStep({ project, pending, active: step === "documents", onFinished: refreshProject, onDone: () => setStep("production") });
  const projectData = useQuery({
    queryKey: ["project", project?.id],
    queryFn: ({ signal }) => api<{ lots: Lot[] }>(`/projects/${project!.id}`, { signal }),
    enabled: Boolean(project) && step === "production",
  });
  const dossier = useQuery({
    queryKey: ["project", project?.id, "dossier"],
    queryFn: ({ signal }) => api<{ plans: GenerationPlan[] }>(`/projects/${project!.id}/dossier`, { signal }),
    enabled: Boolean(project) && step === "production",
  });
  const generation = useGeneration({
    projectId: project?.id ?? "",
    lots: projectData.data?.lots ?? [],
    plans: dossier.data?.plans ?? [],
    active: step === "production" && Boolean(projectData.data && dossier.data),
    onStarted: () => finish("dossier"),
  });

  const index = STEPS.findIndex((s) => s.key === step);
  let body: ReactNode;
  let footer: ReactNode;
  let onSubmit: ((event: React.FormEvent) => void) | undefined;
  if (step === "affaire") {
    ({ body, footer } = affaire);
    onSubmit = affaire.onSubmit;
    footer = (
      <>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Annuler
        </Button>
        {footer}
      </>
    );
  } else if (step === "lots") {
    body = lots.body;
    footer = (
      <>
        <Button variant="secondary" onClick={() => setStep("documents")}>
          Plus tard
        </Button>
        {lots.footer}
      </>
    );
  } else if (step === "documents") {
    body = documents.body;
    footer = (
      <>
        <Button variant="secondary" disabled={documents.busy} onClick={() => setStep("production")}>
          Plus tard
        </Button>
        {documents.footer}
      </>
    );
  } else {
    body = projectData.isPending || dossier.isPending ? <Skeleton className="h-72" /> : generation.fields;
    footer = (
      <>
        <Button variant="secondary" onClick={() => finish()}>
          Ouvrir l’affaire
        </Button>
        <Button loading={generation.pending} disabled={generation.disabled || projectData.isPending || dossier.isPending} onClick={generation.submit}>
          Générer les documents
        </Button>
      </>
    );
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : project ? finish() : onOpenChange(false))}
      title="Nouvelle affaire"
      description={project ? `${project.reference}, ${project.name}` : "La référence est attribuée automatiquement à la création."}
      size="lg"
      onSubmit={onSubmit}
      footer={footer}
    >
      <ol className="mb-5 grid grid-cols-4 gap-1.5" aria-label="Étapes de la création">
        {STEPS.map((s, i) => (
          <li key={s.key} aria-current={s.key === step ? "step" : undefined} className="grid gap-1.5">
            <span className={cn("h-1 rounded-full transition-colors", i <= index ? "bg-accent" : "bg-surface-3")} aria-hidden="true" />
            <span className={cn("truncate text-2xs", s.key === step ? "font-semibold text-ink" : i < index ? "text-ink-2" : "text-ink-3")}>{s.label}</span>
          </li>
        ))}
      </ol>
      {body}
    </Modal>
  );
}

/** Première étape : l'affaire, préremplie au besoin depuis le cartouche des plans. */
function useAffaireStep({
  open,
  defaults,
  pending,
  setPending,
  projectType,
  setProjectType,
  onCreated,
}: {
  open: boolean;
  defaults?: { clientId?: string; country?: Country; sector?: Sector };
  pending: File[];
  setPending: (files: File[]) => void;
  projectType: ProjectType;
  setProjectType: (type: ProjectType) => void;
  onCreated: (project: Project) => void;
}) {
  const queryClient = useQueryClient();
  const status = useAgentStatus();
  const [general, setGeneral] = useState<string | null>(null);
  const [texts, setTexts] = useState<PlanText[]>([]);
  const [reading, setReading] = useState(false);
  const [consent, setConsent] = useState(false);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [hints, setHints] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<string[]>([]);
  const [newClient, setNewClient] = useState<string | null>(null);
  const [createClient, setCreateClient] = useState(false);
  const [details, setDetails] = useState(false);
  const form = useForm<Values, unknown, Output>({ resolver: zodResolver(projectInput), defaultValues: initialValues(defaults) });
  const { register, reset, setError, setValue, getValues, handleSubmit, control, formState } = form;
  const errors = formState.errors;
  const country = useWatch({ control, name: "country" });
  const currency = useWatch({ control, name: "currency" });
  const clientId = useWatch({ control, name: "clientId" });
  const clients = useQuery({
    queryKey: ["clients", "options"],
    queryFn: ({ signal }) => api<{ items: Array<{ id: string; name: string; country: Country; sector: Sector }> }>("/clients/options", { signal }),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    reset(initialValues(defaults));
    setGeneral(null);
    setTexts([]);
    setConsent(false);
    setPrefillError(null);
    setHints({});
    setNotes([]);
    setNewClient(null);
    setCreateClient(false);
    setDetails(false);
    // Les valeurs par défaut ne changent qu'à l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reset]);

  // La devise suit le pays tant qu'elle n'a pas été choisie à la main.
  useEffect(() => {
    if (country && !formState.dirtyFields.currency) setValue("currency", CURRENCY_OF[country]);
  }, [country, formState.dirtyFields.currency, setValue]);
  // Un client connu donne son pays et son secteur, s'ils n'ont pas été choisis à la main.
  useEffect(() => {
    const known = clients.data?.items.find((c) => c.id === clientId);
    if (!known) return;
    if (!formState.dirtyFields.country) setValue("country", known.country);
    if (!formState.dirtyFields.sector) setValue("sector", known.sector);
  }, [clientId, clients.data, formState.dirtyFields.country, formState.dirtyFields.sector, setValue]);

  async function readPlans(files: FileList) {
    const list = Array.from(files).slice(0, 10);
    setPending([...pending.filter((p) => !list.some((f) => f.name === p.name && f.size === p.size)), ...list]);
    setReading(true);
    setPrefillError(null);
    const read: PlanText[] = [];
    for (const file of list) {
      if (!isPdf(file)) {
        read.push({ file, text: null, problem: "pas de texte à lire sur une image ou un fichier de CAO" });
        continue;
      }
      try {
        const text = await firstPageText(file);
        read.push({ file, text: text || null, problem: text ? null : "aucun texte vectoriel, plan scanné" });
      } catch {
        read.push({ file, text: null, problem: "lecture impossible dans ce navigateur" });
      }
    }
    setTexts((current) => [...current.filter((t) => !list.some((f) => f.name === t.file.name && f.size === t.file.size)), ...read]);
    setReading(false);
  }

  const readable = texts.filter((t) => t.text);
  const s = status.data;
  const aiReady = s ? s.simulation || (s.openaiKey && Boolean(s.extractionModel)) : false;
  const prefill = useMutation({
    mutationFn: () => api<{ prefill: Prefill }>("/projects/prefill", { body: { files: readable.map((t) => ({ name: t.file.name, text: t.text })), consent } }),
    onSuccess: ({ prefill: p }) => {
      const next: Record<string, string> = {};
      let filled = 0;
      const fill = (field: "name" | "city" | "siteAddress" | "worksNature", value: PrefillField | null) => {
        if (!value) return;
        next[field] = `Lu sur ${value.file} : « ${value.quote} »`;
        if (!getValues(field)) {
          setValue(field, value.value, { shouldDirty: true });
          filled++;
        }
      };
      fill("name", p.name);
      fill("city", p.city);
      fill("siteAddress", p.siteAddress);
      fill("worksNature", p.worksNature);
      if (p.client) {
        next.clientId = `Maître d’ouvrage lu sur ${p.client.file} : « ${p.client.quote} »`;
        if (p.client.clientId) {
          if (!getValues("clientId")) {
            setValue("clientId", p.client.clientId, { shouldDirty: true });
            filled++;
          }
        } else {
          setNewClient(p.client.value);
          setCreateClient(!getValues("clientId"));
        }
      }
      if (p.country && !formState.dirtyFields.country) {
        setValue("country", p.country.value);
        next.country = `D’après ${p.country.reason}.`;
      }
      if (p.projectType) {
        setProjectType(p.projectType.value);
        next.projectType = `D’après l’${p.projectType.reason}.`;
      }
      setHints(next);
      setNotes(p.notes);
      toast.success(filled ? `${filled} champ(s) prérempli(s) depuis les plans, à vérifier.` : "Aucun champ prérempli : rien de vérifiable sur les plans.");
    },
    onError: (e) => setPrefillError(errorMessage(e)),
  });

  const create = useMutation({
    mutationFn: async (data: Output) => {
      let client = data.clientId;
      if (!client && createClient && newClient) {
        const created = await api<{ client: { id: string } }>("/clients", { body: { name: newClient, sector: data.sector, country: data.country } });
        client = created.client.id;
        void queryClient.invalidateQueries({ queryKey: ["clients"] });
      }
      return api<{ project: Project }>("/projects", { body: { ...data, clientId: client } });
    },
    onSuccess: ({ project }) => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`Affaire ${project.reference} créée.`);
      onCreated(project);
    },
    onError: (error) => setGeneral(applyServerErrors(error, setError)),
  });

  const hint = (key: string) => (hints[key] ? <span className="text-accent">{hints[key]}</span> : undefined);
  const body = (
    <div className="grid gap-5">
      <section className="grid gap-3 rounded-xl border border-line p-4" aria-label="Commencer par les plans">
        <div className="flex items-start gap-2.5">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink">Commencer par les plans</p>
            <p className="text-2xs leading-relaxed text-ink-3">Le cartouche des plans PDF est lu sur ce poste ; les champs dont la valeur figure mot pour mot sur un plan sont préremplis. Les plans déposés ici sont ensuite joints à l’affaire.</p>
          </div>
        </div>
        <DropZone onFiles={(files) => void readPlans(files)} accept=".pdf,.png,.jpg,.jpeg,.webp,.dwg,.dxf,.ifc" title="Glissez les plans ici" />
        {reading ? <p className="text-2xs text-ink-3">Lecture des cartouches en cours.</p> : null}
        {texts.length ? (
          <ul className="grid gap-1 text-2xs text-ink-2">
            {texts.map((t) => (
              <li key={`${t.file.name}${t.file.size}`} className="flex items-start gap-2">
                <FileText className="mt-px size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
                <span className="min-w-0 break-words">{t.text ? `${t.file.name} : texte du cartouche lu` : `${t.file.name} : ${t.problem}`}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {readable.length ? (
          <div className="grid gap-2">
            <Checkbox label="J’accepte que le texte des cartouches, sans les cotes, soit transmis à l’API OpenAI pour préremplir l’affaire." checked={consent} onChange={setConsent} />
            {!aiReady && s ? <p className="text-2xs text-warning">La clé OpenAI ou le modèle de lecture ne sont pas configurés : complétez les champs à la main.</p> : null}
            {prefillError ? <InlineError>{prefillError}</InlineError> : null}
            <div>
              <Button size="sm" variant="secondary" icon={<Sparkles className="size-3.5" />} loading={prefill.isPending} disabled={!consent || !aiReady} onClick={() => prefill.mutate()}>
                Préremplir depuis les plans
              </Button>
            </div>
            {notes.length ? (
              <ul className="grid gap-0.5 text-2xs leading-relaxed text-ink-3">
                {notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        {general ? (
          <div className="sm:col-span-2">
            <InlineError>{general}</InlineError>
          </div>
        ) : null}
        <Field label="Intitulé de l’affaire" className="sm:col-span-2" placeholder="Objet du marché ou de l’opération" {...register("name")} error={errors.name?.message} hint={hint("name")} />
        <div className="grid gap-2">
          {clients.data ? (
            <SelectField label="Client ou maître d’ouvrage" optional placeholder="Aucun client" options={clients.data.items.map((c) => ({ value: c.id, label: c.name }))} {...register("clientId")} error={errors.clientId?.message} hint={hint("clientId")} />
          ) : (
            <SelectField label="Client ou maître d’ouvrage" optional placeholder="Chargement…" options={[]} disabled value="" onChange={() => undefined} />
          )}
          {newClient && !clientId ? <Checkbox label={`Créer le client « ${newClient} »`} checked={createClient} onChange={setCreateClient} /> : null}
        </div>
        <SelectField
          label="Type d’opération"
          options={Object.entries(PROJECT_TYPES).map(([value, label]) => ({ value, label }))}
          value={projectType}
          onChange={(e) => setProjectType(e.target.value as ProjectType)}
          hint={hints.projectType ? <span className="text-accent">{hints.projectType}</span> : "Propose les lots du modèle correspondant."}
        />
        <SelectField label="Pays" options={optionsOf(COUNTRY_LABELS)} {...register("country")} error={errors.country?.message} hint={hint("country")} />
        <Field label="Ville" optional {...register("city")} error={errors.city?.message} hint={hint("city")} />
        <Field label="Adresse du site" optional className="sm:col-span-2" {...register("siteAddress")} error={errors.siteAddress?.message} hint={hint("siteAddress")} />
        <Field label="Date limite de remise" optional type="datetime-local" {...register("submissionDeadline")} error={errors.submissionDeadline?.message} hint="À votre heure locale." />
        <SelectField label="Devise" options={optionsOf(CURRENCY_LABELS)} {...register("currency")} error={errors.currency?.message} />
      </div>

      <div className="rounded-xl border border-line">
        <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-semibold text-ink-2" aria-expanded={details} onClick={() => setDetails((v) => !v)}>
          Plus de détails
          <span className="text-2xs font-normal text-ink-3">{details ? "Masquer" : "Secteur, marché, phase, estimation, description"}</span>
        </button>
        {details ? (
          <div className="grid gap-4 border-t border-line p-4 sm:grid-cols-2">
            <SelectField label="Secteur" options={optionsOf(SECTOR_LABELS)} {...register("sector")} error={errors.sector?.message} />
            <SelectField label="Type de marché" options={optionsOf(MARKET_TYPE_LABELS)} {...register("marketType")} error={errors.marketType?.message} />
            <SelectField label="Phase de conception" options={optionsOf(DESIGN_PHASE_LABELS)} {...register("designPhase")} error={errors.designPhase?.message} />
            <Field label="Nature des travaux" optional placeholder="Construction neuve, réhabilitation, extension…" {...register("worksNature")} error={errors.worksNature?.message} hint={hint("worksNature")} />
            <Field label="Démarrage prévu" optional type="date" {...register("startDate")} error={errors.startDate?.message} />
            <Field
              label={`Estimation (${currency ?? "MAD"})`}
              optional
              inputMode="decimal"
              placeholder="Montant estimé hors taxes"
              {...register("manualEstimate")}
              error={errors.manualEstimate?.message}
              hint="Votre estimation, distincte des montants calculés des DPGF."
            />
            <TextareaField label="Description" optional className="sm:col-span-2" rows={3} {...register("description")} error={errors.description?.message} />
          </div>
        ) : null}
      </div>
    </div>
  );
  const footer = (
    <Button type="submit" loading={create.isPending}>
      Créer l’affaire
    </Button>
  );
  const onSubmit = handleSubmit((data) => {
    setGeneral(null);
    create.mutate(data);
  });
  return { body, footer, onSubmit };
}

/** Deuxième étape : les lots du modèle du type d'opération, présélectionnés et ajustables. */
function useLotsStep({ project, projectType, active, onDone }: { project: Project | null; projectType: ProjectType; active: boolean; onDone: () => void }) {
  const catalogs = useQuery({ queryKey: ["lot-catalogs"], queryFn: ({ signal }) => api<LotCatalogList>("/lot-catalogs", { signal }), enabled: active });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const list = catalogs.data?.catalogs ?? [];
  const fitting = (c: (typeof list)[number]) => !c.country || c.country === project?.country;
  const catalog = list.find((c) => c.projectType === projectType && fitting(c)) ?? list.find((c) => c.isDefault) ?? list[0];
  const entries = useMemo(() => (catalog?.entries ?? []).filter((e) => !e.archived && !e.parentId), [catalog]);
  const initialized = useRef<string | null>(null);
  useEffect(() => {
    if (!active || !catalog || initialized.current === catalog.id) return;
    initialized.current = catalog.id;
    // Modèle propre au type d'opération : ses lots sont présélectionnés ; nomenclature complète : aucun.
    setSelected(new Set(catalog.projectType === projectType && projectType !== "batiment" ? entries.map((e) => e.id) : []));
    setSearch("");
    setError(null);
  }, [active, catalog, entries, projectType]);
  const add = useMutation({
    mutationFn: () => api<{ created: unknown[] }>(`/projects/${project!.id}/lots/bulk`, { body: { selections: [...selected].map((catalogEntryId) => ({ catalogEntryId })) } }),
    onSuccess: (result) => {
      toast.success(`${result.created.length} lot(s) ajouté(s).`);
      onDone();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const query = searchable(search.trim());
  const visible = entries.filter((e) => !query || searchable(`${e.number} ${e.name}`).includes(query));
  const groups = TRADE_FAMILIES.map((family) => ({ family, items: visible.filter((e) => e.tradeFamily === family.key) })).filter((g) => g.items.length);
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const body = catalogs.isPending ? (
    <Skeleton className="h-72" />
  ) : (
    <div className="grid gap-3">
      {error ? <InlineError>{error}</InlineError> : null}
      <p className="text-xs leading-relaxed text-ink-2">
        {catalog ? `Nomenclature « ${catalog.name} »${catalog.projectType === projectType && projectType !== "batiment" ? ", lots du modèle présélectionnés" : ""}. Les numéros sont recopiés dans l’affaire ; d’autres lots s’ajoutent plus tard dans l’onglet Lots.` : "Aucune nomenclature de lots."}
      </p>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Numéro ou intitulé : 01, plomberie, façades…"
          aria-label="Rechercher un lot"
          className="h-10 w-full rounded-xl border border-line bg-surface pr-3 pl-9 text-xs text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)]"
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-2xs text-ink-3">{`${selected.size} lot(s) sélectionné(s)`}</p>
        <Button size="sm" variant="ghost" disabled={selected.size === 0} onClick={() => setSelected(new Set())}>
          Tout désélectionner
        </Button>
      </div>
      <div className="grid max-h-[22rem] gap-3 overflow-y-auto pr-1">
        {groups.map(({ family, items }) => (
          <section key={family.key}>
            <h3 className="border-b border-line pb-1 text-2xs font-semibold tracking-wide text-ink-3 uppercase">{family.label}</h3>
            <ul className="mt-1 grid gap-0.5">
              {items.map((e) => (
                <li key={e.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                    <input type="checkbox" className="size-4 shrink-0 accent-[var(--accent)]" checked={selected.has(e.id)} onChange={(ev) => toggle(e.id, ev.target.checked)} aria-label={`${e.number} ${e.name}`} />
                    <span className="grid h-7 min-w-11 shrink-0 place-items-center rounded-md bg-surface-2 px-1.5 text-2xs font-semibold text-ink tabular">{e.number}</span>
                    <span className="min-w-0 truncate text-xs text-ink">{e.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {groups.length === 0 ? <p className="py-6 text-center text-xs text-ink-3">Aucun lot ne correspond à la recherche.</p> : null}
      </div>
    </div>
  );
  const footer = (
    <Button loading={add.isPending} disabled={selected.size === 0} onClick={() => add.mutate()}>
      {selected.size ? `Ajouter ${selected.size} lot(s)` : "Ajouter"}
    </Button>
  );
  return { body, footer };
}

/** Troisième étape : les documents de l'affaire ; les plans déposés à la première étape sont envoyés d'office. */
function useDocumentsStep({ project, pending, active, onFinished, onDone }: { project: Project | null; pending: File[]; active: boolean; onFinished: () => void; onDone: () => void }) {
  const [kind, setKind] = useState<FileKind>("plan");
  const uploads = useUploads(project?.id ?? null, onFinished);
  const sent = useRef(false);
  useEffect(() => {
    if (!active || !project || sent.current || pending.length === 0) return;
    sent.current = true;
    const plans = pending.filter(isPlan);
    const others = pending.filter((f) => !isPlan(f));
    if (plans.length) uploads.add(plans, "plan");
    if (others.length) uploads.add(others, "document_consultation");
  }, [active, project, pending, uploads]);
  useEffect(() => {
    if (!project) sent.current = false;
  }, [project]);
  const failed = uploads.items.filter((i) => i.stage === "erreur").length;
  const done = uploads.items.filter((i) => i.stage === "termine").length;
  const body = (
    <div className="grid gap-4">
      <p className="text-xs leading-relaxed text-ink-2">Plans, pièces du dossier de consultation, documents techniques : ils seront la source du métré, du CCTP et de la DPGF. Chaque fichier est vérifié à la réception et reste privé.</p>
      <SelectField label="Type des fichiers déposés" options={optionsOf(FILE_KIND_LABELS)} value={kind} onChange={(e) => setKind(e.target.value as FileKind)} />
      <DropZone onFiles={(files) => uploads.add(files, kind)} />
      {uploads.items.length ? (
        <ul className="grid gap-2" aria-label="Envois">
          {uploads.items.map((item) => (
            <UploadRow key={item.key} item={item} onCancel={() => uploads.cancel(item.key)} />
          ))}
        </ul>
      ) : null}
      {uploads.items.length && !uploads.busy ? <p className="text-2xs text-ink-3">{`${done} fichier(s) vérifié(s)${failed ? `, ${failed} en échec` : ""}.`}</p> : null}
    </div>
  );
  const footer = (
    <Button disabled={uploads.busy} loading={uploads.busy} onClick={onDone}>
      Continuer
    </Button>
  );
  return { body, footer, busy: uploads.busy };
}
