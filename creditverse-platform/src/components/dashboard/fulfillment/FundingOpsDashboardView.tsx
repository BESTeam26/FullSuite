/**
 * FundingOps Partner Dashboard — funding-domain KPIs + pipeline.
 *
 * Header Stats: Total Active | Overdue (SLA<24h) | Critical (SLA<8h) | Stips Open | Submitted | Funded
 * Sections: Funding Pipeline (gauge + stage breakdown), Attention Items, Team Workload.
 */

import { useMemo } from "react";
import {
  Users,
  AlertTriangle,
  ShieldAlert,
  FileText,
  Send,
  DollarSign,
  ArrowRight,
} from "lucide-react";
import { useFundingOpsStore } from "@/lib/fulfillment/fundingops-client-store";
import { useAllFundingFiles } from "@/lib/data/use-funding";
import { getFundingPartnerByScope } from "@/lib/fulfillment/fundingops-partners";
import {
  isActiveFunding,
  formatCurrency,
} from "@/lib/fulfillment/fundingops-domain";
import { stagesForDepartment } from "@/lib/funding/pipeline-stages";
import { cn } from "@/lib/utils";

interface Props {
  selectedScope: string;
  /** Display name of the Company/Partner whose records are in scope. */
  partnerName?: string;
  onNavigateToView?: (viewId: string) => void;
}

/**
 * Every figure derives from the store's client rows and the funding files the
 * data layer returns for them — the same records the Deal List and queues
 * show, scoped to `selectedScope`. The seed arrays used to be read directly,
 * so a live Partner's dashboard described sample clients (rule 12).
 */
