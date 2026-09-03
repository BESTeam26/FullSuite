/**
 * FundingOps Global Queue — cross-partner queue view.
 *
 * Aggregates authorized client/work records from ALL FundingOps Partners for a
 * given stage queue. Every row retains Partner context. Same canonical client
 * records — aggregated by query/view only, never duplicated.
 *
 * Layout is shared with CreditOps; this file supplies the FundingOps queue
 * specs, columns and statuses. Unlike CreditOps there is no webhook bridge, so
 * a status transition here is a local change only.
 */

import { useMemo, useState, type ElementType } from "react";
import {
  FileText,
  UserPlus,
  AlertTriangle,
  Landmark,
  DollarSign,
  CheckCircle2,
} from "lucide-react";
import type { FundingClient } from "@/lib/fulfillment/fundingops-domain";
import { formatCurrency } from "@/lib/fulfillment/fundingops-domain";
import { useFundingOpsStore } from "@/lib/fulfillment/fundingops-client-store";
import {
  FUNDING_OPS_PARTNERS,
  getFundingPartnerByScope,
  type FundingOpsPartner,
} from "@/lib/fulfillment/fundingops-partners";
import { FundingStatusPill } from "./funding-client-list-helpers";
import { FundingClientWorkWorkspace } from "./FundingClientWorkWorkspace";
import { OpsGlobalQueue } from "./OpsGlobalQueue";

interface Props {
  queueType: string;
  onOpenClient?: (clientId: string) => void;
}

const SLA_WARNING_HOURS = 8;

const GROUP_LABELS: Record<string, string> = {
  outsourcing: "Outsourcing",
  fundingops_users: "FundingOps Users",
};

const FUNDING_ALL_STATUSES = [
  "Onboarding",
  "Readiness Review",
  "Document Review",
  "Lender Matching",
  "Submitted",
  "Stipulations",
  "Offer Received",
  "Funded",
  "Declined",
  "Withdrawn",
  "Archived",
];

const QUEUE_SPECS: Record<
  string,
  {
    title: string;
    icon: ElementType;
    color: string;
    filterFn: (c: FundingClient) => boolean;
  }
> = {
  "readiness-queue": {
    title: "GLOBAL READINESS REVIEW QUEUE",
    icon: CheckCircle2,
    color: "text-amber-600",
    filterFn: (c) => ["Onboarding", "Readiness Review"].includes(c.status),
  },
  "document-queue": {
    title: "GLOBAL DOCUMENT REVIEW QUEUE",
    icon: FileText,
    color: "text-blue-600",
    filterFn: (c) => c.status === "Document Review",
  },
  "lender-matching-queue": {
    title: "GLOBAL LENDER MATCHING QUEUE",
    icon: Landmark,
    color: "text-indigo-600",
    filterFn: (c) => c.status === "Lender Matching",
  },
  "submissions-queue": {
    title: "GLOBAL SUBMISSIONS QUEUE",
    icon: DollarSign,
    color: "text-sky-600",
    filterFn: (c) => c.status === "Submitted",
  },
  "stipulations-queue": {
    title: "GLOBAL STIPULATIONS QUEUE",
    icon: FileText,
    color: "text-amber-600",
    filterFn: (c) => c.status === "Stipulations",
  },
  "offers-queue": {
    title: "GLOBAL OFFERS QUEUE",
    icon: DollarSign,
    color: "text-purple-600",
    filterFn: (c) => c.status === "Offer Received",
  },
  "funded-queue": {
    title: "GLOBAL FUNDED DEALS QUEUE",
    icon: CheckCircle2,
    color: "text-emerald-600",
    filterFn: (c) => c.status === "Funded",
  },
  "escalation-queue": {
    title: "GLOBAL ESCALATION & SLA QUEUE",
    icon: AlertTriangle,
    color: "text-red-600",
    filterFn: (c) =>
      c.slaHoursRemaining !== undefined && c.slaHoursRemaining <= 8,
  },
  "onboarding-queue": {
    title: "GLOBAL ONBOARDING QUEUE",
    icon: UserPlus,
    color: "text-amber-600",
    filterFn: (c) => c.status === "Onboarding",
  },
};

export function FundingGlobalQueue({ queueType, onOpenClient }: Props) {
  const store = useFundingOpsStore();
  const [openClientId, setOpenClientId] = useState<string | null>(null);

  const spec = QUEUE_SPECS[queueType] ?? QUEUE_SPECS["readiness-queue"];
  const queueClients = useMemo(
    () => store.clients.filter(spec.filterFn),
    [store.clients, spec],
  );

  if (openClientId) {
    return (
      <FundingClientWorkWorkspace
        clientId={openClientId}
        onBack={() => setOpenClientId(null)}
      />
    );
  }

  return (
    <OpsGlobalQueue<FundingClient, FundingOpsPartner>
      title={spec.title}
      icon={spec.icon}
      color={spec.color}
      clients={queueClients}
      partners={FUNDING_OPS_PARTNERS}
      resolvePartner={(c) =>
        getFundingPartnerByScope(c.organizationId ?? c.outsourcingGroupId ?? "")
      }
      groupLabel={(g) => GROUP_LABELS[g ?? ""] ?? "FundingOps Users"}
      detailColumn={{
        label: "Requested",
        render: (c) =>
          c.totalRequested ? formatCurrency(c.totalRequested) : "—",
      }}
      statusColumnLabel="Stage Status"
      statusOptions={FUNDING_ALL_STATUSES}
      renderStatusPill={(status) => <FundingStatusPill status={status} />}
      onCommitStatus={(client, newStatus) =>
        store.updateStatus(client.id, newStatus, "Manager (BES HQ)")
      }
      slaWarningHours={SLA_WARNING_HOURS}
      onOpenClient={(id) => (onOpenClient ? onOpenClient(id) : setOpenClientId(id))}
    />
  );
}
