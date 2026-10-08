/**
 * Notifications. Les rappels d'échéance sont créés par la tâche planifiée quotidienne, une seule fois
 * par échéance et par palier (J-7, J-3, J-1, jour même), d'après les seuils des réglages d'alerte.
 * Les jours restants sont comptés en jours calendaires, à l'heure du pays de l'affaire.
 */
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import type { Country, NotificationKind } from "../../shared/enums.js";
import { type Database, schema } from "../db/index.js";
import { readSetting } from "./settings.js";

export async function notify(
  db: Database,
  n: { kind: NotificationKind; title: string; body?: string | null; projectId?: string | null; link?: string | null; dedupeKey?: string | null },
): Promise<boolean> {
  const rows = await db
    .insert(schema.notification)
    .values({ kind: n.kind, title: n.title, body: n.body ?? null, projectId: n.projectId ?? null, link: n.link ?? null, dedupeKey: n.dedupeKey ?? null })
    .onConflictDoNothing({ target: schema.notification.dedupeKey })
    .returning({ id: schema.notification.id });
  return rows.length > 0;
}

const DAY = 24 * 3600 * 1000;

/** Fuseau de référence d'une affaire ; sans affaire, celui de Paris. */
const TIME_ZONES: Record<Country, { zone: string; label: string }> = {
  MA: { zone: "Africa/Casablanca", label: "heure du Maroc" },
  FR: { zone: "Europe/Paris", label: "heure de Paris" },
};

/** Numéro du jour calendaire d'un instant dans un fuseau donné. */
function calendarDay(date: Date, timeZone: string): number {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date).split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!) / DAY;
}

function dayLabel(days: number): string {
  return days === 0 ? "aujourd’hui" : days === 1 ? "demain" : `dans ${days} jours`;
}

/** Crée les rappels dus ; renvoie le nombre de notifications créées. */
export async function generateDeadlineReminders(db: Database, now = new Date()): Promise<number> {
  const { deadlineReminderDays } = await readSetting("alertes");
  const ascending = [...new Set([...deadlineReminderDays, 0])].sort((a, b) => a - b);
  const horizon = new Date(now.getTime() + (Math.max(...ascending) + 1) * DAY);
  const open = ["brouillon", "analyse", "etude_technique", "chiffrage", "controle_qualite", "pret_a_remettre"] as const;
  const [deadlines, submissions] = await Promise.all([
    db
      .select({ id: schema.deadline.id, title: schema.deadline.title, dueAt: schema.deadline.dueAt, projectId: schema.deadline.projectId, country: schema.project.country })
      .from(schema.deadline)
      .leftJoin(schema.project, eq(schema.project.id, schema.deadline.projectId))
      .where(and(isNull(schema.deadline.doneAt), gte(schema.deadline.dueAt, now), lte(schema.deadline.dueAt, horizon))),
    db
      .select({ id: schema.project.id, reference: schema.project.reference, name: schema.project.name, dueAt: schema.project.submissionDeadline, country: schema.project.country })
      .from(schema.project)
      .where(and(gte(schema.project.submissionDeadline, now), lte(schema.project.submissionDeadline, horizon), inArray(schema.project.status, [...open]))),
  ]);
  const targets = [
    ...deadlines.map((d) => ({
      key: `echeance:${d.id}`,
      title: d.title,
      dueAt: d.dueAt,
      country: d.country,
      projectId: d.projectId,
      link: d.projectId ? `/administration/affaires/${d.projectId}` : "/administration/agenda",
    })),
    ...submissions.map((s) => ({
      key: `remise:${s.id}`,
      title: `Remise ${s.reference}, ${s.name}`,
      dueAt: s.dueAt!,
      country: s.country,
      projectId: s.id,
      link: `/administration/affaires/${s.id}`,
    })),
  ];
  let created = 0;
  for (const t of targets) {
    const tz = TIME_ZONES[t.country ?? "FR"];
    const daysLeft = calendarDay(t.dueAt, tz.zone) - calendarDay(now, tz.zone);
    // Palier applicable : le plus petit seuil encore supérieur ou égal aux jours restants.
    const tier = ascending.find((d) => daysLeft <= d);
    if (tier === undefined) continue;
    const when = new Intl.DateTimeFormat("fr-FR", { timeZone: tz.zone, dateStyle: "full", timeStyle: "short" }).format(t.dueAt);
    const inserted = await notify(db, {
      kind: "echeance",
      title: `${t.title} : ${dayLabel(daysLeft)}`,
      body: `Échéance le ${when} (${tz.label}).`,
      projectId: t.projectId,
      link: t.link,
      dedupeKey: `${t.key}:J-${tier}`,
    });
    if (inserted) created++;
  }
  return created;
}
