import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BrainCircuit,
  CalendarClock,
  Coins,
  Cpu,
  Database,
  FileText,
  FolderOpen,
  HardDrive,
  Inbox,
  Layers,
  Plus,
  Receipt,
  Table2,
  TriangleAlert,
} from "lucide-react";
import { motion } from "motion/react";
import { type ReactNode, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "../components/ui/Badge";
import { Card, CardHeader } from "../components/ui/Card";
import { AnimatedNumber, EmptyState, Skeleton } from "../components/ui/Feedback";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import type { Country, ProjectStatus } from "../../shared/enums";
import { ProjectStatusBadge } from "../components/StatusBadge";
import { Button } from "../components/ui/Button";
import { COUNTRY_LABELS, type Currency, formatDate, formatMoney, formatNumber, formatRelative } from "../lib/format";
import type { SystemStatus } from "../lib/types";
import { ProjectFormDialog } from "./projects/ProjectFormDialog";

interface DashboardData {
  generatedAt: string;
  projects: {
    open: number;
    activeTenders: number;
    inPreparation: number;
    byStatus: Array<{ status: string; count: number }>;
    byCountry: Array<{ country: Country; count: number }>;
    byTrade: Array<{ trade: string; count: number }>;
    estimates: Array<{ currency: Currency; total: string; projects: number }>;
    needingAttention: Array<{ projectId: string; blockingIssues: number }>;
  };
  documents: {
    cctpGenerating: number;
    dpgfToValidate: number;
    quotesPending: Array<{ currency: Currency; count: number }>;
    quotesByMonth: Array<{ month: string; currency: Currency; count: number }>;
  };
  deadlines: Array<{ kind: "remise" | "jalon"; id: string; title: string; dueAt: string; projectId?: string | null }>;
  alerts: { stalePrices: number; unverifiedPrices: number; stalePriceMonths: number };
  ai: { jobsRunning: number; last30Days: { calls: number; inputTokens: number; outputTokens: number; costUsd: string | null } };
  recentProjects: Array<{
    id: string;
    reference: string;
    name: string;
    status: ProjectStatus;
    country: Country;
    currency: Currency;
    submissionDeadline: string | null;
    updatedAt: string;
    clientName: string | null;
  }>;
}

const appear = (i: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay: 0.04 * i, ease: [0.22, 1, 0.36, 1] as const },
});

