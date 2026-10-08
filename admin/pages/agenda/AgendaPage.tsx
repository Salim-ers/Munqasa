import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CalendarCheck, CalendarPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { PageHeader } from "../../components/ui/PageHeader";
import { Segmented } from "../../components/ui/Segmented";
import { api, query } from "../../lib/api";
import { useListParams } from "../../lib/list-params";
import type { Deadline } from "../../lib/types";
import type { ProjectStatus } from "../../../shared/enums";
import { DeadlineFormDialog } from "./DeadlineFormDialog";
import { DeadlineRow, SubmissionRow } from "./DeadlineRow";

interface Submission {
  id: string;
  reference: string;
  name: string;
  dueAt: string;
  status: ProjectStatus;
}

const DAY = 86_400_000;
const RANGES = { "30": 30, "90": 90, "365": 365 } as const;
type Range = keyof typeof RANGES;

type Entry = { kind: "deadline"; dueAt: string; deadline: Deadline } | { kind: "submission"; dueAt: string; submission: Submission };

const weekFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

/** Lundi de la semaine d'une date (heure locale). */
function weekStart(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function weekLabel(start: Date, now: Date): string {
  const current = weekStart(now).getTime();
  if (start.getTime() === current) return "Cette semaine";
  if (start.getTime() === current + 7 * DAY) return "Semaine prochaine";
  return `Semaine du ${weekFmt.format(start)}`;
}

export function AgendaPage() {
  const list = useListParams({ id: "date", desc: false });
  const range: Range = (list.get("horizon") as Range) in RANGES ? (list.get("horizon") as Range) : "90";
  const showDone = list.get("faites") === "1";
  const [editing, setEditing] = useState<Deadline | null | undefined>(undefined);

  // Bornes arrondies à la minute : la clé de cache reste stable d'un rendu à l'autre.
  const [from, to] = useMemo(() => {
    const now = Math.floor(Date.now() / 60_000) * 60_000;
    return [new Date(now - 30 * DAY).toISOString(), new Date(now + RANGES[range] * DAY).toISOString()];
  }, [range]);

  const agenda = useQuery({
    queryKey: ["deadlines", { from, to, showDone }],
    queryFn: ({ signal }) => api<{ items: Deadline[]; submissions: Submission[] }>(`/deadlines${query({ du: from, au: to, faites: showDone })}`, { signal }),
    placeholderData: keepPreviousData,
  });

  const now = new Date();
  const { overdue, groups } = useMemo(() => {
    const entries: Entry[] = [
      ...(agenda.data?.items ?? []).map((d) => ({ kind: "deadline" as const, dueAt: d.dueAt, deadline: d })),
      ...(agenda.data?.submissions ?? []).map((s) => ({ kind: "submission" as const, dueAt: s.dueAt, submission: s })),
    ].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    const nowMs = Date.now();
    const late = entries.filter((e) => e.kind === "deadline" && !e.deadline.doneAt && new Date(e.dueAt).getTime() < nowMs);
    const upcoming = entries.filter((e) => !late.includes(e) && (new Date(e.dueAt).getTime() >= nowMs - DAY || (e.kind === "deadline" && e.deadline.doneAt)));
    const byWeek = new Map<number, Entry[]>();
    for (const e of upcoming) {
      const key = weekStart(new Date(e.dueAt)).getTime();
      byWeek.set(key, [...(byWeek.get(key) ?? []), e]);
    }
    return { overdue: late, groups: [...byWeek.entries()].sort((a, b) => a[0] - b[0]) };
  }, [agenda.data]);

  const renderEntry = (e: Entry) =>
    e.kind === "deadline" ? (
      <DeadlineRow key={`d-${e.deadline.id}`} deadline={e.deadline} onEdit={() => setEditing(e.deadline)} />
    ) : (
      <SubmissionRow key={`s-${e.submission.id}`} item={e.submission} />
    );

  const empty = !agenda.isPending && overdue.length === 0 && groups.length === 0;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Agenda"
        description="Dates de remise des affaires en cours et échéances du dossier : visites, questions, jalons internes."
        actions={
          <Button icon={<CalendarPlus className="size-4" aria-hidden="true" />} onClick={() => setEditing(null)}>
            Nouvelle échéance
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={range}
          onChange={(v) => list.set({ horizon: v === "90" ? null : v })}
          options={[
            { value: "30", label: "30 jours" },
            { value: "90", label: "3 mois" },
            { value: "365", label: "12 mois" },
          ]}
          label="Horizon"
        />
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-ink-2">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={showDone} onChange={(e) => list.set({ faites: e.target.checked ? "1" : null })} />
          Afficher les échéances faites
        </label>
      </div>

      {agenda.isPending ? (
        <Card className="grid gap-2 p-5">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </Card>
      ) : empty ? (
        <Card>
          <EmptyState
            icon={<CalendarCheck className="size-5" />}
            title="Rien de prévu sur la période"
            text="Les dates de remise des affaires en cours et vos échéances apparaîtront ici."
            action={
              <Button size="sm" onClick={() => setEditing(null)}>
                Ajouter une échéance
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4">
          {overdue.length ? (
            <Card className="overflow-hidden border-danger/25">
              <h2 className="px-5 pt-4 pb-2 text-2xs font-semibold tracking-wide text-danger uppercase">En retard</h2>
              <ul className="divide-y divide-line">{overdue.map(renderEntry)}</ul>
            </Card>
          ) : null}
          {groups.map(([start, entries]) => (
            <Card key={start} className="overflow-hidden">
              <h2 className="px-5 pt-4 pb-2 text-2xs font-semibold tracking-wide text-ink-3 uppercase">{weekLabel(new Date(start), now)}</h2>
              <ul className="divide-y divide-line">{entries.map(renderEntry)}</ul>
            </Card>
          ))}
        </div>
      )}
      <DeadlineFormDialog open={editing !== undefined} onOpenChange={(open) => !open && setEditing(undefined)} deadline={editing} />
    </div>
  );
}
