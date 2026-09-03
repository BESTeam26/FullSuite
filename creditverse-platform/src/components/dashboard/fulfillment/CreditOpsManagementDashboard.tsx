/**
 * CreditOps Management Dashboard — cross-partner management layer.
 *
 * Aggregates authorized client/work records from ALL CreditOps Partners across
 * Managed Ops, Outsourcing, and CreditOps Users. This is the management view
 * above individual Partner workspaces.
 *
 * Same canonical client records — aggregated by query/view only, never duplicated.
 *
 * Layout and metric maths are shared with FundingOps; this file supplies only
 * what is specific to CreditOps: its KPIs, thresholds and status vocabulary.
 */

import { useMemo } from "react";
import {
  Users,
  AlertTriangle,
  ShieldAlert,
  HelpCircle,
  Phone,
  FileText,
  Clock,
} from "lucide-react";
import { useCreditOpsStore } from "@/lib/fulfillment/creditops-client-store";
import {
  CREDIT_OPS_PARTNERS,
  getPartnerByScope,
  type CreditOpsPartner,
} from "@/lib/fulfillment/creditops-partners";
import type { FulfillmentClient } from "@/lib/fulfillment/fulfillment-client-domain";
import {
  computePartnerHealth,
  computeTeamWorkload,
  isActiveClient,
  type OpsMetricsConfig,
} from "@/lib/fulfillment/ops-management-metrics";
import { OpsManagementDashboard, type OpsKpi } from "./OpsManagementDashboard";

/** How CreditOps measures its own work. */
const METRICS: OpsMetricsConfig<FulfillmentClient> = {
  overdueHours: 4,
  dueTodayHours: 24,
  inactiveStatuses: ["Completed", "Archived", "Graduated"],
  escalationStatuses: ["Attention"],
  openCount: (c) => c.openItems,
};

const GROUP_LABELS: Record<string, string> = {
  managed: "Managed Ops",
  outsourcing: "Outsourcing",
  creditops_users: "CreditOps Users",
};

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

  const activeClients = useMemo(
    () => allClients.filter((c) => isActiveClient(c, METRICS)),
    [allClients],
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

  const kpis: OpsKpi[] = [
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

  const partnerHealth = useMemo(
    () => computePartnerHealth(CREDIT_OPS_PARTNERS, allClients, METRICS),
    [allClients],
  );

  const teamWorkload = useMemo(
    () => computeTeamWorkload(activeClients, METRICS),
    [activeClients],
  );

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

  return (
    <OpsManagementDashboard<FulfillmentClient, CreditOpsPartner>
      title="📊 CREDITOPS MANAGEMENT DASHBOARD"
      activityTitle="🕘 RECENT CREDITOPS ACTIVITY"
      activeCount={activeClients.length}
      kpis={kpis}
      partnerHealth={partnerHealth}
      teamWorkload={teamWorkload}
      needsAttention={needsAttention}
      recentActivity={store.activity.slice(0, 8)}
      allClients={allClients}
      showEscalations
      groupLabel={(g) => GROUP_LABELS[g] ?? g}
      resolvePartnerName={(c) =>
        getPartnerByScope(c.organizationId ?? c.outsourcingGroupId ?? "")?.name
      }
      onNavigateToView={onNavigateToView}
      onOpenClient={onOpenClient}
    />
  );
}
