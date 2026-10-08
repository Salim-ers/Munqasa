import { Bell, BellOff } from "lucide-react";
import { Popover } from "radix-ui";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { NotificationItem } from "../components/NotificationItem";
import { useMarkRead, useNotifications } from "../lib/notifications";

/** Cloche de la barre supérieure : non lues en pastille, aperçu des dernières notifications. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const notifications = useNotifications();
  const markRead = useMarkRead();
  const unread = notifications.data?.unread ?? 0;
  const latest = (notifications.data?.items ?? []).slice(0, 6);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="relative grid size-9 place-items-center rounded-xl text-ink-2 hover:bg-surface hover:text-ink data-[state=open]:bg-surface"
          aria-label={unread ? `Notifications, ${unread} non lue${unread > 1 ? "s" : ""}` : "Notifications"}
        >
          <Bell className="size-[1.125rem]" aria-hidden="true" />
          {unread ? (
            <span className="absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[0.625rem] leading-none font-bold text-on-accent tabular">{unread > 99 ? "99+" : unread}</span>
          ) : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} collisionPadding={12} className="z-50 w-[min(24rem,calc(100vw-1.5rem))] rounded-card border border-line bg-surface p-2 shadow-lift">
          <div className="flex items-center justify-between px-2.5 pt-1.5 pb-2">
            <p className="text-xs font-semibold text-ink">Notifications</p>
            {unread ? (
              <button type="button" onClick={() => markRead.mutate("all")} className="text-2xs font-semibold text-accent hover:underline">
                Tout marquer comme lu
              </button>
            ) : null}
          </div>
          {latest.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <BellOff className="size-5 text-ink-3" aria-hidden="true" />
              <p className="text-xs text-ink-3">Aucune notification.</p>
            </div>
          ) : (
            <ul className="grid max-h-[60vh] gap-0.5 overflow-y-auto">
              {latest.map((n) => (
                <li key={n.id}>
                  <NotificationItem
                    compact
                    notification={n}
                    onOpen={() => {
                      if (!n.readAt) markRead.mutate(n.id);
                      setOpen(false);
                      if (n.link) navigate(n.link);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="mt-1 border-t border-line px-1 pt-1.5">
            <Link to="/administration/notifications" onClick={() => setOpen(false)} className="block rounded-lg px-2 py-2 text-center text-2xs font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink">
              Voir toutes les notifications
            </Link>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
