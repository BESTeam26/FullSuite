/**
 * The open app hears its own notifications the moment they are written and
 * tells the person (Dee, 2026-10-01: "like Slack and Teams").
 *
 * One Realtime subscription per signed-in session, on the person's own rows
 * (Row Level Security filters the stream exactly as it filters a select).
 * Each new row: refresh the bell, show a toast with Open, raise a desktop
 * notification when the tab is not in front, chime for the urgent kinds,
 * and keep the unread count in the tab title.
 *
 * Cost scales with: one realtime subscription per active user.
 */
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { requireSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { hrefForEntity, type Notification } from "@/lib/data/notifications";
import { NOTIFICATIONS_KEY, useUnreadNotificationCount } from "@/lib/data/use-notifications";
import {
  badgedTitle, describeForAlert, nativePermission, playChime, shouldNotifyNatively, soundEnabled,
} from "./notification-delivery";
import { ensurePushSubscription } from "./push-subscription";

const mapRow = (row: Record<string, unknown>): Notification => ({
  id: Number(row.id),
  kind: row.kind as Notification["kind"],
  title: String(row.title ?? ""),
  detail: (row.detail as string | null) ?? null,
  entityType: String(row.entity_type ?? ""),
  entityId: String(row.entity_id ?? ""),
  entityLabel: (row.entity_label as string | null) ?? null,
  actorId: (row.actor_id as string | null) ?? null,
  createdAt: String(row.created_at ?? ""),
  readAt: (row.read_at as string | null) ?? null,
} as Notification);

export function useNotificationDelivery(): void {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in" && !!auth.user;
  const userId = auth.user?.id ?? null;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const unread = useUnreadNotificationCount();
  const seen = useRef(new Set<number>());
  /* Once this device has push, the service worker shows the message whenever
     no FullSuite window is in front — so the page must not ALSO raise one
     (Dee: never a duplicate while actively viewing FullSuite). */
  const pushActive = useRef(false);

  /* The tab title carries the unread count. Re-applied on every route change
     because each page sets its own title. */
  useEffect(() => {
    document.title = badgedTitle(document.title, unread);
  }, [unread, location.pathname]);

  /* With permission already granted, keep this device's push subscription
     current (endpoints rotate). One call per signed-in session. */
  const agencyId = auth.agencyId ?? null;
  useEffect(() => {
    if (!live || !userId || !agencyId || nativePermission() !== "granted") return;
    void ensurePushSubscription(requireSupabase(), userId, agencyId).then((state) => { pushActive.current = state === "subscribed"; });
  }, [live, userId, agencyId]);

  useEffect(() => {
    if (!live || !userId) return;
    const sb = requireSupabase();
    let cancelled = false;

    const deliver = (n: Notification) => {
      if (cancelled || seen.current.has(n.id)) return;
      seen.current.add(n.id);
      void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });

      const { title, body, urgent } = describeForAlert(n);
      const href = n.kind === "unassigned" ? null : hrefForEntity(n.entityType, n.entityId);

      toast(title, {
        description: body ?? undefined,
        duration: urgent ? 12_000 : 6_000,
        action: href ? { label: "Open", onClick: () => navigate(href) } : undefined,
      });

      if (!pushActive.current && shouldNotifyNatively(nativePermission(), document.hidden, document.hasFocus())) {
        try {
          const native = new Notification(title, { body: body ?? undefined, icon: "/bes-logo.png", tag: `fullsuite-${n.id}` });
          native.onclick = () => { window.focus(); if (href) navigate(href); native.close(); };
        } catch { /* the browser refused; the toast and the bell still have it */ }
      }
      if (urgent && soundEnabled()) playChime();
    };

    const channel = sb
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
        (payload) => deliver(mapRow(payload.new as Record<string, unknown>)),
      )
      /* The channel's state is the one fact that explains "nothing arrived"
         in production; it stays at debug level. */
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") console.warn("[FullSuite] notifications realtime", status, err?.message);
        else console.debug("[FullSuite] notifications realtime", status);
      });

    return () => { cancelled = true; void sb.removeChannel(channel); };
  }, [live, userId, qc, navigate]);
}

/** Ask the browser for permission — only ever from a click. */
export async function requestNativePermission(): Promise<ReturnType<typeof nativePermission>> {
  if (typeof Notification === "undefined") return "unsupported";
  try { return (await Notification.requestPermission()) as ReturnType<typeof nativePermission>; } catch { return nativePermission(); }
}
