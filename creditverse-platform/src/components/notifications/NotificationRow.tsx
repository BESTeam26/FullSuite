/**
 * One notification, as a list row — shared by the Notifications page and the
 * bell's recent-unread popover so the two never drift (rule 6).
 *
 * Rows are written only by the database when an activity event names a
 * recipient, and are read under the recipient's own RLS, which re-checks
 * that the record is still visible to them.
 */
import type { ElementType } from "react";
import {
  AtSign, AlertTriangle, BellRing, Clock, Bell, ClipboardCheck, Check, MessageSquare, UserPlus, UserMinus,
  ArrowRightLeft, Send, Share2, Megaphone, CalendarOff, CalendarClock, Receipt,
} from "lucide-react";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { hrefForEntity, type Notification } from "@/lib/data/notifications";

const KIND_ICON: Record<Notification["kind"], ElementType> = {
  assigned: UserPlus,
  unassigned: UserMinus,
  note: MessageSquare,
  status: ArrowRightLeft,
  mention: AtSign,
  dm: Send,
  handoff: Share2,
  attention: AlertTriangle,
  announcement: Megaphone,
  timer: Clock,
  leave: CalendarOff,
  payroll: Receipt,
  due_soon: CalendarClock,
  overdue: AlertTriangle,
  eod: ClipboardCheck,
  reminder: BellRing,
};

const ENTITY_LABEL: Record<string, string> = {
  work_item: "Work item",
  crm_project: "BES CRM project",
  fulfillment_client: "CreditOps client",
  funding_client: "FundingOps client",
  channel: "Conversation",
  announcement: "Announcement",
  time_entry: "Time entry",
  leave_request: "Leave request",
  payslip: "Payslip",
  payroll_cutoff: "Payroll",
};

const formatWhen = (iso: string) => {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return formatDate(d);
};

export const NotificationRow = ({
  n,
  onOpen,
  onMarkRead,
}: {
  n: Notification;
  onOpen: (n: Notification) => void;
  onMarkRead: (id: number) => void;
}) => {
  /* A kind this build does not know renders as a plain bell — never a crash
     (P-010: an `eod` notice took the whole page down). */
  const Icon = KIND_ICON[n.kind] ?? Bell;
  // A record you were moved off is, by definition, one you may no longer
  // open. Say so instead of linking to a page that would show nothing.
  const href =
    n.kind === "unassigned" ? null : hrefForEntity(n.entityType, n.entityId);
  const unread = !n.readAt;
  return (
    <li
      className={cn(
        "flex items-start gap-3 px-4 py-3 transition-colors",
        unread ? "bg-primary/5" : "bg-card",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          unread ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p
            className={cn(
              "text-sm text-foreground",
              unread ? "font-semibold" : "font-medium",
            )}
          >
            {n.title}
          </p>
          <span className="text-xs text-muted-foreground">
            {formatWhen(n.createdAt)}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {ENTITY_LABEL[n.entityType] ?? n.entityType}
          {n.entityLabel ? ` · ${n.entityLabel}` : ""}
          {n.detail ? ` — ${n.detail}` : ""}
        </p>
        <div className="mt-1.5 flex items-center gap-3">
          {href ? (
            <button
              type="button"
              onClick={() => onOpen(n)}
              className="text-xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
            >
              Open
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">
              {n.kind === "unassigned"
                ? "You no longer have access to this record"
                : "No page opens this record yet"}
            </span>
          )}
          {unread && (
            <button
              type="button"
              onClick={() => onMarkRead(n.id)}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
            >
              <Check className="h-3 w-3" /> Mark read
            </button>
          )}
        </div>
      </div>
      {unread && (
        <span
          aria-label="Unread"
          className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary"
        />
      )}
    </li>
  );
};
