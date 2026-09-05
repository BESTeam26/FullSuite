/**
 * Partner Dashboard — the CreditOps overview of ONE Partner's client records.
 *
 * Header Stats:
 * [ Total Active ] | [ Overdue (7+) ] | [ Critical (30+) ] | [ Support Open ] | [ Bureau Queue ] | [ Archived ]
 *
 * Section Grids:
 * 1. Dispute Processing — Client Pipeline (Gauge Ring + Status Breakdowns)
 * 2. Client Success — Support Queue (Gauge Ring + Status Breakdowns)
 * 3. Bureau Calling — Queue Status
 * 4. Complaints & Mailing — Queue Status
 * 5. Onboarding — Queue Status
 * 6. Team Workload — Files Per Department
 * 7. Auto-Escalation Banner
 *
 * Every figure is derived from the store's client rows and their department
 * statuses — the same records the Main Client List and the queues show, scoped
 * to `selectedScope`. The status vocabulary comes from the Status Guide, so a
 * status added there appears here without a second list (rule 5). Nothing is
 * floored or invented: an empty Partner reads zero everywhere.
 */

import { useMemo } from "react";
import {
  Users,
  AlertTriangle,
  HelpCircle,
  Phone,
  Mail,
  UserPlus,
  ShieldAlert,
  ArrowRight,
} from "lucide-react";
import { useCreditOpsStore } from "@/lib/fulfillment/creditops-client-store";
import { getPartnerByScope } from "@/lib/fulfillment/creditops-partners";
import {
  CREDIT_OPS_STATUS_GUIDE,
  type StatusGuideItem,
} from "@/lib/fulfillment/creditops-status-guide";
import type { DepartmentStatus } from "@/lib/fulfillment/creditops-store-types";
import { cn } from "@/lib/utils";

interface CreditOpsDashboardViewProps {
  selectedScope: string;
  /** Display name of the Partner whose records are in scope. */
  partnerName?: string;
  onNavigateToView?: (viewId: string) => void;
}

const INACTIVE_STATUSES = ["Completed", "Archived", "Graduated"];

/* Department statuses that mean "no open file for this department". Counted
   in the queue-status grids, excluded from Team Workload. */
const CLOSED_DEPARTMENT_STATUSES = new Set([
  "BC NOT NEEDED",
  "BC COMPLETED",
  "CM NOT NEEDED",
  "CM COMPLETED",
  "SUPPORT RESOLVED",
]);

const CATEGORY_TO_DEPARTMENT: Record<
  StatusGuideItem["category"],
  DepartmentStatus["department"]
> = {
  dispute: "Dispute",
  support: "Support",
  bureau: "Bureau Calling",
  complaints: "Complaints",
  onboarding: "Onboarding",
};

const guideFor = (category: StatusGuideItem["category"]) =>
  CREDIT_OPS_STATUS_GUIDE.filter((item) => item.category === category);

/* Dot colours for breakdown rows, by position — a palette, not a meaning. */
const DOT_PALETTE = [
  "bg-amber-500",
  "bg-emerald-500",
  "bg-purple-500",
  "bg-red-500",
  "bg-pink-500",
  "bg-blue-500",
  "bg-red-600",
  "bg-emerald-600",
  "bg-indigo-500",
];

