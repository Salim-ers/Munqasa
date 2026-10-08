import { BellRing, CalendarClock, Cog, Coins, ShieldAlert, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import type { NotificationKind } from "../../shared/enums";
import { cn } from "../lib/cn";
import { formatRelative } from "../lib/format";
import type { AppNotification } from "../lib/types";

const ICONS: Record<NotificationKind, ReactNode> = {
  echeance: <CalendarClock />,
  traitement: <Sparkles />,
  qualite: <ShieldAlert />,
  prix: <Coins />,
  securite: <ShieldAlert />,
  systeme: <Cog />,
};

/** Une notification : icône par nature, titre, détail, ancienneté ; non lue mise en avant. */
export function NotificationItem({ notification, onOpen, compact = false }: { notification: AppNotification; onOpen: () => void; compact?: boolean }) {
  const unread = !notification.readAt;
  return (
    <button type="button" onClick={onOpen} className={cn("flex w-full items-start gap-3 rounded-xl text-left transition-colors hover:bg-surface-2", compact ? "px-2.5 py-2.5" : "px-4 py-3.5")}>
      <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg [&_svg]:size-4 [&_svg]:stroke-[1.75]", unread ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-3")}>
        {ICONS[notification.kind] ?? <BellRing />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-xs leading-snug", unread ? "font-semibold text-ink" : "font-medium text-ink-2")}>{notification.title}</span>
        {notification.body && !compact ? <span className="mt-0.5 block text-2xs leading-relaxed text-ink-3">{notification.body}</span> : null}
        <span className="mt-0.5 block text-2xs text-ink-3 first-letter:uppercase">{formatRelative(notification.createdAt)}</span>
      </span>
      {unread ? <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" aria-label="Non lue" /> : null}
    </button>
  );
}
