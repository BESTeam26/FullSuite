/**
 * CreditOps Global Queue — cross-partner queue view.
 *
 * Aggregates authorized client/work records from ALL CreditOps Partners for a
 * given queue type. Every row retains Partner context. Same canonical client
 * records — aggregated by query/view only, never duplicated.
 *
 * Layout is shared with FundingOps; this file supplies the CreditOps queue
 * specs, columns, statuses and the webhook push on status transition.
 */

import { useMemo, useState, type ElementType } from "react";
import {
  FileText,
  UserPlus,
  HelpCircle,
  AlertTriangle,
  Mail,
  Phone,
} from "lucide-react";
import type { FulfillmentClient } from "@/lib/fulfillment/fulfillment-client-domain";
import { clientGroupLabel } from "@/lib/fulfillment/fulfillment-client-domain";
import { useCreditOpsStore } from "@/lib/fulfillment/creditops-client-store";
import { useCreditOpsWebhooks } from "@/lib/fulfillment/creditops-webhooks";
import {
  CREDIT_OPS_PARTNERS,
  getPartnerByScope,
  type CreditOpsPartner,
} from "@/lib/fulfillment/creditops-partners";
import {
  FulfillmentStatusPill,
  ALL_STATUS_OPTIONS,
} from "./client-list-helpers";
import { ClientWorkWorkspace } from "./ClientWorkWorkspace";
import { OpsGlobalQueue } from "./OpsGlobalQueue";

interface Props {
  queueType: string;
}

const SLA_WARNING_HOURS = 4;

const GROUP_LABELS: Record<string, string> = {
  managed: "Managed Ops",
  outsourcing: "Outsourcing",
  creditops_users: "CreditOps Users",
};

const QUEUE_SPECS: Record<
  string,
  {
    title: string;
    icon: ElementType;
    color: string;
    filterFn: (c: FulfillmentClient) => boolean;
  }
> = {
  "dispute-queue": {
    title: "GLOBAL DISPUTE PROCESSING QUEUE",
    icon: FileText,
    color: "text-emerald-600",
    filterFn: (c) =>
      [
        "In Processing",
        "Ready for QA",
        "In Dispute",
        "Ready for Processing",
      ].includes(c.status),
  },
  "onboarding-queue": {
    title: "GLOBAL ONBOARDING QUEUE",
    icon: UserPlus,
    color: "text-amber-600",
    filterFn: (c) =>
      ["Onboarding", "NEW ONBOARDING", "INCOMPLETE ONBOARDING"].includes(
        c.status,
      ),
  },
  "support-queue": {
    title: "GLOBAL CLIENT SUCCESS & SUPPORT QUEUE",
    icon: HelpCircle,
    color: "text-blue-600",
    filterFn: (c) =>
      ["Monitoring Issue", "Attention", "Awaiting Response"].includes(c.status),
  },
  "escalation-queue": {
    title: "GLOBAL ESCALATION & MANAGEMENT QUEUE",
    icon: AlertTriangle,
    color: "text-red-600",
    filterFn: (c) =>
      c.status === "Attention" ||
      (c.slaHoursRemaining !== undefined && c.slaHoursRemaining <= 4),
  },
  "complaints-queue": {
    title: "GLOBAL COMPLAINTS & MAILING QUEUE",
    icon: Mail,
    color: "text-purple-600",
    filterFn: () => true,
  },
  "bureau-queue": {
    title: "GLOBAL BUREAU CALLING QUEUE",
    icon: Phone,
    color: "text-indigo-600",
    filterFn: () => true,
  },
};

export function CreditOpsGlobalQueue({ queueType }: Props) {
  const store = useCreditOpsStore();
  const webhooks = useCreditOpsWebhooks();
  const [openClientId, setOpenClientId] = useState<string | null>(null);

  const spec = QUEUE_SPECS[queueType] ?? QUEUE_SPECS["dispute-queue"];
  const queueClients = useMemo(
    () => store.clients.filter(spec.filterFn),
    [store.clients, spec],
  );

  if (openClientId) {
    return (
      <ClientWorkWorkspace
        clientId={openClientId}
        onBack={() => setOpenClientId(null)}
      />
    );
  }

  /** A manager transition here is also pushed to the external CRM. */
  const commitStatus = (client: FulfillmentClient, newStatus: string) => {
    const previousStatus = client.status;
    store.updateStatus(client.id, newStatus, "Manager (BES HQ)");
    webhooks.pushStatusChange({
      clientId: client.id,
      clientName: client.name,
      partnerName: clientGroupLabel(client),
      previousStatus,
      newStatus,
    });
  };

  return (
    <OpsGlobalQueue<FulfillmentClient, CreditOpsPartner>
      title={spec.title}
      icon={spec.icon}
      color={spec.color}
      clients={queueClients}
      partners={CREDIT_OPS_PARTNERS}
      resolvePartner={(c) =>
        getPartnerByScope(c.organizationId ?? c.outsourcingGroupId ?? "")
      }
      groupLabel={(g) => GROUP_LABELS[g ?? ""] ?? "CreditOps Users"}
      detailColumn={{ label: "Round", render: (c) => c.round }}
      statusColumnLabel="Queue Status"
      statusOptions={ALL_STATUS_OPTIONS}
      renderStatusPill={(status) => <FulfillmentStatusPill status={status} />}
      onCommitStatus={commitStatus}
      slaWarningHours={SLA_WARNING_HOURS}
      onOpenClient={setOpenClientId}
    />
  );
}
