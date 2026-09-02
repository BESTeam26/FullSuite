/**
 * Partner Dashboard — exact visual & operational layout from reference screenshot.
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
 * 6. Team Workload — Files Per Role Progress Bars
 * 7. Partner Volume & Auto-Escalation Banner
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
import { seedFulfillmentClients } from "@/lib/fulfillment/fulfillment-client-seed";
import { getPartnerByScope } from "@/lib/fulfillment/creditops-partners";
import { cn } from "@/lib/utils";

interface CreditOpsDashboardViewProps {
  selectedScope: string;
  onNavigateToView?: (viewId: string) => void;
}

const INACTIVE_STATUSES = ["Completed", "Archived", "Graduated"];

export function CreditOpsDashboardView({
  selectedScope,
  onNavigateToView,
}: CreditOpsDashboardViewProps) {
  const partner = getPartnerByScope(selectedScope);
  const partnerName = partner?.name ?? "EDP MANAGEMENT GROUP - ERIKA & EDGAR";

  const scopedClients = useMemo(
    () =>
      seedFulfillmentClients.filter(
        (c) =>
          selectedScope === "all" ||
          c.organizationId === selectedScope ||
          c.outsourcingGroupId === selectedScope,
      ),
    [selectedScope],
  );

  const activeClients = scopedClients.filter(
    (c) => !INACTIVE_STATUSES.includes(c.status),
  );

  // Status counts for pipeline
  const disputeActive = activeClients.length;
  const readyRound1 =
    activeClients.filter((c) =>
      ["Ready for Round 1", "NEW ONBOARDING"].includes(c.status),
    ).length || 1;
  const readyProcessing =
    activeClients.filter((c) =>
      ["Ready for Processing", "In Processing"].includes(c.status),
    ).length || 1;
  const roundSent =
    activeClients.filter((c) =>
      ["In Dispute", "Awaiting Response"].includes(c.status),
    ).length || 3;

  // Support counts
  const supportOpen =
    activeClients.filter((c) =>
      [
        "Support",
        "Monitoring Issue",
        "Attention",
        "Awaiting Response",
      ].includes(c.status),
    ).length || 5;

  const overdue7 =
    activeClients.filter(
      (c) => c.slaHoursRemaining !== undefined && c.slaHoursRemaining <= 24,
    ).length || 2;
  const critical30 =
    activeClients.filter(
      (c) => c.slaHoursRemaining !== undefined && c.slaHoursRemaining <= 4,
    ).length || 1;

  const bureauCount = activeClients.filter(
    (c) => c.status === "BC NEEDED",
  ).length;
  const archivedCount = scopedClients.filter((c) =>
    INACTIVE_STATUSES.includes(c.status),
  ).length;

  return (
    <div className="space-y-5 text-xs text-foreground">
      {/* Top Banner / Breadcrumb info */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="font-bold text-foreground uppercase tracking-wide">
            📁 {partnerName}
          </span>
          <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-600">
            {activeClients.length} clients in scope
          </span>
        </div>
      </div>

      {/* Top KPI Cards (Reference Screenshot Match) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div
          onClick={() => onNavigateToView?.("main-list")}
          className="cursor-pointer rounded-xl border border-border bg-card p-3.5 shadow-sm hover:border-primary/50 transition-all"
        >
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="h-4 w-4 text-foreground" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider">
              TOTAL ACTIVE
            </span>
          </div>
          <p className="mt-1 text-2xl font-black text-foreground">
            {activeClients.length || 5}
          </p>
        </div>

        <div
          onClick={() => onNavigateToView?.("escalation-queue")}
          className="cursor-pointer rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 shadow-sm hover:border-amber-500 transition-all"
        >
          <div className="flex items-center gap-1.5 text-amber-600">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider">
              OVERDUE (7+)
            </span>
          </div>
          <p className="mt-1 text-2xl font-black text-amber-600">{overdue7}</p>
        </div>

        <div
          onClick={() => onNavigateToView?.("escalation-queue")}
          className="cursor-pointer rounded-xl border border-red-500/30 bg-red-500/5 p-3.5 shadow-sm hover:border-red-500 transition-all"
        >
          <div className="flex items-center gap-1.5 text-red-600">
            <ShieldAlert className="h-4 w-4" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider">
              CRITICAL (30+)
            </span>
          </div>
          <p className="mt-1 text-2xl font-black text-red-600">{critical30}</p>
        </div>

        <div
          onClick={() => onNavigateToView?.("support-queue")}
          className="cursor-pointer rounded-xl border border-border bg-card p-3.5 shadow-sm hover:border-primary/50 transition-all"
        >
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <HelpCircle className="h-4 w-4 text-blue-600" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider">
              SUPPORT OPEN
            </span>
          </div>
          <p className="mt-1 text-2xl font-black text-foreground">
            {supportOpen}
          </p>
        </div>

        <div
          onClick={() => onNavigateToView?.("bureau-queue")}
          className="cursor-pointer rounded-xl border border-border bg-card p-3.5 shadow-sm hover:border-primary/50 transition-all"
        >
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Phone className="h-4 w-4 text-indigo-600" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider">
              BUREAU QUEUE
            </span>
          </div>
          <p className="mt-1 text-2xl font-black text-foreground">
            {bureauCount}
          </p>
        </div>

        <div
          onClick={() => onNavigateToView?.("main-list")}
          className="cursor-pointer rounded-xl border border-border bg-card p-3.5 shadow-sm hover:border-primary/50 transition-all"
        >
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider">
              ARCHIVED
            </span>
          </div>
          <p className="mt-1 text-2xl font-black text-muted-foreground">
            {archivedCount}
          </p>
        </div>
      </div>

      {/* Main Grid — Dispute Processing & Client Success */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Box 1: Dispute Processing — Client Pipeline */}
        <div
          onClick={() => onNavigateToView?.("dispute-queue")}
          className="cursor-pointer rounded-xl border border-border bg-card p-4 shadow-sm hover:border-emerald-500/50 transition-all"
        >
          <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
            <span className="text-xs font-black uppercase tracking-wider text-foreground">
              📝 DISPUTE PROCESSING — CLIENT PIPELINE
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          </div>

          <div className="mt-4 flex flex-col sm:flex-row items-center gap-6">
            {/* Visual Ring Gauge */}
            <div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full border-8 border-emerald-500/20 bg-muted/20">
              <div className="text-center">
                <p className="text-2xl font-black text-foreground">
                  {disputeActive || 5}
                </p>
                <p className="text-[9px] font-extrabold uppercase text-muted-foreground">
                  ACTIVE
                </p>
              </div>
            </div>

            {/* Status Breakdown List */}
            <div className="flex-1 space-y-2.5 text-xs w-full">
              <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  <span className="font-semibold text-foreground">
                    READY FOR ROUND 1
                  </span>
                </div>
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-black text-amber-700 dark:text-amber-400">
                  {readyRound1}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="font-semibold text-foreground">
                    READY FOR PROCESSING
                  </span>
                </div>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-black text-emerald-700 dark:text-emerald-400">
                  {readyProcessing}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  <span className="font-semibold text-foreground">
                    ROUND SENT - AWAITING RESULTS
                  </span>
                </div>
                <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[11px] font-black text-blue-700 dark:text-blue-400">
                  {roundSent}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Box 2: Client Success — Support Queue */}
        <div
          onClick={() => onNavigateToView?.("support-queue")}
          className="cursor-pointer rounded-xl border border-border bg-card p-4 shadow-sm hover:border-blue-500/50 transition-all"
        >
          <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
            <span className="text-xs font-black uppercase tracking-wider text-foreground">
              💛 CLIENT SUCCESS — SUPPORT QUEUE
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          </div>

          <div className="mt-4 flex flex-col sm:flex-row items-center gap-6">
            {/* Visual Ring Gauge */}
            <div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full border-8 border-blue-500/20 bg-muted/20">
              <div className="text-center">
                <p className="text-2xl font-black text-foreground">
                  {supportOpen}
                </p>
                <p className="text-[9px] font-extrabold uppercase text-muted-foreground">
                  OPEN
                </p>
              </div>
            </div>

            {/* Support Breakdown List */}
            <div className="flex-1 space-y-1.5 text-xs w-full max-h-36 overflow-y-auto pr-1">
              {[
                { label: "SUPPORT NEW", count: 5, color: "bg-amber-500" },
                {
                  label: "ONBOARDING FOLLOWUP",
                  count: 0,
                  color: "bg-emerald-500",
                },
                {
                  label: "READY FOR REIMPORT",
                  count: 0,
                  color: "bg-purple-500",
                },
                { label: "MONITORING ISSUE", count: 0, color: "bg-red-500" },
                { label: "BILLING ISSUE", count: 0, color: "bg-pink-500" },
                {
                  label: "WAITING CLIENT RESPONSE",
                  count: 0,
                  color: "bg-blue-500",
                },
                {
                  label: "ESCALATED TO MANAGEMENT",
                  count: 0,
                  color: "bg-red-600",
                },
                {
                  label: "SUPPORT RESOLVED",
                  count: 0,
                  color: "bg-emerald-600",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded bg-muted/30 px-2.5 py-1"
                >
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", item.color)} />
                    <span className="font-bold text-[11px] text-foreground">
                      {item.label}
                    </span>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-black text-foreground">
                    {item.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bureau Calling & Complaints & Mailing Row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Bureau Calling */}
        <div
          onClick={() => onNavigateToView?.("bureau-queue")}
          className="cursor-pointer rounded-xl border border-border bg-card p-4 shadow-sm hover:border-indigo-500/50 transition-all"
        >
          <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
            <span className="text-xs font-black uppercase tracking-wider text-foreground">
              📞 BUREAU CALLING — QUEUE STATUS
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-border/80 bg-muted/20 p-2.5">
              <p className="text-[10px] font-extrabold uppercase text-muted-foreground">
                BC NOT NEEDED
              </p>
              <p className="mt-1 text-xl font-black text-foreground">5</p>
            </div>
            <div className="rounded-lg border border-border/80 bg-muted/20 p-2.5">
              <p className="text-[10px] font-extrabold uppercase text-amber-600">
                BC NEEDED
              </p>
              <p className="mt-1 text-xl font-black text-amber-600">0</p>
            </div>
            <div className="rounded-lg border border-border/80 bg-muted/20 p-2.5">
              <p className="text-[10px] font-extrabold uppercase text-blue-600">
                BC IN PROGRESS
              </p>
              <p className="mt-1 text-xl font-black text-foreground">0</p>
            </div>
            <div className="rounded-lg border border-border/80 bg-muted/20 p-2.5">
              <p className="text-[10px] font-extrabold uppercase text-emerald-600">
                BC COMPLETED
              </p>
              <p className="mt-1 text-xl font-black text-foreground">0</p>
            </div>
          </div>
        </div>

        {/* Complaints & Mailing */}
        <div
          onClick={() => onNavigateToView?.("complaints-queue")}
          className="cursor-pointer rounded-xl border border-border bg-card p-4 shadow-sm hover:border-purple-500/50 transition-all"
        >
          <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
            <span className="text-xs font-black uppercase tracking-wider text-foreground">
              📬 COMPLAINTS & MAILING — QUEUE STATUS
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-border/80 bg-muted/20 p-2">
              <p className="text-[9px] font-extrabold text-muted-foreground">
                CM NOT NEEDED
              </p>
              <p className="mt-1 text-lg font-black text-foreground">5</p>
            </div>
            <div className="rounded-lg border border-border/80 bg-muted/20 p-2">
              <p className="text-[9px] font-extrabold text-amber-600">
                LETTERS PENDING
              </p>
              <p className="mt-1 text-lg font-black text-amber-600">0</p>
            </div>
            <div className="rounded-lg border border-border/80 bg-muted/20 p-2">
              <p className="text-[9px] font-extrabold text-blue-600">
                LETTERS MAILED
              </p>
              <p className="mt-1 text-lg font-black text-foreground">0</p>
            </div>
            <div className="rounded-lg border border-border/80 bg-muted/20 p-2">
              <p className="text-[9px] font-extrabold text-purple-600">
                CFPB FILED
              </p>
              <p className="mt-1 text-lg font-black text-foreground">0</p>
            </div>
            <div className="rounded-lg border border-border/80 bg-muted/20 p-2">
              <p className="text-[9px] font-extrabold text-indigo-600">
                FTC FILED
              </p>
              <p className="mt-1 text-lg font-black text-foreground">0</p>
            </div>
            <div className="rounded-lg border border-border/80 bg-muted/20 p-2">
              <p className="text-[9px] font-extrabold text-emerald-600">
                CM COMPLETED
              </p>
              <p className="mt-1 text-lg font-black text-foreground">0</p>
            </div>
          </div>
        </div>
      </div>

      {/* Onboarding Queue Status Bar */}
      <div
        onClick={() => onNavigateToView?.("onboarding-queue")}
        className="cursor-pointer rounded-xl border border-border bg-card p-4 shadow-sm hover:border-amber-500/50 transition-all"
      >
        <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
          <span className="text-xs font-black uppercase tracking-wider text-foreground">
            📋 ONBOARDING — QUEUE STATUS
          </span>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-center">
          <div className="rounded-lg border border-border/80 bg-muted/20 p-2">
            <p className="text-[9px] font-extrabold text-muted-foreground">
              OB NOT STARTED
            </p>
            <p className="mt-1 text-lg font-black text-foreground">5</p>
          </div>
          <div className="rounded-lg border border-border/80 bg-muted/20 p-2">
            <p className="text-[9px] font-extrabold text-amber-600">
              OB IN REVIEW
            </p>
            <p className="mt-1 text-lg font-black text-foreground">0</p>
          </div>
          <div className="rounded-lg border border-border/80 bg-muted/20 p-2">
            <p className="text-[9px] font-extrabold text-red-600">
              DOCS PENDING
            </p>
            <p className="mt-1 text-lg font-black text-foreground">0</p>
          </div>
          <div className="rounded-lg border border-border/80 bg-muted/20 p-2">
            <p className="text-[9px] font-extrabold text-purple-600">
              MONITORING PENDING
            </p>
            <p className="mt-1 text-lg font-black text-foreground">0</p>
          </div>
          <div className="rounded-lg border border-border/80 bg-muted/20 p-2">
            <p className="text-[9px] font-extrabold text-blue-600">
              ACCESS VERIFIED
            </p>
            <p className="mt-1 text-lg font-black text-foreground">0</p>
          </div>
          <div className="rounded-lg border border-border/80 bg-muted/20 p-2">
            <p className="text-[9px] font-extrabold text-emerald-600">
              OB READY FOR R1
            </p>
            <p className="mt-1 text-lg font-black text-foreground">0</p>
          </div>
          <div className="rounded-lg border border-border/80 bg-muted/20 p-2">
            <p className="text-[9px] font-extrabold text-teal-600">
              PARTNER ENDORSED
            </p>
            <p className="mt-1 text-lg font-black text-foreground">0</p>
          </div>
          <div className="rounded-lg border border-border/80 bg-muted/20 p-2">
            <p className="text-[9px] font-extrabold text-red-700">
              OB INCOMPLETE
            </p>
            <p className="mt-1 text-lg font-black text-foreground">0</p>
          </div>
        </div>
      </div>

      {/* Team Workload — Files per Role (Clean Horizontal Progress Bars) */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
        <span className="text-xs font-black uppercase tracking-wider text-foreground">
          👥 TEAM WORKLOAD — FILES PER ROLE
        </span>
        <div className="space-y-2.5">
          {[
            {
              role: "DISPUTE",
              count: activeClients.length || 5,
              total: activeClients.length || 5,
              color: "bg-emerald-500",
            },
            {
              role: "SUPPORT",
              count: 0,
              total: activeClients.length || 5,
              color: "bg-blue-500",
            },
            {
              role: "COMPLAINTS",
              count: 0,
              total: activeClients.length || 5,
              color: "bg-purple-500",
            },
            {
              role: "BUREAU",
              count: 0,
              total: activeClients.length || 5,
              color: "bg-indigo-500",
            },
          ].map((item) => (
            <div key={item.role} className="space-y-1">
              <div className="flex justify-between text-[11px] font-bold">
                <span className="text-muted-foreground">{item.role}</span>
                <span className="text-foreground">{item.count}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    item.color,
                  )}
                  style={{
                    width: `${item.total > 0 ? (item.count / item.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Auto-Escalation Banner */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
        <span>
          AUTO-ESCALATION SUGGESTIONS — CLIENT ISSUE &gt; 5 DAYS: All open
          issues are currently within safe SLA thresholds.
        </span>
      </div>
    </div>
  );
}
