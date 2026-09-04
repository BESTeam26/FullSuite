import type { ReactNode, ElementType } from "react";
import { Link } from "react-router-dom";
import {
  DivisionTable,
  ContentCard,
  StatCard,
  StatusPill,
} from "@/components/dashboard/DivisionLayout";
import { cn } from "@/lib/utils";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { useMyWork, useAttention } from "@/lib/data/use-work";
import {
  AlertTriangle,
  ListTodo,
  Clock,
  Timer,
  Bell,
  CheckCircle2,
  PlayCircle,
  PauseCircle,
  ShieldAlert,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Shared HQ page shell                                                  */
/* ------------------------------------------------------------------ */

export const HqPageShell = ({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: ElementType;
  children: ReactNode;
}) => (
  <div className="p-6">
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
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
      description="Work across the BES ecosystem that needs a human right now"
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
            rows={items.map((w) => [
              w.title,
              divisionOf(w.relatedType),
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
export const NotificationsPage = () => (
  <HqPageShell
    title="Notifications"
    description="Alerts routed to you"
    icon={Bell}
  >
    <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
      <Bell className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
      <p className="text-sm font-semibold text-foreground">
        Notifications are not available yet
      </p>
      <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
        Assignments, mentions and SLA alerts will appear here once notification
        delivery is built. Nothing is being held back — there is no queue behind
        this screen. Work needing attention is on{" "}
        <Link
          to="/app/attention"
          className="font-semibold text-primary underline underline-offset-2 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Attention Center
        </Link>{" "}
        and{" "}
        <Link
          to="/app/my-work"
          className="font-semibold text-primary underline underline-offset-2 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          My Work
        </Link>
        .
      </p>
    </div>
  </HqPageShell>
);
