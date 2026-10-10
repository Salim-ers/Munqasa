import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CircleDashed, FileCheck2, PenLine, RefreshCw, Sparkles, TriangleAlert, Wrench } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { type DossierLevel, DOSSIER_LEVEL_LABELS, DOSSIER_LEVELS } from "../../../shared/dossier";
import { REFERENCE_SCOPE_LABELS } from "../../../shared/enums";
import { CCTP_LEVEL_LABELS, CCTP_LEVELS } from "../../../shared/schemas";
import { documentGroup, dossierGroup, DownloadMenu } from "../../components/DownloadMenu";
import { JobProgress } from "../../components/JobProgress";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Dialog";
import { EmptyState, InlineError, Skeleton } from "../../components/ui/Feedback";
import { Checkbox, Field, SelectField, TextareaField } from "../../components/ui/Field";
import { Segmented } from "../../components/ui/Segmented";
import { api, ApiError, errorMessage } from "../../lib/api";
import { cn } from "../../lib/cn";
import { formatDateTime } from "../../lib/format";
import { isActive, type Job, useAgentStatus } from "../../lib/jobs";
import type { Lot, TechnicalReference } from "../../lib/types";

interface DossierData {
  status: {
    level: DossierLevel;
    levelLabel: string;
    criteria: Array<{ level: DossierLevel; label: string; met: boolean; detail: string | null }>;
    issues: { bloquante: number; majeure: number; mineure: number; information: number };
    audit: { id: string; createdAt: string; upToDate: boolean; fixes: number } | null;
    validation: { signedBy: string; qualification: string; createdAt: string; current: boolean } | null;
    documents: Array<{ type: "cctp" | "dpgf"; id: string; title: string; status: string; version: number }>;
    running: boolean;
  };
  generation: Job | null;
  audit: Job | null;
  fixes: Array<{ kind: string; target: string; note: string }>;
  plans: Array<{ id: string; name: string; mimeType: string; pageCount: number | null }>;
}

const LEVEL_TEXT: Record<DossierLevel, string> = {
  brouillon: "Le dossier n’est pas encore établi ou porte une anomalie bloquante.",
  terminee_avec_reserves: "CCTP et DPGF établis. Des réserves restent à lever avant la vérification automatique.",
  verification_automatique_reussie: "Le contrôle indépendant ne relève plus d’anomalie bloquante ni majeure.",
  pret_pour_validation: "Tout ce qui se vérifie automatiquement est vérifié : le dossier attend la validation d’un professionnel.",
  valide_professionnel: "Le dossier a été validé par un professionnel, dans les versions validées de ses documents.",
};
const DOC_STATUS: Record<string, string> = { brouillon: "Brouillon", en_generation: "En génération", a_valider: "À valider", valide: "Validé", archive: "Archivé" };