export function DashboardPage() {
  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: ({ signal }) => api<DashboardData>("/dashboard", { signal }), refetchInterval: 60_000 });
  const status = useQuery({ queryKey: ["system-status"], queryFn: ({ signal }) => api<SystemStatus>("/system/status", { signal }), staleTime: 5 * 60_000 });
  const d = dashboard.data;
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto max-w-[96rem]">
      <PageHeading generatedAt={d?.generatedAt} onCreate={() => setCreating(true)} />
      <ProjectFormDialog open={creating} onOpenChange={setCreating} onSaved={(p) => navigate(`/administration/affaires/${p.id}`)} />
      {dashboard.isError ? (
        <Card className="p-6">
          <EmptyState icon={<TriangleAlert className="size-5" />} title="Tableau de bord indisponible" text="Les données n’ont pas pu être chargées. Réessayez dans un instant." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-6 xl:grid-cols-12">
          {/* Rangée 1 : indicateurs et carte d'accent */}
          <motion.div {...appear(0)} className="md:col-span-2 xl:col-span-3">
            <KpiCard icon={<FolderOpen />} label="Affaires en cours" value={d?.projects.open} note={d ? `dont ${d.projects.inPreparation} en préparation` : undefined} to="/administration/affaires" />
          </motion.div>
          <motion.div {...appear(1)} className="md:col-span-2 xl:col-span-3">
            <KpiCard icon={<Layers />} label="Appels d’offres actifs" value={d?.projects.activeTenders} note="De l’analyse à la remise" to="/administration/affaires" />
          </motion.div>
          <motion.div {...appear(2)} className="md:col-span-2 xl:col-span-3">
            <KpiCard
              icon={<Receipt />}
              label="Devis en attente"
              value={d ? d.documents.quotesPending.reduce((a, q) => a + q.count, 0) : undefined}
              note={d && d.documents.quotesPending.length ? d.documents.quotesPending.map((q) => `${q.count} en ${q.currency}`).join(", ") : "À vérifier, validés ou envoyés"}
            />
          </motion.div>
          <motion.div {...appear(3)} className="md:col-span-6 xl:col-span-3">
            <AccentCard data={d} loading={dashboard.isPending} />
          </motion.div>

          {/* Rangée 2 : montants, graphique, compteurs */}
          <motion.div {...appear(4)} className="md:col-span-2 xl:col-span-3">
            <EstimatesCard data={d} loading={dashboard.isPending} />
          </motion.div>
          <motion.div {...appear(5)} className="md:col-span-4 xl:col-span-6">
            <QuotesChart data={d} loading={dashboard.isPending} />
          </motion.div>
          <motion.div {...appear(6)} className="grid grid-cols-2 gap-4 md:col-span-6 xl:col-span-3">
            <MiniStat icon={<FileText />} label="CCTP en génération" value={d?.documents.cctpGenerating} />
            <MiniStat icon={<Table2 />} label="DPGF à valider" value={d?.documents.dpgfToValidate} />
            <MiniStat icon={<CalendarClock />} label="Échéances sous 14 jours" value={d?.deadlines.length} to="/administration/agenda" />
            <MiniStat
              icon={<Coins />}
              label="Prix à revoir"
              value={d ? d.alerts.stalePrices + d.alerts.unverifiedPrices : undefined}
              tone={d && d.alerts.stalePrices + d.alerts.unverifiedPrices > 0 ? "warning" : undefined}
            />
          </motion.div>

          {/* Rangée 3 : dernières affaires, Talab Intelligence, consommation */}
          <motion.div {...appear(7)} className="md:col-span-6 xl:col-span-8">
            <RecentProjects data={d} loading={dashboard.isPending} onCreate={() => setCreating(true)} />
          </motion.div>
          <motion.div {...appear(8)} className="grid gap-4 md:col-span-6 md:grid-cols-2 xl:col-span-4 xl:grid-cols-1">
            <IntelligenceCard status={status.data} jobsRunning={d?.ai.jobsRunning} loading={status.isPending} />
            <UsageCard data={d} loading={dashboard.isPending} />
          </motion.div>
        </div>
      )}
    </div>
  );
}

function PageHeading({ generatedAt, onCreate }: { generatedAt?: string; onCreate: () => void }) {
  const today = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-medium text-ink-3 first-letter:uppercase">{today}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">Tableau de bord</h1>
      </div>
      <div className="flex items-center gap-3">
        {generatedAt ? <p className="hidden text-2xs text-ink-3 sm:block">Actualisé {formatRelative(generatedAt)}</p> : null}
        <Button icon={<Plus className="size-4" aria-hidden="true" />} onClick={onCreate}>
          Nouvelle affaire
        </Button>
      </div>
    </div>
  );
}

function IconChip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("grid size-8 place-items-center rounded-lg bg-surface-2 text-ink-2 [&_svg]:size-4 [&_svg]:stroke-[1.75]", className)}>{children}</span>;
}

function KpiCard({ icon, label, value, note, to }: { icon: ReactNode; label: string; value: number | undefined; note?: string; to?: string }) {
  const card = (
    <Card className="group flex h-full min-h-[8.5rem] flex-col justify-between p-5 transition-shadow duration-300 hover:shadow-lift">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold text-ink-2">{label}</p>
        <IconChip>{icon}</IconChip>
      </div>
      <div>
        {value === undefined ? <Skeleton className="h-8 w-16" /> : <AnimatedNumber value={value} className="text-[2rem] leading-none font-semibold tracking-tight text-ink" />}
        {note ? <p className="mt-2 truncate text-2xs text-ink-3">{note}</p> : null}
      </div>
    </Card>
  );
  return to ? (
    <Link to={to} className="block h-full rounded-card focus-visible:outline-offset-4">
      {card}
    </Link>
  ) : (
    card
  );
}

