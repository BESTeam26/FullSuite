import type { ReactNode, ElementType } from "react";
import { useAgency } from "@/lib/agency-context";
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
        <StatCard label="Needs attention" value={items.length} icon={AlertTriangle} />
        <StatCard label="Blocked" value={counts.blocked} icon={ShieldAlert} />
        <StatCard label="Overdue" value={counts.overdue} icon={AlertTriangle} />
        <StatCard label="SLA risk (< 4h)" value={counts.sla_risk} icon={Clock} />
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
              Nothing needs attention. No blocked work and nothing inside the SLA window.
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
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
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

export const MyTimePage = () => (
  <HqPageShell
    title="My Time"
    description="Track your hours across divisions and tasks"
    icon={Clock}
  >
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard label="Today" value="6h 22m" icon={Clock} />
      <StatCard label="This Week" value="34h 10m" icon={Clock} />
      <StatCard label="CreditOps" value="18h" icon={Clock} />
      <StatCard label="BES CRM" value="12h" icon={Clock} />
    </div>
    <div className="mt-5 flex gap-3">
      <button className="flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 transition-colors">
        <PlayCircle className="h-4 w-4" /> Clock In
      </button>
      <button className="flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors">
        <PauseCircle className="h-4 w-4" /> Clock Out
      </button>
    </div>
    <ContentCard title="Today's Time Entries">
      <DivisionTable
        columns={["Time", "Division", "Task", "Duration"]}
        rows={[
          ["09:00 AM", "CreditOps", "Round 2 — Maria Gonzalez", "1h 30m"],
          ["10:45 AM", "BES CRM", "GHL Build — Apex Credit", "2h 15m"],
          ["01:15 PM", "CreditOps", "QA Review — Anthony Ramos", "45m"],
          ["02:15 PM", "TalentOps", "Agent onboarding — Liza Garcia", "1h 02m"],
        ]}
      />
    </ContentCard>
  </HqPageShell>
);

/* ------------------------------------------------------------------ */
/* End of Day                                                            */
/* ------------------------------------------------------------------ */

import { useState } from "react";
import {
  seedProductionLogs,
  deriveEodTotals,
  isEodMissing,
} from "@/lib/eod-production-engine";

export const EodPage = () => {
  const today = new Date().toISOString().split("T")[0];
  const currentEmpId = "emp-1";
  const currentEmpName = "Carlos Mendoza";

  const derived = deriveEodTotals(seedProductionLogs, currentEmpId, today);
  const missing = isEodMissing(null);

  const [unfinishedWork, setUnfinishedWork] = useState(
    "FD-1001 — stips overdue (waiting on partner responses)",
  );
  const [blockers, setBlockers] = useState(
    "SmartCredit connector — re-authentication needed for 2 sub-accounts",
  );
  const [escalations, setEscalations] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState(
    "Cleared 18 dispute letters for Apex Credit Co.",
  );
  const [nextPriority, setNextPriority] = useState(
    "Finish Round 2 MOV escalations for morning QA queue",
  );
  const [submitted, setSubmitted] = useState(false);

  return (
    <HqPageShell
      title="End of Day (EOD) Report"
      description="Production totals are auto-derived from non-voided production logs. Submit shift context & blockers."
      icon={Timer}
    >
      {/* Auto-derived Production Totals Banner */}
      <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Auto-Derived Production Totals
              </span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                Live Aggregation
              </span>
            </div>
            <h3 className="text-2xl font-extrabold text-foreground mt-1">
              {derived.totalUnits} Total Units Completed
            </h3>
            <p className="text-xs text-muted-foreground">
              Work date: {today} • Employee: {currentEmpName} • Logs:{" "}
              {derived.activeLogs.length}
            </p>
          </div>
          {missing && !submitted && (
            <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 px-3.5 py-2 text-xs font-semibold text-amber-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              EOD Submission Pending Grace Period
            </div>
          )}
        </div>

        {/* Division Breakdown */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-[11px] font-medium text-muted-foreground">
              CreditOps
            </p>
            <p className="text-lg font-bold text-foreground">
              {derived.unitsByDivision.creditops} units
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-[11px] font-medium text-muted-foreground">
              FundingOps
            </p>
            <p className="text-lg font-bold text-foreground">
              {derived.unitsByDivision.fundingops} units
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-[11px] font-medium text-muted-foreground">
              BES CRM
            </p>
            <p className="text-lg font-bold text-foreground">
              {derived.unitsByDivision["bes-crm"]} units
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-[11px] font-medium text-muted-foreground">
              TalentOps
            </p>
            <p className="text-lg font-bold text-foreground">
              {derived.unitsByDivision.talentops} units
            </p>
          </div>
        </div>
      </div>

      {submitted ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600 mb-2" />
          <h3 className="text-lg font-bold text-foreground">
            EOD Report Submitted Successfully!
          </h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1">
            Your production totals ({derived.totalUnits} units) and qualitative
            context have been logged to the Agency EOD ledger.
          </p>
          <button
            onClick={() => setSubmitted(false)}
            className="mt-4 rounded-xl border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted"
          >
            Edit Submission
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <ContentCard title="Unfinished Work">
              <textarea
                value={unfinishedWork}
                onChange={(e) => setUnfinishedWork(e.target.value)}
                placeholder="Describe items carried over to tomorrow..."
                rows={3}
                className="w-full rounded-xl border border-border bg-card p-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </ContentCard>
            <ContentCard title="Blockers & Escalations">
              <textarea
                value={blockers}
                onChange={(e) => setBlockers(e.target.value)}
                placeholder="Any technical or partner blockers encountered..."
                rows={3}
                className="w-full rounded-xl border border-border bg-card p-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </ContentCard>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <ContentCard title="Next Workday Priority">
              <textarea
                value={nextPriority}
                onChange={(e) => setNextPriority(e.target.value)}
                placeholder="Primary focus for your next shift..."
                rows={3}
                className="w-full rounded-xl border border-border bg-card p-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </ContentCard>
            <ContentCard title="Additional Notes">
              <textarea
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
                placeholder="Any shift context or client call notes..."
                rows={3}
                className="w-full rounded-xl border border-border bg-card p-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </ContentCard>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              Production totals are non-editable to prevent manual entry errors.
            </p>
            <button
              onClick={() => setSubmitted(true)}
              className="rounded-xl bg-primary px-6 py-2.5 text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Submit EOD Report
            </button>
          </div>
        </div>
      )}
    </HqPageShell>
  );
};

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
