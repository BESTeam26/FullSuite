/**
 * FundingOps Management Dashboard — cross-partner management layer.
 *
 * Aggregates authorized client/work records from ALL FundingOps Partners across
 * Outsourcing and FundingOps Users. This is the management view above individual
 * Partner workspaces.
 *
 * Same canonical client records — aggregated by query/view only, never duplicated.
 *
 * Layout and metric maths are shared with CreditOps; this file supplies only
 * what is specific to FundingOps: its KPIs, thresholds and status vocabulary.
 */

import { useMemo } from "react";
import {
  Users,
  AlertTriangle,
  ShieldAlert,
  FileText,
  CheckCircle2,
  Clock,
  DollarSign,
  Landmark,
} from "lucide-react";
import { useFundingOpsStore } from "@/lib/fulfillment/fundingops-client-store";
import {
  FUNDING_OPS_PARTNERS,
  getFundingPartnerByScope,
  type FundingOpsPartner,
} from "@/lib/fulfillment/fundingops-partners";
import type { FundingClient } from "@/lib/fulfillment/fundingops-domain";
import {
  formatCurrency,
  INACTIVE_FUNDING_STATUSES,
} from "@/lib/fulfillment/fundingops-domain";
import {
  computePartnerHealth,
  computeTeamWorkload,
  isActiveClient,
  type OpsMetricsConfig,
} from "@/lib/fulfillment/ops-management-metrics";
import { OpsManagementDashboard, type OpsKpi } from "./OpsManagementDashboard";
import { usePartners } from "@/lib/data/use-partners";

/**
 * How FundingOps measures its own work. There is no escalation status in this
 * division, so partner SLA risk is driven by overdue files alone.
 */
const METRICS: OpsMetricsConfig<FundingClient> = {
  overdueHours: 8,
  dueTodayHours: 24,
  inactiveStatuses: INACTIVE_FUNDING_STATUSES,
  escalationStatuses: [],
  openCount: (c) => c.openFiles,
};

const GROUP_LABELS: Record<string, string> = {
  outsourcing: "Outsourcing",
  fundingops_users: "FundingOps Users",
};

interface Props {
  onNavigateToView?: (viewId: string) => void;
  onOpenClient?: (clientId: string) => void;
}

export function FundingOpsManagementDashboard({
  onNavigateToView,
  onOpenClient,
}: Props) {
  const { partners: livePartners } = usePartners(
    "fundingOps",
    FUNDING_OPS_PARTNERS,
  );
  const store = useFundingOpsStore();
  const allClients = store.clients;

  const activeClients = useMemo(
    () => allClients.filter((c) => isActiveClient(c, METRICS)),
    [allClients],
  );

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

  const kpis: OpsKpi[] = [
    {
      label: "Active Partners",
      value: livePartners.length,
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
      tone: "text-status-warning",
      view: "mgmt-stipulations",
    },
    {
      label: "Overdue",
      value: overdue,
      icon: AlertTriangle,
      tone: "text-status-warning",
      view: "mgmt-stipulations",
    },
    {
      label: "Critical SLA",
      value: criticalSLA,
      icon: ShieldAlert,
      tone: "text-status-danger",
      view: "mgmt-stipulations",
    },
    {
      label: "Readiness",
      value: readiness,
      icon: FileText,
      tone: "text-status-warning",
      view: "mgmt-readiness",
    },
    {
      label: "Lender Matching",
      value: lenderMatching,
      icon: Landmark,
      tone: "text-status-info",
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
      tone: "text-status-warning",
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
      tone: "text-status-success",
      view: "mgmt-funded",
    },
    {
      label: "Requested",
      value: formatCurrency(totalRequested),
      icon: DollarSign,
      tone: "text-status-success",
      view: null,
    },
  ];

  const partnerHealth = useMemo(
    () => computePartnerHealth(livePartners, allClients, METRICS),
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
            c.status === "Stipulations" ||
            (c.slaHoursRemaining !== undefined && c.slaHoursRemaining <= 8),
        )
        .slice(0, 8),
    [activeClients],
  );

  return (
    <OpsManagementDashboard<FundingClient, FundingOpsPartner>
      title="🏦 FUNDINGOPS MANAGEMENT DASHBOARD"
      activityTitle="🕘 RECENT FUNDINGOPS ACTIVITY"
      activeCount={activeClients.length}
      kpis={kpis}
      partnerHealth={partnerHealth}
      teamWorkload={teamWorkload}
      needsAttention={needsAttention}
      recentActivity={store.activity.slice(0, 8)}
      allClients={allClients}
      showEscalations={false}
      groupLabel={(g) => GROUP_LABELS[g] ?? g}
      resolvePartnerName={(c) =>
        getFundingPartnerByScope(c.organizationId ?? c.outsourcingGroupId ?? "")
          ?.name
      }
      onNavigateToView={onNavigateToView}
      onOpenClient={onOpenClient}
    />
  );
}