function AccentCard({ data, loading }: { data?: DashboardData; loading: boolean }) {
  const next = data?.deadlines[0];
  const to = next ? (next.kind === "remise" ? `/administration/affaires/${next.id}` : next.projectId ? `/administration/affaires/${next.projectId}?onglet=echeances` : "/administration/agenda") : "/administration/agenda";
  return (
    <Link
      to={to}
      className="relative flex h-full min-h-[8.5rem] flex-col justify-between overflow-hidden rounded-card bg-gradient-to-br from-accent to-accent-2 p-5 text-on-accent shadow-card transition-shadow duration-300 hover:shadow-lift focus-visible:outline-offset-4"
    >
      <svg className="pointer-events-none absolute -right-6 -bottom-10 h-40 w-auto opacity-25" viewBox="0 0 120 160" fill="none" aria-hidden="true">
        <path d="M10 160 V70 Q10 40 40 25 Q60 15 60 0 Q60 15 80 25 Q110 40 110 70 V160" stroke="currentColor" strokeWidth="1.5" />
        <path d="M30 160 V82 Q30 60 50 48 Q60 42 60 32 Q60 42 70 48 Q90 60 90 82 V160" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <div className="relative flex items-center justify-between">
        <p className="text-xs font-semibold opacity-90">Prochaine échéance</p>
        <CalendarClock className="size-4 opacity-80" aria-hidden="true" />
      </div>
      <div className="relative">
        {loading ? (
          <Skeleton className="h-6 w-40 bg-white/25" />
        ) : next ? (
          <>
            <p className="line-clamp-2 text-sm font-semibold">{next.title}</p>
            <p className="mt-1 text-2xs opacity-85">
              {formatDate(next.dueAt)}, {formatRelative(next.dueAt)}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold">Aucune échéance proche</p>
            <p className="mt-1 text-2xs opacity-85">Rien à remettre dans les 14 prochains jours.</p>
          </>
        )}
      </div>
    </Link>
  );
}

