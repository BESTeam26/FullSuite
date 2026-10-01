/**
 * Push delivery health (Dee, 2026-10-01), read from the events the sender
 * writes as they happen. Bounded to a week; never polled — the owner alert
 * is a database trigger, this is the card that explains it.
 */
import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";

export type PushEventKind = "failed_send" | "device_gone" | "unauthorized" | "function_error" | "dispatch_error";

export interface PushDeliveryEvent {
  id: number; kind: PushEventKind; detail: string | null; createdAt: string;
  notificationId: number | null; userId: string | null;
}

export const PUSH_EVENT_LABEL: Record<PushEventKind, string> = {
  failed_send: "Failed push sends",
  device_gone: "Dead devices removed",
  unauthorized: "Unauthorized dispatch attempts",
  function_error: "Delivery function failures",
  dispatch_error: "Hand-off failures",
};

export interface PushDeliverySummary {
  last24h: Record<PushEventKind, number>;
  last7d: Record<PushEventKind, number>;
  recent: PushDeliveryEvent[];
}

const zero = (): Record<PushEventKind, number> => ({ failed_send: 0, device_gone: 0, unauthorized: 0, function_error: 0, dispatch_error: 0 });

export function summarisePushEvents(events: readonly PushDeliveryEvent[], now: Date = new Date()): PushDeliverySummary {
  const dayAgo = now.getTime() - 24 * 3600_000;
  const last24h = zero(), last7d = zero();
  for (const e of events) {
    last7d[e.kind] += 1;
    if (new Date(e.createdAt).getTime() >= dayAgo) last24h[e.kind] += 1;
  }
  return { last24h, last7d, recent: events.slice(0, 20) };
}

export async function fetchPushDeliveryEvents(): Promise<PushDeliveryEvent[]> {
  const sb = requireSupabase();
  const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const { data, error } = await sb.from("push_delivery_events")
    .select("id, kind, detail, created_at, notification_id, user_id")
    .gte("created_at", since).order("created_at", { ascending: false }).limit(500);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: Number(r.id), kind: r.kind as PushEventKind, detail: (r.detail as string | null) ?? null,
    createdAt: String(r.created_at), notificationId: (r.notification_id as number | null) ?? null, userId: (r.user_id as string | null) ?? null,
  }));
}

export function usePushDeliveryHealth() {
  const auth = useAuth();
  return useQuery({
    queryKey: ["push-delivery", "events"],
    queryFn: fetchPushDeliveryEvents,
    enabled: auth.mode === "live" && auth.status === "signed-in",
    staleTime: 60_000,
    select: (events) => summarisePushEvents(events),
  });
}
