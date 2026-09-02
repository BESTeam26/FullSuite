/**
 * FundingOps Management Dashboard — cross-partner management layer.
 *
 * Aggregates authorized client/work records from ALL FundingOps Partners across
 * Outsourcing and FundingOps Users. This is the management view above individual
 * Partner workspaces.
 *
 * Same canonical client records — aggregated by query/view only, never duplicated.
 *
 * Mirrors CreditOpsManagementDashboard but uses the funding-domain store.
 */

import { useMemo } from "react";
import {
  Users,
  AlertTriangle,
  ShieldAlert,
  FileText,
  DollarSign,
  CheckCircle2,
  Clock,
  ArrowRight,
  Landmark,
} from "lucide-react";
import { useFundingOpsStore } from "@/lib/fulfillment/fundingops-client-store";
import {
  FUNDING_OPS_PARTNERS,
  getFundingPartnerByScope,
} from "@/lib/fulfillment/fundingops-partners";
import {
  clientGroupLabel,
  formatCurrency,
  isActiveFunding,
} from "@/lib/fulfillment/fundingops-domain";
import { cn } from "@/lib/utils";

interface Props {
  onNavigateToView?: (viewId: string) => void;
  onOpenClient?: (clientId: string) => void;
}

export function FundingOpsManagementDashboard({
  onNavigateToView,
  onOpenClient,
}: Props) {
  const store = useFundingOpsStore();

  const allClients = store.clients;
  const activeClients = allClients.filter((c) => isActiveFunding(c.status));

  const dueToday = activeClients.filter(
    (c) => c.slaHoursRemaining !== undefined && c.slaHoursRemaining <= 24,
  ).length;
  const overdue = activeClients.filter(
    (c) => c.slaHoursRemaining !== undefined && c.slaHoursRemaining <= 8,
  ).length;
  const criticalSLA = overdue;
  const readiness = activeClients.filter((c) =>
    ["Onboarding", "Readiness Review"].includes(c.status),
  ).length;
  const documentReview = activeClients.filter(
    (c) => c.status === "Document Review",
  ).length;
  const lenderMatching = activeClients.filter(
    (c) => c.status === "Lender Matching",
  ).length;
  const submitted = activeClients.filter(
    (c) => c.status === "Submitted",
  ).length;
  const stipulations = activeClients.filter(
    (c) => c.status === "Stipulations",
  ).length;
  const offers = activeClients.filter(
    (c) => c.status === "Offer Received",
  ).length;
  const funded = allClients.filter((c) => c.status === "Funded").length;
  const totalRequested = activeClients.reduce(
    (sum, c) => sum + (c.totalRequested ?? 0),
    0,
  );

  const kpis = [
    {
      label: "Active Partners",
      value: FUNDING_OPS_PARTNERS.length,
      icon: Landmark,
      tone: "text-foreground",
      view: null,
    },
    {
      label: "Active Clients",
      value: activeClients.length,
      icon: Users,
      tone: "text-foreground",
      view: "mgmt-deal-list",
    },
    {
      label: "Due Today",
      value: dueToday,
      icon: Clock,
      tone: "text-amber-600",
      view: "mgmt-stipulations",
    },
    {
      label: "Overdue",
      value: overdue,
      icon: AlertTriangle,
      tone: "text-amber-600",
      view: "mgmt-stipulations",
    },
    {
      label: "Critical SLA",
      value: criticalSLA,
      icon: ShieldAlert,
      tone: "text-red-600",
      view: "mgmt-stipulations",
    },
    {
      label: "Readiness",
      value: readiness,
      icon: FileText,
      tone: "text-amber-600",
      view: "mgmt-readiness",
    },
    {
      label: "Lender Matching",
      value: lenderMatching,
      icon: Landmark,
      tone: "text-indigo-600",
      view: "mgmt-deal-list",
    },
    {
      label: "Submitted",
      value: submitted,
      icon: DollarSign,
      tone: "text-sky-600",
      view: "mgmt-submissions",
    },
    {
      label: "Stipulations",
      value: stipulations,
      icon: FileText,
      tone: "text-amber-600",
      view: "mgmt-stipulations",
    },
    {
      label: "Offers",
      value: offers,
      icon: DollarSign,
      tone: "text-purple-600",
      view: "mgmt-offers",
    },
    {
      label: "Funded",
      value: funded,
      icon: CheckCircle2,
      tone: "text-emerald-600",
      view: "mgmt-funded",
    },
    {
      label: "Requested",
      value: formatCurrency(totalRequested),
      icon: DollarSign,
      tone: "text-emerald-600",
      view: null,
    },
  ];

  /* Partner Health */
  const partnerHealth = useMemo(
    () =>
      FUNDING_OPS_PARTNERS.map((p) => {
        const clients = allClients.filter(
          (c) =>
            c.organizationId === p.scopeId ||
            c.outsourcingGroupId === p.scopeId,
        );
        const active = clients.filter((c) => isActiveFunding(c.status));
        const od = active.filter(
          (c) => c.slaHoursRemaining !== undefined && c.slaHoursRemaining <= 8,
        ).length;
        const slaRisk = od > 0;
        const health: "Healthy" | "Attention" =
          p.status === "Paused" || slaRisk ? "Attention" : "Healthy";
        return {
          partner: p,
          activeCount: active.length,
          overdue: od,
          slaRisk,
          health,
        };
      }),
    [allClients],
  );

  /* Team Workload */
  const teamWorkload = useMemo(() => {
    const map: Record<
      string,
      { open: number; dueToday: number; overdue: number; partners: Set<string> }
    > = {};
    activeClients.forEach((c) => {
      const a = c.assignedAgent ?? "Unassigned";
      if (!map[a])
        map[a] = { open: 0, dueToday: 0, overdue: 0, partners: new Set() };
      map[a].open += c.openFiles;
      if (c.slaHoursRemaining !== undefined && c.slaHoursRemaining <= 24)
        map[a].dueToday++;
      if (c.slaHoursRemaining !== undefined && c.slaHoursRemaining <= 8)
        map[a].overdue++;
      map[a].partners.add(clientGroupLabel(c));
    });
    return Object.entries(map).map(([agent, d]) => ({
      agent,
      ...d,
      partners: Array.from(d.partners),
    }));
  }, [activeClients]);

  /* Needs Attention */
  const needsAttention = useMemo(
    () =>
      activeClients
        .filter(
          (c) =>
            c.status === "Stipulations" ||
            (c.slaHoursRemaining !== undefined && c.slaHoursRemaining <= 8),
        )
        .slice(0, 8),
    [activeClients],
  );

  /* Recent Activity */
  const recentActivity = store.activity.slice(0, 8);

  return (
    <div className="space-y-5 text-xs text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="font-bold uppercase tracking-wide text-foreground">
            🏦 FUNDINGOPS MANAGEMENT DASHBOARD
          </span>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-extrabold text-primary">
            All Partners · {activeClients.length} active clients
          </span>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
                    {row.partner.group === "outsourcing"
                      ? "Outsourcing"
                      : "FundingOps Users"}
                  </td>
                  <td className="px-3 py-2 text-foreground">
                    {row.activeCount}
                  </td>
                  <td className="px-3 py-2 text-foreground">{row.overdue}</td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold",
                        row.slaRisk
                          ? "bg-red-500/10 text-red-700"
                          : "bg-emerald-500/10 text-emerald-700",
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
                          ? "bg-emerald-500/10 text-emerald-700"
                          : "bg-amber-500/10 text-amber-700",
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
                    "Open Files",
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
                    <td className="px-3 py-2 text-amber-600">{row.dueToday}</td>
                    <td className="px-3 py-2 text-red-600">{row.overdue}</td>
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
                  needsAttention.map((c) => {
                    const partner = getFundingPartnerByScope(
                      c.organizationId ?? c.outsourcingGroupId ?? "",
                    );
                    return (
                      <tr key={c.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-semibold text-foreground">
                          {c.name}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {partner?.name ?? clientGroupLabel(c)}
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {c.status}
                        </td>
                        <td className="px-3 py-2 text-red-600">
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
                    );
                  })
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
            🕘 RECENT FUNDINGOPS ACTIVITY
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
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
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
