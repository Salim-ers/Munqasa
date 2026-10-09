import { CircleCheck, CircleDashed, PenLine, ScanLine, Sparkles, TableProperties } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import { JobProgress } from "../../components/JobProgress";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader } from "../../components/ui/Card";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { PageHeader } from "../../components/ui/PageHeader";
import { formatNumber } from "../../lib/format";
import { useAgentStatus, useJobs } from "../../lib/jobs";
import { CctpLaunchDialog } from "../cctp/CctpLaunchDialog";
import { DpgfLaunchDialog } from "../dpgf/DpgfLaunchDialog";
import { PlanAnalysisDialog } from "./PlanAnalysisDialog";

function Requirement({ ok, label, detail }: { ok: boolean; label: string; detail: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      {ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /> : <CircleDashed className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden="true" />}
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink">{label}</p>
        <p className="text-2xs leading-relaxed text-ink-3">{detail}</p>
      </div>
    </li>
  );
}

function AgentCard({ icon, title, text, input, output, action }: { icon: ReactNode; title: string; text: string; input: string; output: string; action: ReactNode }) {
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent [&_svg]:size-5">{icon}</span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-2">{text}</p>
        </div>
      </div>
      <dl className="mt-4 grid gap-2 rounded-xl bg-surface-2 p-3 text-2xs">
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 font-semibold text-ink-3 uppercase">Entrée</dt>
          <dd className="text-ink-2">{input}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 font-semibold text-ink-3 uppercase">Résultat</dt>
          <dd className="text-ink-2">{output}</dd>
        </div>
      </dl>
      <div className="mt-auto pt-4">{action}</div>
    </Card>
  );
}

export function AgentsPage() {
  const status = useAgentStatus();
  const jobs = useJobs();
  const [planOpen, setPlanOpen] = useState(false);
  const [cctpOpen, setCctpOpen] = useState(false);
  const [dpgfOpen, setDpgfOpen] = useState(false);
  const s = status.data;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Agents IA" description="Chaque agent travaille sur une affaire, à partir de vos documents. Ses résultats restent des propositions à vérifier et à valider : rien n’est inventé, rien n’est définitif sans vous." />

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="grid content-start gap-4 md:grid-cols-2">
          <AgentCard
            icon={<ScanLine />}
            title="Lecture des plans et métré"
            text="Lit chaque page de vos plans, relève les éléments de gros œuvre et leurs cotes lisibles, puis établit les ouvrages et leurs métrés."
            input="Plans PDF ou images déposés dans l’affaire"
            output="Ouvrages et métrés à vérifier, avec la formule et la source de chaque cote"
            action={
              <Button icon={<Sparkles className="size-4" />} onClick={() => setPlanOpen(true)}>
                Lancer la lecture
              </Button>
            }
          />
          <AgentCard
            icon={<PenLine />}
            title="Rédaction du CCTP"
            text="Établit le plan du CCTP du lot, puis rédige chaque chapitre. Ne cite que les références cochées de votre référentiel et signale ce qui reste à préciser."
            input="Affaire, lot, métré et références choisies"
            output="CCTP article par article, contrôlé, versionné, exportable en Word"
            action={
              <Button icon={<Sparkles className="size-4" />} onClick={() => setCctpOpen(true)}>
                Rédiger un CCTP
              </Button>
            }
          />
          <AgentCard
            icon={<TableProperties />}
            title="DPGF depuis le CCTP"
            text="Établit les postes de la DPGF à partir de chaque chapitre du CCTP. Les quantités viennent du métré ; ce qui n’est pas métré reste à métrer."
            input="CCTP de l’affaire et métré du lot"
            output="DPGF modifiable, contrôlée, versionnée, exportable en Excel avec formules"
            action={
              <Button icon={<Sparkles className="size-4" />} onClick={() => setDpgfOpen(true)}>
                Établir une DPGF
              </Button>
            }
          />
          <Card className="flex flex-col justify-center p-5">
            <p className="text-xs font-semibold text-ink">Prochain agent</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-3">Sous-détails de prix à partir de la DPGF et de votre bibliothèque de prix.</p>
          </Card>
        </div>

        <Card className="h-fit p-5">
          <CardHeader title="Prérequis" subtitle="Vérifiés à chaque lancement" />
          {!s ? (
            <Skeleton className="mt-4 h-32" />
          ) : (
            <ul className="mt-4 grid gap-3">
              {s.simulation ? <Requirement ok label="Mode simulation" detail="Réponses simulées, sans appel à OpenAI (développement local)." /> : null}
              <Requirement ok={s.openaiKey || s.simulation} label="Clé OpenAI" detail={s.openaiKey ? "Présente sur le serveur." : "Variable OPENAI_API_KEY à ajouter sur Vercel."} />
              <Requirement
                ok={Boolean(s.generationModel) || s.simulation}
                label="Modèles"
                detail={
                  s.generationModel ? (
                    `${s.generationModel} pour la rédaction, ${s.extractionModel} pour la lecture des plans.`
                  ) : (
                    <Link to="/administration/parametres?onglet=ia" className="font-semibold text-accent hover:underline">
                      Choisir les modèles
                    </Link>
                  )
                }
              />
              <Requirement ok={s.storage} label="Stockage des plans" detail={s.storage ? "Disponible." : "Compartiment R2 à configurer (variables S3_*) pour déposer des plans."} />
              <Requirement ok label="Dépense du mois" detail={`${formatNumber(s.monthUsd)} $${s.budgetUsd ? ` sur un plafond de ${formatNumber(s.budgetUsd)} $` : ", sans plafond"}`} />
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <CardHeader title="Traitements récents" subtitle="Progression en direct, étape par étape" />
        {jobs.isPending ? (
          <Skeleton className="mt-4 h-24" />
        ) : !jobs.data?.items.length ? (
          <EmptyState icon={<Sparkles className="size-5" />} title="Aucun traitement" text="Les traitements lancés apparaîtront ici avec leur avancement." />
        ) : (
          <div className="mt-4 grid gap-3">
            {jobs.data.items.map((job) => (
              <JobProgress key={job.id} job={job} showProject />
            ))}
          </div>
        )}
      </Card>

      <PlanAnalysisDialog open={planOpen} onOpenChange={setPlanOpen} />
      <CctpLaunchDialog open={cctpOpen} onOpenChange={setCctpOpen} />
      <DpgfLaunchDialog open={dpgfOpen} onOpenChange={setDpgfOpen} />
    </div>
  );
}
