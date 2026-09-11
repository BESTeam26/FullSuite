import type { ReactNode, ElementType } from "react";
import { formatDate } from "@/lib/format-date";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  DivisionTable,
  ContentCard,
  StatCard,
  StatusPill,
} from "@/components/dashboard/DivisionLayout";
import { cn } from "@/lib/utils";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { useMyWork, useAttention } from "@/lib/data/use-work";
import { useMyDepartmentFiles } from "@/lib/data/use-my-department-files";
import { useMyQueues } from "@/lib/data/use-my-queues";
import { useAgency } from "@/lib/agency-context";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/lib/data/use-notifications";
import { hrefForEntity, type Notification } from "@/lib/data/notifications";
import { useAuth } from "@/lib/auth/auth-context";
import { describeScope } from "@/lib/auth/scope";
import {
  AtSign,
  AlertTriangle,
  ListTodo,
  Clock,
  Timer,
  Bell,
  CheckCircle2,
  Check,
  CheckCheck,
  MessageSquare,
  UserPlus,
  UserMinus,
  ArrowRightLeft,
  Send,
  Share2,
  Megaphone,
  PlayCircle,
  PauseCircle,
  ShieldAlert,
  CalendarOff,
  CalendarClock,
  Receipt,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Shared HQ page shell                                                  */
/* ------------------------------------------------------------------ */

export const HqPageShell = ({
  title,
  description,
  icon: Icon,
  children,
  actions,
}: {
  title: string;
  description: string;
  icon: ElementType;
  children: ReactNode;
  /** Page-level controls, shown beside the heading. */
  actions?: ReactNode;
}) => (
  <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-6">
    <div className="mx-auto max-w-6xl">
      {/* Phones: heading first, actions on their own row underneath — the
          description never squeezes into a strip beside a button (Dee §9). */}
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
      </div>
      {children}
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Attention Center                                                      */
/* ------------------------------------------------------------------ */

export const AttentionCenter = () => {
  const { items, counts, source, isLoading, error } = useAttention();
  /* The database now scopes this list per person (migration 0021). The header
     must say so: "across the BES ecosystem" was true when every staff member
     saw everything, and is false for an assigned-only agent who sees only
     their own exceptions. Labelling only — RLS decides the rows. */
  const auth = useAuth();
  const reach = describeScope({
    userId: auth.user?.id ?? null,
    scope: auth.agencyScope,
    scopeDivision: auth.agencyMembership?.scope_division ?? null,
    teamIds: auth.teamIds,
    ledTeamIds: auth.ledTeamIds,
  });

  const reasonMeta = {
    blocked: {
      label: "Blocked",
      icon: ShieldAlert,
      cls: "border-red-500/30 bg-red-500/5",
    },
    overdue: {
      label: "Overdue",
      icon: AlertTriangle,
      cls: "border-red-500/30 bg-red-500/5",
    },
    sla_risk: {
      label: "SLA risk",
      icon: Clock,
      cls: "border-amber-500/30 bg-amber-500/5",
    },
  } as const;

  return (
    <HqPageShell
      title="Attention Center"
      description={
        auth.isAgencyStaff
          ? `Exceptions you own or supervise · your reach: ${reach}`
          : "Exceptions on your organization's work that need a human right now"
      }
      icon={AlertTriangle}
    >
      <div className="mb-4 flex items-center gap-2">
        <DataSourceBadge source={source} />
        {source === "demo" && (
          <span className="text-xs text-muted-foreground">
            Connect a backend to see real SLA and blocker signals.
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          Could not load attention items: {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Needs attention"
          value={items.length}
          icon={AlertTriangle}
        />
        <StatCard label="Blocked" value={counts.blocked} icon={ShieldAlert} />
        <StatCard label="Overdue" value={counts.overdue} icon={AlertTriangle} />
        <StatCard
          label="SLA risk (< 4h)"
          value={counts.sla_risk}
          icon={Clock}
        />
      </div>

      <div className="mt-5 space-y-2">
        {isLoading && (
          <div className="rounded-xl border border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        )}
        {!isLoading && items.length === 0 && (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-6 text-sm">
            <CheckCircle2 className="h-5 w-5 text-status-success" />
            <span className="text-foreground">
              Nothing needs attention. No blocked work and nothing inside the
              SLA window.
            </span>
          </div>
        )}
        {items.map((item) => {
          const meta = reasonMeta[item.reason];
          const Icon = meta.icon;
          return (
            <div
              key={item.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-4 py-3",
                meta.cls,
              )}
            >
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {item.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {meta.label} · {item.stage}
                  {item.hoursRemaining !== null &&
                    ` · ${item.hoursRemaining < 0 ? `${Math.abs(item.hoursRemaining)}h overdue` : `${item.hoursRemaining}h left`}`}
                </p>
              </div>
              <StatusPill status={item.stage} />
            </div>
          );
        })}
      </div>
    </HqPageShell>
  );
};

/* ------------------------------------------------------------------ */
/* My Work                                                               */
/* ------------------------------------------------------------------ */

export const MyWorkPage = () => {
  const { items, source, isLoading, error } = useMyWork();
  /* Department files assigned to me (CreditOps / FundingOps) — the second half
     of "what do I need to do right now" (separation step 4). */
  const departmentFiles = useMyDepartmentFiles();
  const queues = useMyQueues();
  const { viewMode } = useAgency();
  const fileHref = (f: { division: string; clientId: string }) =>
    f.division === "CreditOps"
      ? (viewMode === "agency" ? `/app/creditops?client=${f.clientId}` : `/app/operations?client=${f.clientId}`)
      : (viewMode === "agency" ? `/app/fundingops?client=${f.clientId}` : `/app/funding-workspace?client=${f.clientId}`);
  // Deep link from a notification: /app/my-work?item=<id>. The row is
  // highlighted if it is in the caller's list; if RLS no longer returns it,
  // nothing is highlighted and nothing is claimed.
  const [searchParams] = useSearchParams();
  const linkedItem = searchParams.get("item");
  const activeRow = linkedItem
    ? items.findIndex((w) => w.id === linkedItem)
    : -1;

  const divisionOf = (relatedType: string) =>
    relatedType === "fulfillment" || relatedType === "credit_case"
      ? "CreditOps"
      : relatedType === "funding_deal"
        ? "FundingOps"
        : relatedType === "project"
          ? "BES CRM"
          : relatedType === "support"
            ? "Support"
            : relatedType;

  return (
    <HqPageShell
      title="My Work"
      description="Work assigned to you across all divisions"
      icon={ListTodo}
    >
      <div className="mb-4 flex items-center gap-2">
        <DataSourceBadge source={source} />
        <span className="text-xs text-muted-foreground">
          {items.length} open {items.length === 1 ? "item" : "items"}
        </span>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          Could not load your work: {error}
        </div>
      )}

      {departmentFiles.live && (
        <div className="mb-4">
          <ContentCard title="My department files">
            {departmentFiles.error ? (
              <p className="text-sm text-red-700">Could not load your department files: {departmentFiles.error}</p>
            ) : departmentFiles.isLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
            ) : departmentFiles.files.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No department work is assigned to you right now.</p>
            ) : (
              <DivisionTable
                columns={["Client", "Division", "Department", "Work status", "Updated"]}
                rows={departmentFiles.files.map((f) => [
                  <Link key={f.key} to={fileHref(f)} className="font-medium text-primary underline-offset-2 hover:underline">{f.clientName}{f.filePurpose ? ` · ${f.filePurpose}` : ""}</Link>,
                  f.division,
                  f.department,
                  <StatusPill status={f.status} />,
                  formatDate(f.updatedAt),
                ])}
              />
            )}
          </ContentCard>
        </div>
      )}
      {queues.live && (
        <div className="mb-4">
          <ContentCard title="Available in my queues">
            {queues.error ? (
              <p className="text-sm text-red-700">Could not load your queues: {queues.error}</p>
            ) : queues.isLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
            ) : queues.rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing unassigned in the departments you are authorized to work.</p>
            ) : (
              <DivisionTable
                columns={["Client", "Division", "Department", "Work status", "Waiting since"]}
                rows={queues.rows.map((f) => [
                  <Link key={f.key} to={fileHref(f)} className="font-medium text-primary underline-offset-2 hover:underline">{f.clientName}{f.filePurpose ? ` · ${f.filePurpose}` : ""}</Link>,
                  f.division,
                  f.department,
                  <StatusPill status={f.status} />,
                  formatDate(f.updatedAt),
                ])}
              />
            )}
          </ContentCard>
        </div>
      )}
      <ContentCard title="My Active Work Items">
        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Loading…
          </p>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-status-success" />
            Nothing assigned to you right now.
          </div>
        ) : (
          <DivisionTable
            columns={["Task", "Division", "Status", "SLA (hrs)"]}
            activeRow={activeRow >= 0 ? activeRow : undefined}
            rows={items.map((w) => [
              w.title,
              w.workspaceId ? "Workspace" : divisionOf(w.relatedType),
              <StatusPill status={w.stage} />,
              w.slaHoursRemaining ?? "—",
            ])}
          />
        )}
      </ContentCard>
    </HqPageShell>
  );
};