export function CreditOpsDashboardView({
  selectedScope,
  partnerName: partnerNameProp,
  onNavigateToView,
}: CreditOpsDashboardViewProps) {
  const store = useCreditOpsStore();
  const partnerName =
    partnerNameProp ?? getPartnerByScope(selectedScope)?.name ?? "Partner";

  const scopedClients = useMemo(
    () =>
      store.clients.filter(
        (c) =>
          selectedScope === "all" ||
          c.organizationId === selectedScope ||
          c.outsourcingGroupId === selectedScope,
      ),
    [store.clients, selectedScope],
  );

  const activeClients = useMemo(
    () => scopedClients.filter((c) => !INACTIVE_STATUSES.includes(c.status)),
    [scopedClients],
  );

  /* (department, status) → count, over the active clients' department rows. */
  const departmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const client of activeClients) {
      for (const row of store.getDepartmentStatuses(client.id)) {
        const key = `${row.department}::${row.status}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return counts;
  }, [activeClients, store]);

  const countFor = (department: DepartmentStatus["department"], status: string) =>
    departmentCounts.get(`${department}::${status}`) ?? 0;

  const openFilesFor = (department: DepartmentStatus["department"]) => {
    let total = 0;
    for (const [key, n] of departmentCounts) {
      const [dept, status] = key.split("::");
      if (dept === department && !CLOSED_DEPARTMENT_STATUSES.has(status)) total += n;
    }
    return total;
  };

  const byClientStatus = (statuses: string[]) =>
    activeClients.filter((c) => statuses.includes(c.status)).length;

  // Pipeline (client status is the Dispute department's status)
  const disputeActive = activeClients.length;
  const readyRound1 = byClientStatus(["Ready for Round 1", "NEW ONBOARDING", "Onboarding"]);
  const readyProcessing = byClientStatus(["Ready for Processing", "In Processing", "Ready for QA"]);
  const roundSent = byClientStatus(["In Dispute", "Awaiting Response"]);

  const supportGuide = guideFor("support");
  const supportOpen = openFilesFor("Support");

  const overdue7 = activeClients.filter(
    (c) => c.slaHoursRemaining !== undefined && c.slaHoursRemaining <= 24,
  ).length;
  const critical30 = activeClients.filter(
    (c) => c.slaHoursRemaining !== undefined && c.slaHoursRemaining <= 4,
  ).length;
  const bureauCount = countFor("Bureau Calling", "BC NEEDED") + countFor("Bureau Calling", "BC IN PROGRESS");
  const archivedCount = scopedClients.length - activeClients.length;

  const workload: { label: string; department: DepartmentStatus["department"]; color: string }[] = [
    { label: "DISPUTE", department: "Dispute", color: "bg-emerald-500" },
    { label: "SUPPORT", department: "Support", color: "bg-blue-500" },
    { label: "COMPLAINTS", department: "Complaints", color: "bg-purple-500" },
    { label: "BUREAU", department: "Bureau Calling", color: "bg-indigo-500" },
  ];
  const workloadMax = Math.max(1, ...workload.map((w) => openFilesFor(w.department)));

  /* Escalation: files the queue rules already treat as critical. */
  const escalations = activeClients.filter(
    (c) =>
      c.status === "Attention" ||
      c.status === "ESCALATED TO MANAGEMENT" ||
      (c.slaHoursRemaining !== undefined && c.slaHoursRemaining <= 0),
  );

  const kpi = (
    label: string,
    value: number,
    icon: React.ReactNode,
    view: string,
    valueClass = "text-foreground",
  ) => (
    <div
      onClick={() => onNavigateToView?.(view)}
      className="cursor-pointer rounded-xl border border-border bg-card p-3.5 shadow-sm transition-all hover:border-primary/50"
    >
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px] font-extrabold uppercase tracking-wider">{label}</span>
      </div>
      <p className={cn("mt-1 text-2xl font-black", valueClass)}>{value}</p>
    </div>
  );

  const statusGrid = (
    title: string,
    icon: string,
    view: string,
    department: DepartmentStatus["department"],
    items: StatusGuideItem[],
    columns: string,
    hoverClass: string,
  ) => (
    <div
      onClick={() => onNavigateToView?.(view)}
      className={cn(
        "cursor-pointer rounded-xl border border-border bg-card p-4 shadow-sm transition-all",
        hoverClass,
      )}
    >
      <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
        <span className="text-xs font-black uppercase tracking-wider text-foreground">
          {icon} {title}
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className={cn("mt-3 grid gap-2", columns)}>
        {items.map((item) => {
          const n = countFor(department, item.code);
          const open = !CLOSED_DEPARTMENT_STATUSES.has(item.code) && n > 0;
          return (
            <div key={item.code} className="rounded-lg border border-border/80 bg-muted/20 p-2.5">
              <p
                className={cn(
                  "text-[10px] font-extrabold uppercase",
                  open ? "text-status-warning" : "text-muted-foreground",
                )}
              >
                {item.name}
              </p>
              <p
                className={cn(
                  "mt-1 text-xl font-black",
                  open ? "text-status-warning" : "text-foreground",
                )}
              >
                {n}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-5 text-xs text-foreground">
      {/* Top Banner */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="font-bold uppercase tracking-wide text-foreground">📁 {partnerName}</span>
          <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-extrabold text-status-warning">
            {activeClients.length} clients in scope
          </span>
        </div>
      </div>

      {/* Top KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpi("Total Active", activeClients.length, <Users className="h-4 w-4 text-status-success" />, "main-list")}
        {kpi("Overdue (7+)", overdue7, <AlertTriangle className="h-4 w-4 text-status-warning" />, "escalation-queue", overdue7 > 0 ? "text-status-warning" : "text-foreground")}
        {kpi("Critical (30+)", critical30, <ShieldAlert className="h-4 w-4 text-status-danger" />, "escalation-queue", critical30 > 0 ? "text-status-danger" : "text-foreground")}
        {kpi("Support Open", supportOpen, <HelpCircle className="h-4 w-4 text-status-info" />, "support-queue")}
        {kpi("Bureau Queue", bureauCount, <Phone className="h-4 w-4 text-status-info" />, "bureau-queue")}
        {kpi("Archived", archivedCount, <Users className="h-4 w-4 text-muted-foreground" />, "main-list", "text-muted-foreground")}
      </div>

      {/* Main Grid — Dispute Processing & Client Success */}
      <div className="grid gap-4 md:grid-cols-2">
        <div
          onClick={() => onNavigateToView?.("dispute-queue")}
          className="cursor-pointer rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-emerald-500/50"
        >
          <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
            <span className="text-xs font-black uppercase tracking-wider text-foreground">
              📝 DISPUTE PROCESSING — CLIENT PIPELINE
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row">
            <div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full border-8 border-emerald-500/20 bg-muted/20">
              <div className="text-center">
                <p className="text-2xl font-black text-foreground">{disputeActive}</p>
                <p className="text-[9px] font-extrabold uppercase text-muted-foreground">ACTIVE</p>
              </div>
            </div>
            <div className="w-full flex-1 space-y-2.5 text-xs">
              {[
                { label: "READY FOR ROUND 1", n: readyRound1, dot: "bg-amber-500", pill: "bg-amber-500/20 text-status-warning" },
                { label: "READY FOR PROCESSING", n: readyProcessing, dot: "bg-emerald-500", pill: "bg-emerald-500/20 text-status-success" },
                { label: "ROUND SENT - AWAITING RESULTS", n: roundSent, dot: "bg-blue-500", pill: "bg-blue-500/20 text-status-info" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", row.dot)} />
                    <span className="font-semibold text-foreground">{row.label}</span>
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-black", row.pill)}>{row.n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          onClick={() => onNavigateToView?.("support-queue")}
          className="cursor-pointer rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-blue-500/50"
        >
          <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
            <span className="text-xs font-black uppercase tracking-wider text-foreground">
              💛 CLIENT SUCCESS — SUPPORT QUEUE
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row">
            <div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full border-8 border-blue-500/20 bg-muted/20">
              <div className="text-center">
                <p className="text-2xl font-black text-foreground">{supportOpen}</p>
                <p className="text-[9px] font-extrabold uppercase text-muted-foreground">OPEN</p>
              </div>
            </div>
            <div className="max-h-36 w-full flex-1 space-y-1.5 overflow-y-auto pr-1 text-xs">
              {supportGuide.map((item, i) => (
                <div key={item.code} className="flex items-center justify-between rounded bg-muted/30 px-2.5 py-1">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", DOT_PALETTE[i % DOT_PALETTE.length])} />
                    <span className="text-[11px] font-bold text-foreground">{item.name}</span>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-black text-foreground">
                    {countFor("Support", item.code)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bureau Calling & Complaints & Mailing */}
      <div className="grid gap-4 md:grid-cols-2">
        {statusGrid("BUREAU CALLING — QUEUE STATUS", "📞", "bureau-queue", "Bureau Calling", guideFor("bureau"), "grid-cols-2", "hover:border-indigo-500/50")}
        {statusGrid("COMPLAINTS & MAILING — QUEUE STATUS", "📬", "complaints-queue", "Complaints", guideFor("complaints"), "grid-cols-3", "hover:border-purple-500/50")}
      </div>

      {/* Onboarding & Team Workload */}
      <div className="grid gap-4 md:grid-cols-2">
        {statusGrid("ONBOARDING — QUEUE STATUS", "📋", "onboarding-queue", "Onboarding", guideFor("onboarding"), "grid-cols-2 sm:grid-cols-4", "hover:border-amber-500/50")}

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
            <span className="text-xs font-black uppercase tracking-wider text-foreground">
              👥 TEAM WORKLOAD — FILES PER DEPARTMENT
            </span>
            <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="mt-3 space-y-3">
            {workload.map((w) => {
              const n = openFilesFor(w.department);
              return (
                <div key={w.department}>
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span className="text-foreground">{w.label}</span>
                    <span className="text-muted-foreground">{n}</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full transition-all", w.color)}
                      style={{ width: `${Math.round((n / workloadMax) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Auto-Escalation Banner */}
      <div
        className={cn(
          "flex items-start gap-3 rounded-xl border p-4 shadow-sm",
          escalations.length > 0
            ? "border-red-500/40 bg-red-500/5"
            : "border-emerald-500/30 bg-emerald-500/5",
        )}
      >
        <ShieldAlert
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            escalations.length > 0 ? "text-status-danger" : "text-status-success",
          )}
        />
        <div className="text-xs">
          <p className="font-black uppercase tracking-wider text-foreground">
            AUTO-ESCALATION SUGGESTIONS — CLIENT ISSUE &gt; 5 DAYS
          </p>
          {escalations.length > 0 ? (
            <p className="mt-1 text-foreground">
              {escalations.length} file{escalations.length === 1 ? "" : "s"} need management attention:{" "}
              {escalations.slice(0, 5).map((c) => c.name).join(", ")}
              {escalations.length > 5 ? "…" : ""}
            </p>
          ) : (
            <p className="mt-1 text-muted-foreground">
              All open issues are currently within safe SLA thresholds.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
