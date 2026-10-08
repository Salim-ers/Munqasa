import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { CircleCheck, CircleDashed, CircleX, Clock, Cpu, Database, Download, HardDrive, KeyRound, PlugZap, ScrollText } from "lucide-react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardHeader } from "../components/ui/Card";
import { EmptyState, Skeleton } from "../components/ui/Feedback";
import { PageHeader } from "../components/ui/PageHeader";
import { Segmented } from "../components/ui/Segmented";
import { TabPanel, Tabs } from "../components/ui/Tabs";
import { api, errorMessage, query } from "../lib/api";
import { actionLabel, describeDetails } from "../lib/audit";
import { cn } from "../lib/cn";
import { formatDateTime, formatIp, formatNumber } from "../lib/format";
import type { AuditEntry, SystemStatus } from "../lib/types";

const TABS = ["connexions", "sauvegarde", "journal"] as const;
type Tab = (typeof TABS)[number];

export function SystemPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get("onglet") ?? "") ? (params.get("onglet") as Tab) : "connexions";
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Système" description="État des services, sauvegarde des données et journal des actions." />
      <Tabs
        value={tab}
        onValueChange={(v) => setParams(v === "connexions" ? {} : { onglet: v }, { replace: true })}
        items={[
          { value: "connexions", label: "Connexions" },
          { value: "sauvegarde", label: "Sauvegarde" },
          { value: "journal", label: "Journal" },
        ]}
      >
        <TabPanel value="connexions">
          <ConnectionsTab />
        </TabPanel>
        <TabPanel value="sauvegarde">
          <BackupTab />
        </TabPanel>
        <TabPanel value="journal">
          <JournalTab />
        </TabPanel>
      </Tabs>
    </div>
  );
}

type TestResult = { ok: true; ms: number; detail?: string } | { ok: false; ms: number; error: string };

function ServiceRow({ icon, label, state, detail, result }: { icon: ReactNode; label: string; state: "ok" | "warning" | "missing"; detail: string; result?: TestResult }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-2 [&_svg]:size-4">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-ink">{label}</p>
        <p className="text-2xs text-ink-3">{detail}</p>
      </div>
      {result ? (
        <span className={cn("flex items-center gap-1.5 text-xs font-medium", result.ok ? "text-success" : "text-danger")}>
          {result.ok ? <CircleCheck className="size-4" aria-hidden="true" /> : <CircleX className="size-4" aria-hidden="true" />}
          {result.ok ? `${result.detail ?? "Joignable"}, ${formatNumber(result.ms)} ms` : result.error}
        </span>
      ) : (
        <Badge tone={state === "ok" ? "success" : state === "warning" ? "warning" : "danger"} dot>
          {state === "ok" ? "Configuré" : state === "warning" ? "Développement" : "À configurer"}
        </Badge>
      )}
    </li>
  );
}

