/**
 * The topbar bell (Dee, 2026-09-30): clicking it shows the most recent unread
 * notifications and a link to view all. The Notifications page is still the
 * full list; it is simply no longer a sidebar entry. The badge is the same
 * unread count as before — unread rows in `notifications` under the reader's
 * own RLS — so the dot and the popover never disagree.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, BellRing, CheckCheck, Volume2, VolumeX } from "lucide-react";
import { SOUND_PREF_KEY, nativePermission, soundEnabled } from "@/lib/notifications/notification-delivery";
import { requestNativePermission } from "@/lib/notifications/use-notification-delivery";
import { blockedInstructions, currentDeviceState, ensurePushSubscription, type DeviceState } from "@/lib/notifications/push-subscription";
import { requireSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NotificationRow } from "@/components/notifications/NotificationRow";
import {
  useMarkAllNotificationsRead, useMarkNotificationRead, useRecentUnreadNotifications, useUnreadNotificationCount,
} from "@/lib/data/use-notifications";
import { hrefForEntity, RECENT_UNREAD_LIMIT, type Notification } from "@/lib/data/notifications";

export const NOTIFICATIONS_PATH = "/app/notifications";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const unread = useUnreadNotificationCount();
  /* A fresh arrival makes the bell ring for a few seconds — the "flash" Dee
     asked for — then it settles to the ordinary badge. */
  const previous = useRef(unread);
  const [ringing, setRinging] = useState(false);
  useEffect(() => {
    if (unread > previous.current) { setRinging(true); const t = setTimeout(() => setRinging(false), 8_000); previous.current = unread; return () => clearTimeout(t); }
    previous.current = unread;
  }, [unread]);
  const [device, setDevice] = useState<DeviceState | null>(null);
  const [enabling, setEnabling] = useState(false);
  const auth = useAuth();
  /* Read-only, each time the popover opens: nothing here prompts. */
  useEffect(() => { if (open) void currentDeviceState().then(setDevice); }, [open]);
  const enableOnThisDevice = async () => {
    if (!auth.user || !auth.agencyId) return;
    setEnabling(true);
    try {
      const granted = nativePermission() === "granted" ? "granted" : await requestNativePermission();
      if (granted === "granted") await ensurePushSubscription(requireSupabase(), auth.user.id, auth.agencyId);
      setDevice(await currentDeviceState());
    } finally { setEnabling(false); }
  };
  const [sound, setSound] = useState(soundEnabled());
  const toggleSound = () => {
    const next = !sound; setSound(next);
    try { localStorage.setItem(SOUND_PREF_KEY, next ? "on" : "off"); } catch { /* per-browser preference only */ }
  };
  const recent = useRecentUnreadNotifications(open);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const navigate = useNavigate();

  const openNotification = (n: Notification) => {
    const href = hrefForEntity(n.entityType, n.entityId);
    if (!href) return;
    if (!n.readAt) markRead.mutate(n.id);
    setOpen(false);
    navigate(href);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          title="Notifications"
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=open]:bg-muted data-[state=open]:text-foreground"
        >
          {ringing ? <BellRing className="h-5 w-5 animate-pulse text-primary" /> : <Bell className="h-5 w-5" />}
          {unread > 0 && (
            <span className={`absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground ${ringing ? "animate-pulse" : ""}`}>
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(26rem,calc(100vw-1rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <p className="text-sm font-semibold text-foreground">
            Notifications
            {unread > 0 && <span className="ml-2 text-xs font-medium text-muted-foreground">{unread} unread</span>}
          </p>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          )}
        </div>
        {recent.isLoading ? (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">Loading…</p>
        ) : recent.error ? (
          <p role="alert" className="px-4 py-6 text-center text-xs text-status-danger">Could not load notifications.</p>
        ) : recent.items.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">You are all caught up.</p>
        ) : (
          <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
            {recent.items.map((n) => (
              <NotificationRow key={n.id} n={n} onOpen={openNotification} onMarkRead={(id) => markRead.mutate(id)} />
            ))}
          </ul>
        )}
        {/* Delivery on this device: desktop notifications and the chime. */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 text-xs">
          {(device === "can_enable" || device === "needs_registration") && (
            <button type="button" onClick={() => void enableOnThisDevice()} disabled={enabling}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
              <BellRing className="h-3.5 w-3.5" aria-hidden /> {enabling ? "Turning on…" : "Turn on notifications"}
            </button>
          )}
          {device === "subscribed" && (
            <span className="text-muted-foreground">Notifications are on for this device, including when FullSuite is closed.</span>
          )}
          {device === "blocked" && (
            <span className="text-muted-foreground">
              <span className="font-semibold text-foreground">Notifications are blocked for FullSuite in this browser.</span> {blockedInstructions()}
            </span>
          )}
          {device === "needs_install" && (
            <span className="text-muted-foreground">
              <span className="font-semibold text-foreground">On iPhone, FullSuite must be on your Home Screen first.</span> In Safari tap Share, then Add to Home Screen, then open FullSuite from that icon and turn notifications on here.
            </span>
          )}
          {device === "unsupported" && <span className="text-muted-foreground">This browser cannot show notifications.</span>}
          <button type="button" onClick={toggleSound} aria-pressed={sound}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {sound ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />} {sound ? "Sound on" : "Sound off"}
          </button>
        </div>
        <div className="border-t border-border px-4 py-2.5">
          <Link
            to={NOTIFICATIONS_PATH}
            onClick={() => setOpen(false)}
            className="text-xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            View all notifications{unread > RECENT_UNREAD_LIMIT ? ` (${unread} unread)` : ""}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
