import { BellOff, CheckCheck } from "lucide-react";
import { useNavigate } from "react-router";
import { NotificationItem } from "../components/NotificationItem";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState, Skeleton } from "../components/ui/Feedback";
import { PageHeader } from "../components/ui/PageHeader";
import { Segmented } from "../components/ui/Segmented";
import { useListParams } from "../lib/list-params";
import { useMarkRead, useNotifications } from "../lib/notifications";

export function NotificationsPage() {
  const navigate = useNavigate();
  const list = useListParams({ id: "recent", desc: true });
  const onlyUnread = list.get("filtre") === "non-lues";
  const notifications = useNotifications();
  const markRead = useMarkRead();
  const items = (notifications.data?.items ?? []).filter((n) => !onlyUnread || !n.readAt);
  const unread = notifications.data?.unread ?? 0;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        description="Rappels d’échéance et événements de l’application. Les rappels sont créés chaque matin par la tâche planifiée."
        actions={
          <Button variant="secondary" icon={<CheckCheck className="size-4" />} disabled={!unread} loading={markRead.isPending} onClick={() => markRead.mutate("all")}>
            Tout marquer comme lu
          </Button>
        }
      />
      <div className="mb-4">
        <Segmented
          value={onlyUnread ? "non-lues" : "toutes"}
          onChange={(v) => list.set({ filtre: v === "toutes" ? null : v })}
          options={[
            { value: "toutes", label: "Toutes" },
            { value: "non-lues", label: unread ? `Non lues (${unread})` : "Non lues" },
          ]}
          label="Afficher"
        />
      </div>
      <Card className="p-2">
        {notifications.isPending ? (
          <div className="grid gap-2 p-3">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={<BellOff className="size-5" />} title={onlyUnread ? "Tout est lu" : "Aucune notification"} text={onlyUnread ? undefined : "Les rappels d’échéance apparaîtront ici."} />
        ) : (
          <ul className="grid gap-0.5">
            {items.map((n) => (
              <li key={n.id}>
                <NotificationItem
                  notification={n}
                  onOpen={() => {
                    if (!n.readAt) markRead.mutate(n.id);
                    if (n.link) navigate(n.link);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
