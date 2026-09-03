/**
 * OpsManagementDashboard — the cross-partner management view shared by every
 * Managed Operations division.
 *
 * Aggregates authorized clients across all Partner groups. This sits above the
 * individual Partner workspaces.
 *
 * Purely presentational: the owning division computes its own KPIs and metric
 * rows (see lib/fulfillment/ops-management-metrics) and passes them in, so this
 * component never reaches into a division store or re-derives a business rule.
 */

import type { ElementType, ReactNode } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type {
  OpsClient,
  OpsPartner,
} from "@/lib/fulfillment/ops-client-domain";
import { clientGroupLabel } from "@/lib/fulfillment/ops-client-domain";
import type { OpsActivityEntry } from "@/lib/fulfillment/ops-activity-domain";
import type {
  PartnerHealthRow,
  TeamWorkloadRow,
} from "@/lib/fulfillment/ops-management-metrics";
import { cn } from "@/lib/utils";

export interface OpsKpi {
  label: string;
  value: number | string;
  icon: ElementType;
  tone: string;
  /** View this KPI drills into, or null when it is display-only. */
  view: string | null;
}

interface OpsManagementDashboardProps<
  T extends OpsClient,
  P extends OpsPartner,
> {
  /** e.g. "📊 CREDITOPS MANAGEMENT DASHBOARD" */
  title: ReactNode;
  /** e.g. "🕘 RECENT CREDITOPS ACTIVITY" */
  activityTitle: ReactNode;
  activeCount: number;
  kpis: OpsKpi[];
  partnerHealth: PartnerHealthRow<P>[];
  teamWorkload: TeamWorkloadRow[];
  needsAttention: T[];
  recentActivity: OpsActivityEntry[];
  allClients: T[];
  /**
   * Whether the Partner Health table shows an Escalations column. CreditOps
   * tracks escalations; FundingOps has no equivalent and omits the column.
   */
  showEscalations: boolean;
  /** Human label for a partner's group, e.g. "Managed Ops". */
  groupLabel: (group: string) => string;
  /** Partner display name for a client's scope, if one resolves. */
  resolvePartnerName: (client: T) => string | undefined;
  onNavigateToView?: (view: string) => void;
  onOpenClient?: (clientId: string) => void;
}

export function OpsManagementDashboard<
  T extends OpsClient,
  P extends OpsPartner,
>({
  title,
  activityTitle,
  activeCount,
  kpis,
  partnerHealth,
  teamWorkload,
  needsAttention,
  recentActivity,
  allClients,
  showEscalations,
  groupLabel,
  resolvePartnerName,
  onNavigateToView,
  onOpenClient,
}: OpsManagementDashboardProps<T, P>) {
  return (
    <div className="space-y-5 text-xs text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="font-bold uppercase tracking-wide text-foreground">
            {title}
          </span>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-extrabold text-primary">
            All Partners · {activeCount} active clients
          </span>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <div
            key={k.label}
            onClick={() => k.view && onNavigateToView?.(k.view)}
            className={cn(
              "rounded-xl border border-border bg-card p-3.5 shadow-sm transition-all",
              k.view && "cursor-pointer hover:border-primary/50",
            )}
          >
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <k.icon className={cn("h-4 w-4", k.tone)} />
              <span className="text-[10px] font-extrabold uppercase tracking-wider">
                {k.label}
              </span>
            </div>
            <p className={cn("mt-1 text-2xl font-black", k.tone)}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Partner Health */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
          <span className="text-xs font-black uppercase tracking-wider text-foreground">
            🏢 PARTNER HEALTH
          </span>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                {[
                  "Partner",
                  "Group",
                  "Active Clients",
                  "Overdue",
                  ...(showEscalations ? ["Escalations"] : []),
                  "SLA Risk",
                  "Health",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-left font-bold text-muted-foreground whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {partnerHealth.map((row) => (
                <tr key={row.partner.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 font-semibold text-foreground">
                    {row.partner.name}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {groupLabel(row.partner.group)}
                  </td>
                  <td className="px-3 py-2 text-foreground">
                    {row.activeCount}
                  </td>
                  <td className="px-3 py-2 text-foreground">{row.overdue}</td>
                  {showEscalations && (
                    <td className="px-3 py-2 text-foreground">
                      {row.escalations}
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold",
                        row.slaRisk
                          ? "bg-red-500/10 text-red-700"
                          : "bg-emerald-500/10 text-status-success",
                      )}
                    >
                      {row.slaRisk ? "At Risk" : "Clear"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold",
                        row.health === "Healthy"
                          ? "bg-emerald-500/10 text-status-success"
                          : "bg-amber-500/10 text-status-warning",
                      )}
                    >
                      {row.health}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Team Workload */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
            <span className="text-xs font-black uppercase tracking-wider text-foreground">
              👥 TEAM WORKLOAD
            </span>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr>
                  {[
                    "Agent",
                    "Open Work",
                    "Due Today",
                    "Overdue",
                    "Partners",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left font-bold text-muted-foreground whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {teamWorkload.map((row) => (
                  <tr key={row.agent} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-semibold text-foreground">
                      {row.agent}
                    </td>
                    <td className="px-3 py-2 text-foreground">{row.open}</td>
                    <td className="px-3 py-2 text-status-warning">
                      {row.dueToday}
                    </td>
                    <td className="px-3 py-2 text-status-danger">
                      {row.overdue}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.partners.length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Needs Attention */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
            <span className="text-xs font-black uppercase tracking-wider text-foreground">
              ⚠️ NEEDS ATTENTION
            </span>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr>
                  {["Client", "Partner", "Issue", "SLA", "Action"].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left font-bold text-muted-foreground whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {needsAttention.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-4 text-center text-muted-foreground"
                    >
                      No items need attention.
                    </td>
                  </tr>
                ) : (
                  needsAttention.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-semibold text-foreground">
                        {c.name}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {resolvePartnerName(c) ?? clientGroupLabel(c)}
                      </td>
                      <td className="px-3 py-2 text-foreground">{c.status}</td>
                      <td className="px-3 py-2 text-status-danger">
                        {c.slaHoursRemaining !== undefined
                          ? `${c.slaHoursRemaining}h`
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => onOpenClient?.(c.id)}
                          className="rounded-md bg-primary px-2.5 py-1 text-[10px] font-bold text-primary-foreground hover:opacity-90"
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
          <span className="text-xs font-black uppercase tracking-wider text-foreground">
            {activityTitle}
          </span>
        </div>
        <div className="mt-3 space-y-2">
          {recentActivity.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No recent activity across Partners.
            </p>
          ) : (
            recentActivity.map((a) => {
              const client = allClients.find((c) => c.id === a.clientId);
              return (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-status-success" />
                    <span className="font-semibold text-foreground">
                      {a.action}
                    </span>
                    <span className="text-muted-foreground">{a.detail}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span>{client?.name ?? a.clientId}</span>
                    <span>{client ? clientGroupLabel(client) : ""}</span>
                    <span>{new Date(a.timestamp).toLocaleString()}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