function ConnectionsTab() {
  const status = useQuery({ queryKey: ["system-status"], queryFn: ({ signal }) => api<SystemStatus>("/system/status", { signal }) });
  const test = useMutation({ mutationFn: () => api<{ database: TestResult; storage: TestResult; openai: TestResult }>("/system/connections/test", { body: {} }) });
  const s = status.data;
  const prod = s?.environment === "production";
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      {s?.adminPassword ? (
        <div role="alert" className="flex gap-3 rounded-card border border-warning/25 bg-warning-soft p-4 text-xs leading-relaxed text-ink-2 lg:col-span-2">
          <KeyRound className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <p>
            La variable <code className="rounded bg-surface px-1 py-0.5 text-2xs">ADMIN_PASSWORD</code> est encore définie sur Vercel. Elle ne sert qu’à créer le compte : supprimez-la
            dans <em>Settings</em> &gt; <em>Environment Variables</em>, votre mot de passe reste inchangé.
          </p>
        </div>
      ) : null}
      <Card className="overflow-hidden">
        <div className="p-5 pb-3">
          <CardHeader
            title="Services"
            subtitle={s ? (prod ? "Environnement de production" : "Environnement de développement") : undefined}
            action={
              <Button size="sm" variant="secondary" icon={<PlugZap className="size-3.5" />} loading={test.isPending} onClick={() => test.mutate()}>
                Tester les connexions
              </Button>
            }
          />
        </div>
        {!s ? (
          <div className="grid gap-2 px-5 pb-5">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            <ServiceRow icon={<Database />} label="Base de données" state={s.database === "neon" ? "ok" : prod ? "missing" : "warning"} detail={s.database === "neon" ? "Neon PostgreSQL" : "PostgreSQL local (PGlite)"} result={test.data?.database} />
            <ServiceRow
              icon={<HardDrive />}
              label="Stockage des fichiers"
              state={s.storage === "s3" ? "ok" : s.storage === "local" ? "warning" : "missing"}
              detail={s.storage === "s3" ? "Compartiment privé compatible S3" : s.storage === "local" ? "Dossier local .data/storage" : "Variables S3_* absentes"}
              result={test.data?.storage}
            />
            <ServiceRow icon={<Cpu />} label="API OpenAI" state={s.openai ? "ok" : "missing"} detail={s.openai ? "Clé présente côté serveur" : "Variable OPENAI_API_KEY absente"} result={test.data?.openai} />
            <ServiceRow icon={<Clock />} label="Tâche planifiée" state={s.cron ? "ok" : "missing"} detail={s.cron ? "Rappels quotidiens à 6 h (UTC)" : "Variable CRON_SECRET absente"} />
          </ul>
        )}
        {test.error ? <p className="px-5 pb-4 text-xs text-danger">{errorMessage(test.error)}</p> : null}
      </Card>
      <Card className="h-fit p-5">
        <CardHeader title="Configuration" subtitle="Variables d’environnement du projet Vercel" />
        <ul className="mt-4 grid gap-2.5 text-2xs leading-relaxed text-ink-2">
          <EnvItem name="DATABASE_URL" done={s?.database === "neon"} text="Base Neon, ajoutée par l’intégration Vercel." />
          <EnvItem name="S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY" done={s?.storage === "s3"} text="Compartiment privé Cloudflare R2, avec une règle CORS pour ce site." />
          <EnvItem name="OPENAI_API_KEY" done={s?.openai} text="Clé du compte OpenAI, côté serveur uniquement." />
          <EnvItem name="CRON_SECRET" done={s?.cron} text="Secret long et aléatoire : Vercel l’envoie à chaque exécution de la tâche planifiée." />
        </ul>
        <p className="mt-4 text-2xs leading-relaxed text-ink-3">Aucune valeur secrète n’est jamais affichée ici : seulement leur présence.</p>
      </Card>
    </div>
  );
}

