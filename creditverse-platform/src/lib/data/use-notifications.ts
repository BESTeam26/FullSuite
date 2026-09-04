/**
 * Notification hooks. Live mode only — in demo mode there is no recipient,
 * so the count is 0 and the list is empty rather than invented.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
} from "@/lib/data/notifications";

export const NOTIFICATIONS_KEY = ["notifications"] as const;
const LIST_KEY = [...NOTIFICATIONS_KEY, "list"] as const;
const UNREAD_KEY = [...NOTIFICATIONS_KEY, "unread"] as const;

const useLive = () => {
  const auth = useAuth();
  return auth.mode === "live" && auth.status === "signed-in" && !!auth.user;
};

export interface NotificationsResult {
  items: Notification[];
  isLoading: boolean;
  error: string | null;
  live: boolean;
}

export function useNotifications(): NotificationsResult {
  const live = useLive();
  const q = useQuery({
    queryKey: LIST_KEY,
    queryFn: () => fetchNotifications(),
    enabled: live,
    staleTime: 15_000,
  });
  return {
    items: q.data ?? [],
    isLoading: live && q.isLoading,
    error: q.error ? (q.error as Error).message : null,
    live,
  };
}

/** Shared by the sidebar badge and the topbar bell: one request, one key. */
export function useUnreadNotificationCount(): number {
  const live = useLive();
  const q = useQuery({
    queryKey: UNREAD_KEY,
    queryFn: fetchUnreadCount,
    enabled: live,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
  return live ? (q.data ?? 0) : 0;
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => markNotificationRead(id),
    onSuccess: (_, id) => {
      const now = new Date().toISOString();
      qc.setQueryData<Notification[]>(LIST_KEY, (prev) =>
        prev?.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: now } : n)),
      );
      void qc.invalidateQueries({ queryKey: UNREAD_KEY });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });
}
