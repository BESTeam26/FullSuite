import type { ReactNode, ElementType } from "react";
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
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
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
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
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

export const NotificationsPage = () => (
  <HqPageShell
    title="Notifications"
    description="Recent system alerts and updates"
    icon={Bell}
  >
    <div className="space-y-2">
      {[
        {
          time: "2 min ago",
          text: "New work order WO-9045 assigned to you",
          unread: true,
        },
        {
          time: "15 min ago",
          text: "Apex Credit Co. upgraded to Full Suite",
          unread: true,
        },
        {
          time: "1 hr ago",
          text: "SmartCredit connector needs re-authentication",
          unread: true,
        },
        {
          time: "3 hrs ago",
          text: "QA approved — Anthony Ramos CFPB complaint",
          unread: false,
        },
        {
          time: "Yesterday",
          text: "Weekly workforce report is ready",
          unread: false,
        },
        {
          time: "Yesterday",
          text: "Pioneer Credit Solutions added 12 new clients",
          unread: false,
        },
      ].map((n) => (
        <div
          key={n.text}
          className={cn(
            "flex items-start gap-3 rounded-xl border px-4 py-3",
            n.unread
              ? "border-primary/30 bg-primary/5"
              : "border-border bg-card",
          )}
        >
          <div
            className={cn(
              "mt-1.5 h-2 w-2 shrink-0 rounded-full",
              n.unread ? "bg-primary" : "bg-muted",
            )}
          />
          <div className="flex-1">
            <p
              className={cn(
                "text-sm",
                n.unread
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {n.text}
            </p>
            <p className="text-xs text-muted-foreground">{n.time}</p>
          </div>
        </div>
      ))}
    </div>
  </HqPageShell>
);