function EnvItem({ name, done, text }: { name: string; done: boolean | undefined; text: string }) {
  return (
    <li className="flex gap-2">
      {done ? <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" /> : <CircleDashed className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden="true" />}
      <span>
        <code className="font-semibold break-all text-ink">{name}</code>
        <br />
        {text}
      </span>
    </li>
  );
}

const TABLE_LABELS: Record<string, string> = {
  client: "Clients",
  prospect: "Prospects",
  project: "Affaires",
  project_lot: "Lots",
  deadline: "Échéances",
  source_file: "Fichiers",
  company_profile: "Entités émettrices",
  notification: "Notifications",
  audit_log: "Journal",
  price_item: "Prix",
  quote: "Devis",
  cctp_document: "CCTP",
  dpgf: "DPGF",
  ai_usage_record: "Appels IA",
};

function BackupTab() {
  const stats = useQuery({ queryKey: ["system", "stats"], queryFn: ({ signal }) => api<{ counts: Record<string, number> }>("/system/stats", { signal }) });
  const counts = stats.data?.counts ?? {};
  const shown = Object.keys(TABLE_LABELS).filter((k) => k in counts);
  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <Card className="h-fit p-5">
        <CardHeader title="Exporter les données" subtitle="Toutes les données métier, au format JSON" />
        <p className="mt-3 text-xs leading-relaxed text-ink-2">
          Le fichier contient les clients, affaires, lots, échéances, références des fichiers, réglages et journal. Les données d’authentification (mots de passe, sessions, secrets) n’y figurent jamais. Les fichiers eux-mêmes restent dans le stockage privé.
        </p>
        <a
          href="/api/admin/system/export"
          className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-[0.8125rem] font-semibold text-on-accent hover:brightness-110"
          download
        >
          <Download className="size-4" aria-hidden="true" />
          Télécharger la sauvegarde
        </a>
        <p className="mt-3 text-2xs leading-relaxed text-ink-3">Neon conserve en outre un historique de la base permettant une restauration à un instant donné, selon votre offre.</p>
      </Card>
      <Card className="p-5">
        <CardHeader title="Volumétrie" subtitle="Nombre d’enregistrements par domaine" />
        {stats.isPending ? (
          <Skeleton className="mt-4 h-40" />
        ) : (
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {shown.map((k) => (
              <div key={k} className="rounded-xl border border-line p-3">
                <dt className="text-2xs text-ink-3">{TABLE_LABELS[k]}</dt>
                <dd className="mt-0.5 text-lg font-semibold text-ink tabular">{formatNumber(counts[k] ?? 0)}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>
    </div>
  );
}

const FILTERS = [
  { value: "tout", label: "Tout" },
  { value: "securite", label: "Sécurité" },
  { value: "affaire.", label: "Affaires" },
  { value: "fichier.", label: "Fichiers" },
  { value: "client.", label: "Clients" },
  { value: "reglages.", label: "Réglages" },
  { value: "systeme.", label: "Système" },
] as const;

function JournalTab() {
  const [params, setParams] = useSearchParams();
  const filter = FILTERS.some((f) => f.value === params.get("filtre")) ? (params.get("filtre") as (typeof FILTERS)[number]["value"]) : "tout";
  const journal = useQuery({
    queryKey: ["system", "audit", filter],
    queryFn: ({ signal }) =>
      api<{ entries: AuditEntry[] }>(`/system/audit${query({ limit: 200, filtre: filter === "securite" ? "securite" : null, action: filter !== "tout" && filter !== "securite" ? filter : null })}`, { signal }),
    placeholderData: keepPreviousData,
  });
  const entries = journal.data?.entries ?? [];
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 p-5 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <CardHeader title="Journal" subtitle="Les 200 dernières actions, conservées sans limite de durée." />
        <Segmented
          value={filter}
          onChange={(v) =>
            setParams(
              (prev) => {
                const next = new URLSearchParams(prev);
                if (v === "tout") next.delete("filtre");
                else next.set("filtre", v);
                return next;
              },
              { replace: true },
            )
          }
          options={FILTERS}
          label="Filtrer le journal"
        />
      </div>
      {journal.isPending ? (
        <div className="grid gap-2 px-5 pb-5">
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState icon={<ScrollText className="size-5" />} title="Aucune action" />
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {entries.map((e) => {
            const details = describeDetails(e.details);
            return (
              <li key={e.id} className="grid gap-1 px-5 py-3 sm:grid-cols-[10rem_1fr_auto] sm:items-baseline sm:gap-4">
                <time dateTime={e.occurredAt} className="text-2xs text-ink-3 tabular">
                  {formatDateTime(e.occurredAt)}
                </time>
                <div className="min-w-0">
                  <p className={cn("text-xs font-medium", e.action.endsWith(".echec") || e.action === "acces.refuse" ? "text-danger" : "text-ink")}>{actionLabel(e.action)}</p>
                  {details ? <p className="truncate text-2xs text-ink-3">{details}</p> : null}
                </div>
                <p className="text-2xs text-ink-3">{e.ipAddress ? formatIp(e.ipAddress) : "Serveur"}</p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
