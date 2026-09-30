/**
 * The topbar bell (Dee, 2026-09-30): clicking it shows the most recent unread
 * notifications and a link to view all. The Notifications page is still the
 * full list; it is simply no longer a sidebar entry. The badge is the same
 * unread count as before — unread rows in `notifications` under the reader's
 * own RLS — so the dot and the popover never disagree.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
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
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
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
