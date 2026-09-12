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
import { useCreditOpsStore } from "@/lib/fulfillment/creditops-client-store";
import {
  CREDIT_OPS_PARTNERS,
  type CreditOpsPartner,
} from "@/lib/fulfillment/creditops-partners";
import {
  FulfillmentStatusPill,
  ALL_STATUS_OPTIONS,
} from "./client-list-helpers";
import { ClientWorkWorkspace } from "./ClientWorkWorkspace";
import { OpsGlobalQueue } from "./OpsGlobalQueue";
import { usePartners } from "@/lib/data/use-partners";
import { useAuth } from "@/lib/auth/auth-context";
import { useDepartmentRoster } from "@/lib/data/use-department-roster";
import type { CreditOpsDepartment } from "@/lib/fulfillment/creditops-access";

interface Props {
  queueType: string;
  /** Open narrowed to one partner — see `initialPartnerScope`. */
  partnerScope?: string | null;
}

/**
 * Which department each queue is the queue FOR.
 *
 * The queue's rows are still selected by the client's credit status (the
 * specs below), but assignment belongs to a department row, so the ownership
 * filter needs to know which one. The Escalation Queue spans every
 * department by definition and therefore has none.
 */
const QUEUE_DEPARTMENT: Record<string, CreditOpsDepartment | undefined> = {
  "onboarding-queue": "Onboarding",
  "dispute-queue": "Dispute",
  "support-queue": "Support",
  "complaints-queue": "Complaints",
  "bureau-queue": "Bureau Calling",
  "escalation-queue": undefined,
};

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
    color: "text-status-success",
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
    color: "text-status-warning",
    filterFn: (c) =>
      ["Onboarding", "NEW ONBOARDING", "INCOMPLETE ONBOARDING"].includes(
        c.status,
      ),
  },
  "support-queue": {
    title: "GLOBAL CLIENT SUCCESS & SUPPORT QUEUE",
    icon: HelpCircle,
    color: "text-status-info",
    filterFn: (c) =>
      ["Monitoring Issue", "Attention", "Awaiting Response"].includes(c.status),
  },
  "escalation-queue": {
    title: "GLOBAL ESCALATION & MANAGEMENT QUEUE",
    icon: AlertTriangle,
    color: "text-status-danger",
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
    color: "text-status-info",
    filterFn: () => true,
  },
};

export function CreditOpsGlobalQueue({ queueType, partnerScope = null }: Props) {
  const { partners: livePartners } = usePartners(
    "creditOps",
    CREDIT_OPS_PARTNERS,
  );
  const store = useCreditOpsStore();
  const auth = useAuth();
  const [openClientId, setOpenClientId] = useState<string | null>(null);
  const department = QUEUE_DEPARTMENT[queueType];
  const roster = useDepartmentRoster(department);
  /* Support is Team Lead assignment, so an unassigned file there is the
     normal state and must not be offered as "Assignment required" (Dee,
     §16). Everywhere else it is an exception worth surfacing. */
  const unassignedIsException = department !== "Support";

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

  /**
   * The store already forwards every status change to the webhook bridge
   * (see WebhookBridge in CreditOps.tsx), so this must NOT push again — doing
   * both emitted the signal twice and would double-post to the external CRM.
   */
  const commitStatus = (client: FulfillmentClient, newStatus: string) => {
    store.updateStatus(client.id, newStatus, "Manager (BES HQ)");
  };

  return (
    <OpsGlobalQueue<FulfillmentClient, CreditOpsPartner>
      title={spec.title}
      icon={spec.icon}
      color={spec.color}
      clients={queueClients}
      partners={livePartners}
      /* The LIVE partners, not the demo constants. `getPartnerByScope` reads
         `CREDIT_OPS_PARTNERS`, whose scope ids are invented, so every real
         client resolved to no partner and the Partner column read blank. */
      resolvePartner={(c) => {
        const scope = c.organizationId ?? c.outsourcingGroupId ?? "";
        return livePartners.find((p) => p.scopeId === scope);
      }}
      groupLabel={(g) => GROUP_LABELS[g ?? ""] ?? "CreditOps Users"}
      detailColumn={{ label: "Round", render: (c) => c.round }}
      statusColumnLabel="Queue Status"
      statusOptions={ALL_STATUS_OPTIONS}
      renderStatusPill={(status) => <FulfillmentStatusPill status={status} />}
      onCommitStatus={commitStatus}
      slaWarningHours={SLA_WARNING_HOURS}
      onOpenClient={setOpenClientId}
      initialPartnerScope={partnerScope}
      ownership={
        department
          ? {
              resolve: (c) => {
                const row = store
                  .getDepartmentStatuses(c.id)
                  .find((d) => d.department === department);
                return {
                  assigneeId: row?.assigneeId ?? null,
                  assigneeName: row?.assigneeId ? (row.assignee ?? null) : null,
                  /* Only an auto-distributed department can FAIL to place a
                     file; Support leaving it unassigned is a decision. */
                  assignmentRequired:
                    unassignedIsException && !row?.assigneeId,
                };
              },
              agents: roster,
              currentUserId: auth.user?.id ?? null,
              unassignedIsException,
            }
          : undefined
      }
    />
  );
}