export function FundingOpsDashboardView({
  selectedScope,
  partnerName: partnerNameProp,
  onNavigateToView,
}: Props) {
  const store = useFundingOpsStore();
  const files = useAllFundingFiles();
  const partnerName =
    partnerNameProp ??
    getFundingPartnerByScope(selectedScope)?.name ??
    "FundingOps Partner";

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
  const scopedFiles = useMemo(
    () =>
      files.data.filter((f) => scopedClients.some((c) => c.id === f.clientId)),
    [files.data, scopedClients],
  );

  const activeClients = scopedClients.filter((c) => isActiveFunding(c.status));

  const overdue = activeClients.filter(
    (c) => c.slaHoursRemaining !== undefined && c.slaHoursRemaining <= 24,
  ).length;
  const critical = activeClients.filter(
    (c) => c.slaHoursRemaining !== undefined && c.slaHoursRemaining <= 8,
  ).length;
  const stipsOpen = scopedFiles.filter(
    (f) => (stagesForDepartment("Stipulations") as string[]).includes(f.stage),
  ).length;
  const submitted = scopedFiles.filter((f) => (stagesForDepartment("Submissions") as string[]).includes(f.stage)).length;
  const funded = scopedFiles.filter((f) => f.stage === "Funded").length;

  const totalRequested = activeClients.reduce(
    (sum, c) => sum + (c.totalRequested ?? 0),
    0,
  );

  // Files per department queue — the seven departments over the 17-stage spine (pipeline-stages.ts).
  const stageBreakdown = ([
    ["Readiness Review", "READINESS REVIEW", "bg-amber-500"],
    ["Document Review", "DOCUMENT REVIEW", "bg-blue-500"],
    ["Lender Matching", "LENDER MATCHING", "bg-indigo-500"],
    ["Submissions", "SUBMISSIONS", "bg-sky-500"],
    ["Stipulations", "STIPULATIONS", "bg-amber-600"],
    ["Offers", "OFFERS", "bg-purple-500"],
    ["Funded Deals", "FUNDED", "bg-emerald-500"],
  ] as const).map(([department, label, color]) => ({
    label,
    color,
    count: scopedFiles.filter((f) => (stagesForDepartment(department) as string[]).includes(f.stage)).length,
  }));

  return (
    <div className="space-y-5 text-xs text-foreground">
      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="font-bold text-foreground uppercase tracking-wide">
            🏦 {partnerName}
          </span>
          <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-extrabold text-status-warning">
            {activeClients.length} clients in scope
          </span>
        </div>
        <span className="text-[11px] font-bold text-status-success">
          {formatCurrency(totalRequested)} requested
        </span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div
          onClick={() => onNavigateToView?.("deal-list")}
          className="cursor-pointer rounded-xl border border-border bg-card p-3.5 shadow-sm hover:border-primary/50 transition-all"
        >
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="h-4 w-4 text-foreground" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider">
              TOTAL ACTIVE
            </span>
          </div>
          <p className="mt-1 text-2xl font-black text-foreground">
            {activeClients.length}
          </p>
        </div>
        <div
          onClick={() => onNavigateToView?.("stipulations")}
          className="cursor-pointer rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 shadow-sm hover:border-amber-500 transition-all"
        >
          <div className="flex items-center gap-1.5 text-status-warning">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider">
              OVERDUE (24H)
            </span>
          </div>
          <p className="mt-1 text-2xl font-black text-status-warning">
            {overdue}
          </p>
        </div>
        <div
          onClick={() => onNavigateToView?.("stipulations")}
          className="cursor-pointer rounded-xl border border-red-500/30 bg-red-500/5 p-3.5 shadow-sm hover:border-red-500 transition-all"
        >
          <div className="flex items-center gap-1.5 text-status-danger">
            <ShieldAlert className="h-4 w-4" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider">
              CRITICAL (8H)
            </span>
          </div>
          <p className="mt-1 text-2xl font-black text-status-danger">
            {critical}
          </p>
        </div>
        <div
          onClick={() => onNavigateToView?.("stipulations")}
          className="cursor-pointer rounded-xl border border-border bg-card p-3.5 shadow-sm hover:border-primary/50 transition-all"
        >
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <FileText className="h-4 w-4 text-status-warning" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider">
              STIPS OPEN
            </span>
          </div>
          <p className="mt-1 text-2xl font-black text-foreground">
            {stipsOpen}
          </p>
        </div>
        <div
          onClick={() => onNavigateToView?.("submissions")}
          className="cursor-pointer rounded-xl border border-border bg-card p-3.5 shadow-sm hover:border-primary/50 transition-all"
        >
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Send className="h-4 w-4 text-status-info" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider">
              SUBMITTED
            </span>
          </div>
          <p className="mt-1 text-2xl font-black text-foreground">
            {submitted}
          </p>
        </div>
        <div
          onClick={() => onNavigateToView?.("funded")}
          className="cursor-pointer rounded-xl border border-border bg-card p-3.5 shadow-sm hover:border-primary/50 transition-all"
        >
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <DollarSign className="h-4 w-4 text-status-success" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider">
              FUNDED
            </span>
          </div>
          <p className="mt-1 text-2xl font-black text-foreground">{funded}</p>
        </div>
      </div>

      {/* Pipeline + Attention */}
      <div className="grid gap-4 md:grid-cols-2">
        <div
          onClick={() => onNavigateToView?.("deal-list")}
          className="cursor-pointer rounded-xl border border-border bg-card p-4 shadow-sm hover:border-emerald-500/50 transition-all"
        >
          <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
            <span className="text-xs font-black uppercase tracking-wider text-foreground">
              💰 FUNDING PIPELINE — STAGE BREAKDOWN
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="mt-4 flex flex-col sm:flex-row items-center gap-6">
            <div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full border-8 border-emerald-500/20 bg-muted/20">
              <div className="text-center">
                <p className="text-2xl font-black text-foreground">
                  {scopedFiles.length}
                </p>
                <p className="text-[9px] font-extrabold uppercase text-muted-foreground">
                  FILES
                </p>
              </div>
            </div>
            <div className="flex-1 space-y-2.5 text-xs w-full">
              {stageBreakdown.map((s) => (
                <div
                  key={s.label}
                  className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", s.color)} />
                    <span className="font-semibold text-foreground">
                      {s.label}
                    </span>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-black text-foreground">
                    {s.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          onClick={() => onNavigateToView?.("stipulations")}
          className="cursor-pointer rounded-xl border border-border bg-card p-4 shadow-sm hover:border-amber-500/50 transition-all"
        >
          <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
            <span className="text-xs font-black uppercase tracking-wider text-foreground">
              ⚠️ ATTENTION ITEMS
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="mt-3 space-y-2">
            {scopedFiles
              .filter(
                (f) =>
                  (stagesForDepartment("Stipulations") as string[]).includes(f.stage) ||
                  (f.slaHoursRemaining !== undefined &&
                    f.slaHoursRemaining <= 8),
              )
              .slice(0, 6)
              .map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <AlertTriangle
                    className={cn(
                      "h-4 w-4",
                      f.slaHoursRemaining !== undefined &&
                        f.slaHoursRemaining <= 8
                        ? "text-status-danger"
                        : "text-status-warning",
                    )}
                  />
                  <span className="text-sm text-foreground">
                    {(stagesForDepartment("Stipulations") as string[]).includes(f.stage)
                      ? `Stipulations outstanding — ${f.businessName}`
                      : `SLA critical — ${f.businessName}`}
                  </span>
                </div>
              ))}
            {scopedFiles.filter(
              (f) =>
                (stagesForDepartment("Stipulations") as string[]).includes(f.stage) ||
                (f.slaHoursRemaining !== undefined && f.slaHoursRemaining <= 8),
            ).length === 0 && (
              <p className="text-sm text-muted-foreground">
                No items needing attention.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
