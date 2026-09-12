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
import { useDepartmentQueue } from "@/lib/data/use-department-queue";
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
  /**
   * MEMBERSHIP COMES FROM DEPARTMENT WORK, NOT FROM CREDIT STATUS.
   *
   * This was `store.clients.filter(spec.filterFn)` over the client's overall
   * credit status. Complaints' predicate was `() => true`, so the Complaints
   * queue listed every client BES had — including files whose statuses were
   * `In Dispute` and `Onboarding` (Dee's screenshot, 2026-09-12).
   *
   * `creditops_department_queue` is one open department row per line. The
   * status shown is THAT DEPARTMENT'S; the client's overall stage is its own
   * column beside it, never conflated with it.
   *
   * The Escalation Queue has no department of its own — it spans them — so it
   * keeps the client-level predicate it always had.
   */
  const queue = useDepartmentQueue(department ?? null);
  const queueClients = useMemo(() => {
    if (!department) return store.clients.filter(spec.filterFn);
    return queue.rows.map((r) => ({
      id: r.clientId,
      name: r.clientName,
      email: r.clientEmail ?? "",
      phone: r.clientPhone ?? undefined,
      /* The DEPARTMENT's work status drives the Queue Status column. */
      status: r.workStatus,
      round: r.round,
      organizationId: r.partnerScopeId ?? undefined,
      outsourcingGroupId: r.partnerScopeId ?? undefined,
      assignedAgent: r.assigneeName ?? undefined,
      assignedAgentId: r.assigneeId,
      slaHoursRemaining: r.dueAt
        ? Math.round(((new Date(r.dueAt).getTime() - Date.now()) / 3_600_000) * 10) / 10
        : undefined,
      lastActivity: r.updatedAt,
      createdAt: r.updatedAt.slice(0, 10),
      /* Carried for the extra columns and the ownership filter. */
      creditStatus: r.creditStatus,
      waiting: r.waiting,
    })) as unknown as FulfillmentClient[];
  }, [department, queue.rows, store.clients, spec]);

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
      detailColumns={[
        { label: "Round", render: (c) => c.round },
        /* The client's overall stage, beside the department's own status and
           never standing in for it (Dee, 2026-09-12). */
        ...(department
          ? [{
              label: "Credit Status",
              render: (c: FulfillmentClient) => (
                <span className="text-xs font-normal text-muted-foreground">
                  {(c as unknown as { creditStatus?: string }).creditStatus ?? "—"}
                </span>
              ),
            }]
          : []),
      ]}
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
              /* Straight off the queue row — no second lookup, and no chance
                 of the filter and the column disagreeing. */
              resolve: (c) => {
                const row = queue.rows.find((r) => r.clientId === c.id);
                return {
                  assigneeId: row?.assigneeId ?? null,
                  assigneeName: row?.assigneeName ?? null,
                  /* Only an auto-distributed department can FAIL to place a
                     file; Support leaving it unassigned is a decision. */
                  assignmentRequired: unassignedIsException && !row?.assigneeId,
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