/* ------------------------------------------------------------------ */
/* My Time                                                               */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Notifications                                                         */
/* ------------------------------------------------------------------ */

/**
 * Notifications — deliberately empty.
 *
 * This page previously rendered six hardcoded items ("Apex Credit Co. upgraded
 * to Full Suite", "Pioneer Credit Solutions added 12 new clients") to every
 * viewer, with a badge hardcoded to 3. They were not notifications: there is no
 * `notifications` table, no recipient, no read state, and nothing routed them
 * to anyone. Worse, they named other customers, and the route has no role gate,
 * so an organization user reaching it directly saw another organization's
 * commercial facts.
 *
 * An empty state that says so is more honest than a number that is always three
 * and a list that is always the same. It stays until the real model exists —
 * recipient, entity, read state, and RLS on `recipient_id = auth.uid()`.
 */
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

const NotificationRow = ({
  n,
  onOpen,
  onMarkRead,
}: {
  n: Notification;
  onOpen: (n: Notification) => void;
  onMarkRead: (id: number) => void;
}) => {
  const Icon = KIND_ICON[n.kind];
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

/**
 * Real notifications. Rows are written only by the database when an
 * activity event names a recipient (assignment, note, status change), and
 * are read under the recipient's own RLS, which re-checks that the record is
 * still visible to them. Opening one marks it read, then navigates.
 */
export const NotificationsPage = () => {
  const { items, isLoading, error, live } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const navigate = useNavigate();
  const unread = items.filter((n) => !n.readAt).length;

  const open = (n: Notification) => {
    const href = hrefForEntity(n.entityType, n.entityId);
    if (!href) return;
    if (!n.readAt) markRead.mutate(n.id);
    navigate(href);
  };

  return (
    <HqPageShell
      title="Notifications"
      description="Assignments, handoffs, mentions, messages, announcements and anything needing attention — routed to you"
      icon={Bell}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {live
            ? `${unread} unread · ${items.length} shown`
            : "Available when signed in"}
        </span>
        {unread > 0 && (
          <button
            type="button"
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          Could not load notifications: {error}
        </div>
      )}

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
          <Bell className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">
            Nothing routed to you yet
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            You are notified when work is assigned to you, when someone notes
            or comments on a record you own, and when its status is moved by
            someone else.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {items.map((n) => (
            <NotificationRow
              key={n.id}
              n={n}
              onOpen={open}
              onMarkRead={(id) => markRead.mutate(id)}
            />
          ))}
        </ul>
      )}
    </HqPageShell>
  );
};
