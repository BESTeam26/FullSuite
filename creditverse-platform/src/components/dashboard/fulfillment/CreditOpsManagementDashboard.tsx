/**
 * CreditOps Management Dashboard — cross-partner management layer.
 *
 * Aggregates authorized client/work records from ALL CreditOps Partners across
 * Managed Ops, Outsourcing, and CreditOps Users. This is the management view
 * above individual Partner workspaces.
 *
 * Same canonical client records — aggregated by query/view only, never duplicated.
 */

import { useMemo } from "react";
import {
  Users,
  AlertTriangle,
  ShieldAlert,
  HelpCircle,
  Phone,
  Mail,
  FileText,
  CheckCircle2,
  Clock,
  ArrowRight,
} from "lucide-react";
import { useCreditOpsStore } from "@/lib/fulfillment/creditops-client-store";
import {
  CREDIT_OPS_PARTNERS,
  getPartnerByScope,
} from "@/lib/fulfillment/creditops-partners";
import { clientGroupLabel } from "@/lib/fulfillment/fulfillment-client-domain";
import { cn } from "@/lib/utils";

const INACTIVE_STATUSES = ["Completed", "Archived", "Graduated"];

interface Props {
  onNavigateToView?: (viewId: string) => void;
  onOpenClient?: (clientId: string) => void;
}

export function CreditOpsManagementDashboard({
  onNavigateToView,
  onOpenClient,
}: Props) {
  const store = useCreditOpsStore();

  const allClients = store.clients;
  const activeClients = allClients.filter(
    (c) => !INACTIVE_STATUSES.includes(c.status),
  );

  const dueToday = activeClients.filter(
    (c) => c.slaHoursRemaining !== undefined && c.slaHoursRemaining <= 24,
  ).length;
  const overdue = activeClients.filter(
    (c) => c.slaHoursRemaining !== undefined && c.slaHoursRemaining <= 4,
  ).length;
  const criticalSLA = overdue;
  const readyProcessing = activeClients.filter((c) =>
    ["Ready for Processing", "In Processing"].includes(c.status),
  ).length;
  const awaitingResults = activeClients.filter((c) =>
    ["In Dispute", "Awaiting Response"].includes(c.status),
  ).length;
  const supportIssues = activeClients.filter((c) =>
    ["Monitoring Issue", "Attention", "Awaiting Response"].includes(c.status),
  ).length;
  const escalations = activeClients.filter(
    (c) => c.status === "Attention",
  ).length;
  const bureauCalls = activeClients.filter(
    (c) => c.status === "BC NEEDED",
  ).length;

  const kpis = [
    {
      label: "Active Partners",
      value: CREDIT_OPS_PARTNERS.length,
      icon: Users,
      tone: "text-foreground",
      view: null,
    },
    {
      label: "Active Clients",
      value: activeClients.length,
      icon: Users,
      tone: "text-foreground",
      view: "main-list",
    },
    {
      label: "Due Today",
      value: dueToday,
      icon: Clock,
      tone: "text-amber-600",
      view: "escalation-queue",
    },
    {
      label: "Overdue",
      value: overdue,
      icon: AlertTriangle,
      tone: "text-amber-600",
      view: "escalation-queue",
    },
    {
      label: "Critical SLA",
      value: criticalSLA,
      icon: ShieldAlert,
      tone: "text-red-600",
      view: "escalation-queue",
    },
    {
      label: "Ready for Processing",
      value: readyProcessing,
      icon: FileText,
      tone: "text-emerald-600",
      view: "dispute-queue",
    },
    {
      label: "Awaiting Results",
      value: awaitingResults,
      icon: Clock,
      tone: "text-blue-600",
      view: "dispute-queue",
    },
    {
      label: "Support Issues",
      value: supportIssues,
      icon: HelpCircle,
      tone: "text-blue-600",
      view: "support-queue",
    },
    {
      label: "Escalations",
      value: escalations,
      icon: AlertTriangle,
      tone: "text-red-600",
      view: "escalation-queue",
    },
    {
      label: "Bureau Calls Required",
      value: bureauCalls,
      icon: Phone,
      tone: "text-indigo-600",
      view: "bureau-queue",
    },
  ];

  /* Partner Health */
  const partnerHealth = useMemo(
    () =>
      CREDIT_OPS_PARTNERS.map((p) => {
        const clients = allClients.filter(
          (c) =>
            c.organizationId === p.scopeId ||
            c.outsourcingGroupId === p.scopeId,
        );
        const active = clients.filter(
          (c) => !INACTIVE_STATUSES.includes(c.status),
        );
        const od = active.filter(
          (c) => c.slaHoursRemaining !== undefined && c.slaHoursRemaining <= 4,
        ).length;
        const esc = active.filter((c) => c.status === "Attention").length;
        const slaRisk = od > 0 || esc > 0;
        const health: "Healthy" | "Attention" | "Billing" =
          p.status === "Paused"
            ? "Attention"
            : slaRisk
              ? "Attention"
              : "Healthy";
        return {
          partner: p,
          activeCount: active.length,
          overdue: od,
          escalations: esc,
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
      map[a].open += c.openItems;
      if (c.slaHoursRemaining !== undefined && c.slaHoursRemaining <= 24)
        map[a].dueToday++;
      if (c.slaHoursRemaining !== undefined && c.slaHoursRemaining <= 4)
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
            c.status === "Attention" ||
            c.status === "Monitoring Issue" ||
            (c.slaHoursRemaining !== undefined && c.slaHoursRemaining <= 4),
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
            📊 CREDITOPS MANAGEMENT DASHBOARD
          </span>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-extrabold text-primary">
            All Partners · {activeClients.length} active clients
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
                  "Escalations",
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
                    {row.partner.group === "managed"
                      ? "Managed Ops"
                      : row.partner.group === "outsourcing"
                        ? "Outsourcing"
                        : "CreditOps Users"}
                  </td>
                  <td className="px-3 py-2 text-foreground">
                    {row.activeCount}
                  </td>
                  <td className="px-3 py-2 text-foreground">{row.overdue}</td>
                  <td className="px-3 py-2 text-foreground">
                    {row.escalations}
                  </td>
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
                    const partner = getPartnerByScope(
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
            🕘 RECENT CREDITOPS ACTIVITY
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