function EstimatesCard({ data, loading }: { data?: DashboardData; loading: boolean }) {
  const estimates = data?.projects.estimates ?? [];
  return (
    <Card className="flex h-full min-h-[18rem] flex-col p-5">
      <CardHeader title="Montants estimés" subtitle="Affaires en cours, par devise" />
      {loading ? (
        <div className="mt-6 grid gap-3">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
      ) : estimates.length === 0 ? (
        <EmptyState className="flex-1" icon={<Coins className="size-5" />} title="Aucune estimation" text="Les montants apparaîtront dès qu’une affaire en cours portera une estimation." />
      ) : (
        <ul className="mt-5 grid gap-4">
          {estimates.map((e) => (
            <li key={e.currency}>
              <p className="text-2xl font-semibold tracking-tight text-ink tabular">{formatMoney(e.total, e.currency)}</p>
              <p className="mt-0.5 text-2xs text-ink-3">
                {e.projects} affaire{e.projects > 1 ? "s" : ""} en {e.currency}
              </p>
            </li>
          ))}
          <li className="text-2xs leading-relaxed text-ink-3">Les devises ne sont jamais additionnées entre elles.</li>
        </ul>
      )}
      {data && data.projects.byCountry.length ? (
        <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
          {data.projects.byCountry.map((c) => (
            <Badge key={c.country}>
              {COUNTRY_LABELS[c.country]} : {c.count}
            </Badge>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

/** Série des 12 derniers mois, complétée par des zéros (mois sans devis). */
function monthlySeries(rows: DashboardData["documents"]["quotesByMonth"]) {
  const now = new Date();
  const months: Array<{ key: string; label: string; MAD: number; EUR: number }> = [];
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    months.push({ key, label: new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(date).replace(".", ""), MAD: 0, EUR: 0 });
  }
  for (const r of rows) {
    const m = months.find((x) => x.key === r.month);
    if (m) m[r.currency] += r.count;
  }
  return months;
}

function QuotesChart({ data, loading }: { data?: DashboardData; loading: boolean }) {
  const series = monthlySeries(data?.documents.quotesByMonth ?? []);
  const total = series.reduce((a, m) => a + m.MAD + m.EUR, 0);
  return (
    <Card className="flex h-full min-h-[18rem] flex-col p-5">
      <CardHeader
        title="Évolution des devis"
        subtitle="Devis créés par mois, sur 12 mois"
        action={
          <div className="flex items-center gap-3 text-2xs font-medium text-ink-3">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
              MAD
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-ink-3" aria-hidden="true" />
              EUR
            </span>
          </div>
        }
      />
      <div className="relative mt-4 min-h-[13rem] flex-1">
        {loading ? (
          <Skeleton className="absolute inset-0" />
        ) : (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillMad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--ink-3)", fontSize: 11 }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "var(--ink-3)", fontSize: 11 }} />
                <Tooltip
                  cursor={{ stroke: "var(--line-strong)" }}
                  contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, fontSize: 12, color: "var(--ink)" }}
                  formatter={(value, name) => [`${formatNumber(value as number)} devis`, String(name)]}
                />
                <Area type="monotone" dataKey="MAD" stroke="var(--accent)" strokeWidth={1.75} fill="url(#fillMad)" dot={false} activeDot={{ r: 4 }} />
                <Area type="monotone" dataKey="EUR" stroke="var(--ink-3)" strokeWidth={1.5} fill="transparent" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
            {total === 0 ? (
              <div className="absolute inset-0 grid place-items-center">
                <div className="rounded-xl border border-line bg-surface/90 px-4 py-3 text-center backdrop-blur">
                  <p className="text-xs font-semibold text-ink">Aucun devis sur 12 mois</p>
                  <p className="mt-0.5 text-2xs text-ink-3">La courbe se tracera avec vos premiers devis.</p>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}

function MiniStat({ icon, label, value, tone, to }: { icon: ReactNode; label: string; value: number | undefined; tone?: "warning"; to?: string }) {
  const card = (
    <Card className={cn("flex h-full min-h-[8.5rem] flex-col justify-between p-4", to && "transition-shadow duration-300 hover:shadow-lift")}>
      <IconChip className={tone === "warning" ? "bg-warning-soft text-warning" : undefined}>{icon}</IconChip>
      <div>
        {value === undefined ? <Skeleton className="h-6 w-10" /> : <AnimatedNumber value={value} className="text-2xl leading-none font-semibold text-ink" />}
        <p className="mt-1.5 text-2xs leading-snug text-ink-3">{label}</p>
      </div>
    </Card>
  );
  return to ? (
    <Link to={to} className="block h-full rounded-card focus-visible:outline-offset-4">
      {card}
    </Link>
  ) : (
    card
  );
}

function RecentProjects({ data, loading, onCreate }: { data?: DashboardData; loading: boolean; onCreate: () => void }) {
  const rows = data?.recentProjects ?? [];
  const navigate = useNavigate();
  return (
    <Card className="flex h-full min-h-[20rem] flex-col overflow-hidden">
      <div className="p-5 pb-3">
        <CardHeader
          title="Dernières affaires"
          subtitle="Ouvertes ou modifiées récemment"
          action={
            rows.length ? (
              <Link to="/administration/affaires" className="text-2xs font-semibold text-accent hover:underline">
                Toutes les affaires
              </Link>
            ) : null
          }
        />
      </div>
      {loading ? (
        <div className="grid gap-2 px-5 pb-5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          className="flex-1"
          icon={<Inbox className="size-5" />}
          title="Aucune affaire pour l’instant"
          text="Vos affaires apparaîtront ici, avec leur statut et leur échéance."
          action={
            <Button size="sm" onClick={onCreate}>
              Créer une affaire
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-xs">
            <thead>
              <tr className="border-y border-line text-2xs font-semibold tracking-wide text-ink-3 uppercase">
                <th className="px-5 py-2.5 font-semibold">Affaire</th>
                <th className="px-3 py-2.5 font-semibold">Client</th>
                <th className="px-3 py-2.5 font-semibold">Statut</th>
                <th className="px-3 py-2.5 font-semibold">Pays</th>
                <th className="px-5 py-2.5 text-right font-semibold">Échéance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr
                  key={p.id}
                  onClick={(e) => !(e.target as HTMLElement).closest("a") && navigate(`/administration/affaires/${p.id}`)}
                  className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2"
                >
                  <td className="px-5 py-3">
                    <Link to={`/administration/affaires/${p.id}`} className="font-semibold text-ink hover:text-accent">
                      {p.name}
                    </Link>
                    <p className="text-2xs text-ink-3 tabular">{p.reference}</p>
                  </td>
                  <td className="px-3 py-3 text-ink-2">{p.clientName}</td>
                  <td className="px-3 py-3">
                    <ProjectStatusBadge status={p.status} />
                  </td>
                  <td className="px-3 py-3 text-ink-2">{COUNTRY_LABELS[p.country]}</td>
                  <td className="px-5 py-3 text-right text-ink-2 tabular">{formatDate(p.submissionDeadline)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function StatusRow({ icon, label, value, ok }: { icon: ReactNode; label: string; value: string; ok: boolean }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="grid size-7 place-items-center rounded-lg bg-white/[0.07] text-premium-ink/70 [&_svg]:size-3.5">{icon}</span>
      <span className="text-xs text-premium-ink/70">{label}</span>
      <span className={cn("ml-auto flex items-center gap-1.5 text-xs font-semibold", ok ? "text-premium-ink" : "text-premium-accent")}>
        <span className={cn("size-1.5 rounded-full", ok ? "bg-emerald-400" : "bg-premium-accent")} aria-hidden="true" />
        {value}
      </span>
    </li>
  );
}

function IntelligenceCard({ status, jobsRunning, loading }: { status?: SystemStatus; jobsRunning?: number; loading: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-card bg-premium p-5 text-premium-ink shadow-card">
      <div className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-premium-accent/20 blur-3xl" aria-hidden="true" />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-2xs font-semibold tracking-[0.18em] text-premium-accent uppercase">Talab Intelligence</p>
          <p className="mt-2 font-serif text-[1.65rem] leading-tight">État du système</p>
        </div>
        <span className="grid size-9 place-items-center rounded-xl bg-white/[0.08]">
          <BrainCircuit className="size-[1.125rem] text-premium-accent" strokeWidth={1.75} aria-hidden="true" />
        </span>
      </div>
      {loading || !status ? (
        <div className="relative mt-5 grid gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-7 bg-white/10" />
          ))}
        </div>
      ) : (
        <ul className="relative mt-3 divide-y divide-white/[0.07]">
          <StatusRow icon={<Cpu />} label="API OpenAI" value={status.openai ? "Connectée" : "Clé à configurer"} ok={status.openai} />
          <StatusRow icon={<Database />} label="Base de données" value={status.database === "neon" ? "Neon" : "Locale (développement)"} ok={status.database === "neon" || status.environment !== "production"} />
          <StatusRow icon={<HardDrive />} label="Stockage des fichiers" value={status.storage === "s3" ? "Compartiment privé" : status.storage === "local" ? "Local (développement)" : "À configurer"} ok={status.storage !== "absent"} />
          <StatusRow icon={<Activity />} label="Traitements en cours" value={jobsRunning === undefined ? "" : String(jobsRunning)} ok />
        </ul>
      )}
    </div>
  );
}

function UsageCard({ data, loading }: { data?: DashboardData; loading: boolean }) {
  const usage = data?.ai.last30Days;
  return (
    <Card className="p-5">
      <CardHeader title="Consommation IA" subtitle="30 derniers jours" />
      {loading || !usage ? (
        <Skeleton className="mt-4 h-14" />
      ) : usage.calls === 0 ? (
        <p className="mt-4 text-xs leading-relaxed text-ink-3">Aucun appel à l’API OpenAI sur la période.</p>
      ) : (
        <dl className="mt-4 grid grid-cols-3 gap-3">
          <div>
            <dt className="text-2xs text-ink-3">Appels</dt>
            <dd className="mt-0.5 text-lg font-semibold text-ink tabular">{formatNumber(usage.calls)}</dd>
          </div>
          <div>
            <dt className="text-2xs text-ink-3">Jetons</dt>
            <dd className="mt-0.5 text-lg font-semibold text-ink tabular">{formatNumber(usage.inputTokens + usage.outputTokens)}</dd>
          </div>
          <div>
            <dt className="text-2xs text-ink-3">Coût estimé</dt>
            <dd className="mt-0.5 text-lg font-semibold text-ink tabular">{usage.costUsd ? `${formatNumber(usage.costUsd)} $` : <span className="text-xs font-medium text-ink-3">Barème non saisi</span>}</dd>
          </div>
        </dl>
      )}
    </Card>
  );
}