/** Espace du dossier : génération par les agents, contrôle indépendant, niveau de validation, documents, déclaration. */
export function DossierTab({ projectId, lots }: { projectId: string; lots: Lot[] }) {
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const dossier = useQuery({
    queryKey: ["project", projectId, "dossier"],
    queryFn: ({ signal }) => api<DossierData>(`/projects/${projectId}/dossier`, { signal }),
    refetchInterval: (q) => (q.state.data && ((q.state.data.generation && isActive(q.state.data.generation)) || (q.state.data.audit && isActive(q.state.data.audit))) ? 2500 : false),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
  // Fin d'un traitement : documents, métré et niveau rechargés.
  const active = dossier.data ? [dossier.data.generation, dossier.data.audit].filter((j) => j && isActive(j)).length : 0;
  const [wasActive, setWasActive] = useState(0);
  useEffect(() => {
    if (wasActive && !active) refresh();
    setWasActive(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const audit = useMutation({
    mutationFn: () => api(`/projects/${projectId}/dossier/audit`, { body: {} }),
    onSuccess: () => {
      refresh();
      toast.success("Contrôle indépendant lancé.");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (dossier.isPending) return <Skeleton className="mt-4 h-96" />;
  if (dossier.isError || !dossier.data) return <Card className="mt-4 p-6"><EmptyState title="Dossier indisponible" text={errorMessage(dossier.error)} /></Card>;
  const d = dossier.data;
  const s = d.status;
  const rank = DOSSIER_LEVELS.indexOf(s.level);
  const cctp = s.documents.find((x) => x.type === "cctp");
  const dpgf = s.documents.find((x) => x.type === "dpgf");

  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid content-start gap-4">
        <Card className="p-5">
          <CardHeader
            title="Générer le dossier"
            subtitle="Lecture des plans et métré, CCTP, DPGF, sous-détails, puis contrôle indépendant : un seul traitement, chaque agent à son tour."
            action={
              <Button size="sm" icon={<Sparkles className="size-3.5" />} onClick={() => setGenerating(true)} disabled={Boolean(d.generation && isActive(d.generation))}>
                Générer le dossier
              </Button>
            }
          />
          {d.generation ? (
            <div className="mt-4">
              <JobProgress job={d.generation} defaultOpen={isActive(d.generation)} />
            </div>
          ) : (
            <p className="mt-4 text-xs leading-relaxed text-ink-3">
              Déposez d’abord les plans dans l’onglet Documents. Chaque document produit reste modifiable dans son onglet et passe par le contrôle qualité.
            </p>
          )}
        </Card>

        <Card className="p-5">
          <CardHeader
            title="Contrôle indépendant"
            subtitle="Recalcule les quantités, les montants et les sous-détails sans se fier aux valeurs enregistrées, corrige les erreurs de calcul et rejoue tous les contrôles."
            action={
              <Button size="sm" variant="secondary" icon={<RefreshCw className="size-3.5" />} loading={audit.isPending} disabled={Boolean(d.audit && isActive(d.audit))} onClick={() => audit.mutate()}>
                Lancer le contrôle
              </Button>
            }
          />
          {s.audit ? (
            <div className="mt-4 grid gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
                <span>{`Dernier contrôle le ${formatDateTime(s.audit.createdAt)}`}</span>
                <Badge tone={s.audit.upToDate ? "success" : "warning"} dot>
                  {s.audit.upToDate ? "À jour" : "Dossier modifié depuis"}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(
                  [
                    ["Bloquantes", s.issues.bloquante, "danger"],
                    ["Majeures", s.issues.majeure, "warning"],
                    ["Mineures", s.issues.mineure, "neutral"],
                    ["Informations", s.issues.information, "neutral"],
                  ] as const
                ).map(([label, n, tone]) => (
                  <div key={label} className="rounded-xl bg-surface-2 px-3 py-2">
                    <p className="text-2xs text-ink-3">{label}</p>
                    <p className={cn("text-sm font-semibold tabular", n && tone === "danger" ? "text-danger" : n && tone === "warning" ? "text-warning" : "text-ink")}>{n}</p>
                  </div>
                ))}
              </div>
              {d.fixes.length ? (
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-2xs font-semibold text-ink-2">
                    <Wrench className="size-3.5" aria-hidden="true" />
                    {`${d.fixes.length} correction(s) de calcul appliquée(s)`}
                  </p>
                  <ul className="grid max-h-56 gap-1 overflow-y-auto overscroll-contain rounded-xl border border-line p-2.5 text-2xs leading-relaxed text-ink-2">
                    {d.fixes.map((f, i) => (
                      <li key={i}>
                        <span className="font-semibold text-ink">{f.target}</span>
                        {` : ${f.note}`}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-2xs text-ink-3">Aucune erreur de calcul au dernier contrôle : toutes les valeurs recalculées concordaient.</p>
              )}
              <p className="text-2xs text-ink-3">Le détail des anomalies figure dans chaque onglet et dans le rapport de contrôle téléchargeable.</p>
            </div>
          ) : (
            <p className="mt-4 text-xs text-ink-3">Aucun contrôle indépendant n’a encore été lancé sur ce dossier.</p>
          )}
          {d.audit && isActive(d.audit) ? (
            <div className="mt-3">
              <JobProgress job={d.audit} defaultOpen />
            </div>
          ) : null}
        </Card>

        <Card className="p-5">
          <CardHeader title="Documents produits" subtitle="Chaque document dans ses formats natifs et en PDF, et le dossier complet en archive ZIP." />
          {s.documents.length === 0 ? (
            <EmptyState className="mt-4" icon={<FileCheck2 className="size-5" />} title="Aucun document produit" text="Lancez la génération du dossier, ou établissez le CCTP et la DPGF depuis leurs onglets." />
          ) : (
            <ul className="mt-4 grid gap-2">
              {s.documents.map((doc) => (
                <li key={doc.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-3.5 py-3">
                  <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <p className="truncate text-xs font-semibold text-ink">{doc.title}</p>
                    <p className="text-2xs text-ink-3">{[doc.type === "cctp" ? "CCTP" : "DPGF", `version ${doc.version}`].join(", ")}</p>
                  </div>
                  <Badge tone={doc.status === "valide" ? "success" : doc.status === "a_valider" ? "warning" : "neutral"} dot>
                    {DOC_STATUS[doc.status] ?? doc.status}
                  </Badge>
                  <DownloadMenu
                    groups={
                      doc.type === "cctp"
                        ? [documentGroup("CCTP", "cctp", doc.id, ["docx", "pdf"])]
                        : [
                            documentGroup("DPGF", "dpgf", doc.id, ["xlsx", "pdf"]),
                            documentGroup("Bordereau des prix (BPU)", "bpu", doc.id, ["xlsx", "pdf"]),
                            documentGroup("Détail quantitatif estimatif (DQE)", "dqe", doc.id, ["xlsx", "pdf"]),
                            documentGroup("Estimation des travaux", "estimation", doc.id, ["xlsx", "pdf"]),
                            documentGroup("Sous-détails", "sous_details", doc.id, ["xlsx", "pdf"]),
                          ]
                    }
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <DownloadMenu
              label="Métré et rapports"
              groups={[
                documentGroup("Note de métrés", "metre", projectId, ["xlsx", "docx", "pdf"]),
                documentGroup("Rapport d’analyse des plans", "analyse", projectId, ["docx", "pdf"]),
                documentGroup("Rapport de contrôle qualité", "controle", projectId, ["docx", "pdf"]),
              ]}
            />
            <DownloadMenu label="Dossier complet" groups={[dossierGroup(projectId)]} />
          </div>
        </Card>
      </div>

      <div className="order-first grid content-start gap-4 xl:order-none">
        <Card className="p-5">
          <CardHeader title="Niveau du dossier" />
          <p className="mt-3 text-base font-semibold text-ink">{s.levelLabel}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-2">{LEVEL_TEXT[s.level]}</p>
          <ol className="mt-4 grid gap-2.5">
            {DOSSIER_LEVELS.map((level, i) => {
              const reached = i <= rank;
              const criterion = s.criteria.find((c) => c.level === level);
              const next = i === rank + 1;
              return (
                <li key={level} className={cn("flex gap-2.5 rounded-xl p-2.5", level === s.level && "bg-accent-soft")}>
                  {reached ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /> : <CircleDashed className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden="true" />}
                  <div className="min-w-0">
                    <p className={cn("text-xs font-semibold", reached ? "text-ink" : "text-ink-3")}>{DOSSIER_LEVEL_LABELS[level]}</p>
                    {criterion ? <p className="text-2xs text-ink-3">{criterion.label}</p> : null}
                    {next && criterion?.detail ? <p className="mt-0.5 text-2xs text-warning">{`Reste à faire : ${criterion.detail}.`}</p> : null}
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-2xs leading-relaxed text-ink-3">
            Les niveaux sont recalculés à chaque ouverture sur l’état réel des documents. Ils ne valent ni certification réglementaire ni validation structurelle.
          </p>
        </Card>

        <ValidationCard projectId={projectId} status={s} cctpId={cctp?.id} dpgfId={dpgf?.id} onDone={refresh} />
      </div>

      <GenerateDialog open={generating} onOpenChange={setGenerating} projectId={projectId} lots={lots} plans={d.plans} onStarted={refresh} />
    </div>
  );
}

/** Déclaration de validation professionnelle, accessible au niveau « prêt pour validation professionnelle ». */
function ValidationCard({ projectId, status, cctpId, dpgfId, onDone }: { projectId: string; status: DossierData["status"]; cctpId?: string; dpgfId?: string; onDone: () => void }) {
  const [values, setValues] = useState({ signedBy: "", qualification: "" });
  const [statement, setStatement] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const ready = status.criteria.slice(0, 3).every((c) => c.met);
  const documentsValidated = status.documents.length > 0 && status.documents.every((d) => d.status === "valide");
  const sign = useMutation({
    mutationFn: () => api(`/projects/${projectId}/dossier/validate`, { body: { ...values, statement } }),
    onSuccess: () => {
      onDone();
      setStatement(false);
      toast.success("Dossier validé : la déclaration est enregistrée avec les versions des documents.");
    },
    onError: (e) => (e instanceof ApiError && Object.keys(e.fields).length ? setErrors(e.fields) : toast.error(errorMessage(e))),
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!values.signedBy.trim()) next.signedBy = "Champ obligatoire.";
    if (!values.qualification.trim()) next.qualification = "Champ obligatoire.";
    if (!statement) next.statement = "Cochez la déclaration pour valider le dossier.";
    setErrors(next);
    if (Object.keys(next).length === 0) sign.mutate();
  }
  return (
    <Card className="p-5">
      <CardHeader title="Validation professionnelle" />
      {status.validation?.current ? (
        <div className="mt-3 flex gap-2.5 rounded-xl border border-success/25 bg-success-soft p-3 text-xs leading-relaxed text-ink-2">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          <p>{`Validé par ${status.validation.signedBy}, ${status.validation.qualification}, le ${formatDateTime(status.validation.createdAt)}.`}</p>
        </div>
      ) : !ready ? (
        <p className="mt-3 text-xs leading-relaxed text-ink-3">
          {status.validation ? "La dernière déclaration ne vaut plus : le dossier a changé depuis. " : ""}La déclaration s’ouvre quand le dossier est prêt pour la validation professionnelle.
        </p>
      ) : !documentsValidated ? (
        <div className="mt-3 grid gap-2 text-xs leading-relaxed text-ink-2">
          <p>Validez d’abord le CCTP et la DPGF : la déclaration porte sur leurs versions validées.</p>
          <div className="flex flex-wrap gap-2">
            {cctpId ? (
              <Link to={`?onglet=cctp&document=${cctpId}`} className="font-semibold text-accent hover:underline">
                Ouvrir le CCTP
              </Link>
            ) : null}
            {dpgfId ? (
              <Link to={`?onglet=dpgf&dpgf=${dpgfId}`} className="font-semibold text-accent hover:underline">
                Ouvrir la DPGF
              </Link>
            ) : null}
          </div>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="mt-3 grid gap-3">
          <Field label="Nom du signataire" value={values.signedBy} onChange={(e) => setValues((v) => ({ ...v, signedBy: e.target.value }))} error={errors.signedBy} />
          <Field label="Qualité" value={values.qualification} onChange={(e) => setValues((v) => ({ ...v, qualification: e.target.value }))} error={errors.qualification} placeholder="Économiste de la construction" />
          <Checkbox
            label="Je déclare avoir vérifié le dossier et valider le CCTP et la DPGF dans leurs versions validées. Cette déclaration m’engage ; la plateforme ne certifie ni ma qualification ni la conformité réglementaire du dossier."
            checked={statement}
            onChange={setStatement}
          />
          {errors.statement ? <p className="text-2xs text-danger">{errors.statement}</p> : null}
          <Button type="submit" icon={<PenLine className="size-4" />} loading={sign.isPending}>
            Signer la déclaration
          </Button>
        </form>
      )}
    </Card>
  );
}

/** Options de la génération du dossier et accord d'envoi des données à l'API OpenAI. */
function GenerateDialog({ open, onOpenChange, projectId, lots, plans, onStarted }: { open: boolean; onOpenChange: (open: boolean) => void; projectId: string; lots: Lot[]; plans: DossierData["plans"]; onStarted: () => void }) {
  const status = useAgentStatus();
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [lotId, setLotId] = useState("");
  const [level, setLevel] = useState<(typeof CCTP_LEVELS)[number]>("standard");
  const [vatRate, setVatRate] = useState("");
  const [withSousDetails, setWithSousDetails] = useState(true);
  const [instructions, setInstructions] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const project = useQuery({ queryKey: ["project", projectId], queryFn: ({ signal }) => api<{ project: { country: "MA" | "FR" } }>(`/projects/${projectId}`, { signal }), enabled: open });
  const references = useQuery({ queryKey: ["references", { scope: "", q: "" }], queryFn: ({ signal }) => api<{ items: TechnicalReference[] }>("/references", { signal }), enabled: open });
  const country = project.data?.project.country;
  // Références du pays de l'affaire et internationales, non rejetées : les seules citables par le CCTP.
  const selected = useMemo(() => (references.data?.items ?? []).filter((r) => r.verificationStatus !== "rejete" && (r.scope === country || r.scope === "INT")), [references.data, country]);
  useEffect(() => {
    if (!open) return;
    setFileIds(plans.map((p) => p.id));
    setLotId(lots.find((l) => l.tradeFamily === "gros_oeuvre")?.id ?? lots[0]?.id ?? "");
    setConsent(false);
    setError(null);
  }, [open, plans, lots]);
  const s = status.data;
  const blocked = s ? !s.simulation && (!s.openaiKey || !s.generationModel || (fileIds.length > 0 && !s.extractionModel)) : true;
  const launch = useMutation({
    mutationFn: () =>
      api(`/projects/${projectId}/dossier/generate`, {
        body: { fileIds, lotId: lotId || null, detailLevel: level, referenceIds: selected.map((r) => r.id), vatRate: vatRate || null, instructions: instructions || null, withSousDetails, consent },
      }),
    onSuccess: () => {
      onStarted();
      toast.success("Génération du dossier lancée.");
      onOpenChange(false);
    },
    onError: (e) => setError(e instanceof ApiError && Object.values(e.fields)[0] ? Object.values(e.fields)[0]! : errorMessage(e)),
  });
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Générer le dossier"
      description="Les agents enchaînent la lecture des plans, le métré, le CCTP, la DPGF et les sous-détails, puis le contrôle indépendant. Rien n’est inventé : ce qui manque est signalé, et chaque document reste à vérifier."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={launch.isPending} disabled={blocked || !consent} onClick={() => launch.mutate()}>
            Générer le dossier
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
              {!s.generationModel || !s.extractionModel ? "Les modèles ne sont pas tous choisis. " : ""}
              <Link to="/administration/parametres?onglet=ia" className="font-semibold text-accent hover:underline">
                Ouvrir les paramètres IA
              </Link>
            </p>
          </div>
        ) : null}
        {error ? <InlineError>{error}</InlineError> : null}
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-xs font-semibold text-ink-2">Plans à lire</legend>
          {plans.length === 0 ? (
            <p className="rounded-xl border border-line p-3 text-xs leading-relaxed text-ink-3">Aucun plan vérifié dans l’onglet Documents : le dossier sera établi à partir du métré existant et de la description de l’affaire.</p>
          ) : (
            plans.map((p) => (
              <Checkbox
                key={p.id}
                label={`${p.name}${p.pageCount ? `, ${p.pageCount} page${p.pageCount > 1 ? "s" : ""}` : ""}`}
                checked={fileIds.includes(p.id)}
                onChange={(v) => setFileIds((list) => (v ? [...list, p.id] : list.filter((x) => x !== p.id)))}
              />
            ))
          )}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Lot" optional placeholder="Sans lot" options={lots.map((l) => ({ value: l.id, label: `${l.code} ${l.name}` }))} value={lotId} onChange={(e) => setLotId(e.target.value)} />
          <Field label="Taux de TVA de la DPGF, en %" optional inputMode="decimal" value={vatRate} onChange={(e) => setVatRate(e.target.value)} hint="Saisi par vous, jamais supposé." />
          <div className="grid content-start gap-1.5 sm:col-span-2">
            <span className="text-xs font-semibold text-ink-2">Niveau de détail du CCTP</span>
            <Segmented value={level} onChange={setLevel} options={CCTP_LEVELS.map((l) => ({ value: l, label: CCTP_LEVEL_LABELS[l] }))} label="Niveau de détail du CCTP" />
          </div>
        </div>
        <p className="text-2xs leading-relaxed text-ink-3">
          {references.isPending
            ? "Références en cours de chargement."
            : `${selected.length} référence(s) du référentiel citables par le CCTP : ${country ? REFERENCE_SCOPE_LABELS[country] : "pays de l’affaire"} et international, hors références rejetées.`}
        </p>
        <Checkbox label="Établir les sous-détails de prix avec la bibliothèque, si elle contient des prix pour ce pays" checked={withSousDetails} onChange={setWithSousDetails} />
        <TextareaField label="Consignes particulières" optional rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Variantes, exclusions, prescriptions du maître d’ouvrage…" />
        <Checkbox
          label="J’accepte que les pages des plans choisis, le métré, le CCTP, les postes de la DPGF et les prix candidats soient transmis à l’API OpenAI pour la génération."
          checked={consent}
          onChange={setConsent}
        />
      </div>
    </Modal>
  );
}
