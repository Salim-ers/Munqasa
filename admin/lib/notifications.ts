/** Notifications : liste, compteur des non lues (actualisé chaque minute), lecture. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { AppNotification } from "./types";

export const NOTIFICATIONS_KEY = ["notifications"] as const;

export function useNotifications() {
  return useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: ({ signal }) => api<{ items: AppNotification[]; unread: number }>("/notifications", { signal }),
    refetchInterval: 60_000,
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string | "all") => (id === "all" ? api("/notifications/read-all", { body: {} }) : api(`/notifications/${id}/read`, { body: {} })),
    onMutate: async (id) => {
      // Mise à jour immédiate de l'affichage, confirmée par le serveur.
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_KEY });
      queryClient.setQueryData<{ items: AppNotification[]; unread: number }>(NOTIFICATIONS_KEY, (data) => {
        if (!data) return data;
        const now = new Date().toISOString();
        const items = data.items.map((n) => (id === "all" || n.id === id ? { ...n, readAt: n.readAt ?? now } : n));
        return { items, unread: items.filter((n) => !n.readAt).length };
      });
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
}
