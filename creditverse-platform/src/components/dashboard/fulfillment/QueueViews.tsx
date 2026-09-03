import type { ElementType } from "react";
/**
 * Queue Views and SOPs/Logins for CreditOps Workspace.
 *
 * Each queue is self-contained: it owns its own search + status filter.
 * No global navigation layer inside a queue. No duplicate controls.
 * All queues read from the shared CreditOps store (one canonical client record).
 */

import { useMemo, useState } from "react";
import {
  FileText,
  UserPlus,
  HelpCircle,
  AlertTriangle,
  Mail,
  Phone,
  Search,
} from "lucide-react";
import type { FulfillmentClient } from "@/lib/fulfillment/fulfillment-client-domain";
import { useCreditOpsStore } from "@/lib/fulfillment/creditops-client-store";
import { EditableSopsAndLoginsView } from "./EditableSopsAndLoginsView";
import { OpsQueueView } from "./OpsQueueView";
import { DivisionTable } from "@/components/dashboard/DivisionLayout";
import { ClientWorkWorkspace } from "./ClientWorkWorkspace";

interface QueueProps {
  selectedScope: string;
  assignedOnly?: boolean;
  searchQuery?: string;
}

export function QueueView({
  queueType,
  selectedScope,
}: QueueProps & { queueType: string }) {
  const store = useCreditOpsStore();
  const [openClientId, setOpenClientId] = useState<string | null>(null);

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

  if (queueType === "sops-logins") {
    return <EditableSopsAndLoginsView selectedScope={selectedScope} />;
  }

  if (openClientId) {
    return (
      <ClientWorkWorkspace
        clientId={openClientId}
        onBack={() => setOpenClientId(null)}
      />
    );
  }

  // Define queue specs
  const specs: Record<
    string,
    {
      title: string;
      icon: ElementType;
      color: string;
      filterFn: (c: FulfillmentClient) => boolean;
    }
  > = {
    "dispute-queue": {
      title: "DISPUTE PROCESSING QUEUE",
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
      title: "ONBOARDING QUEUE",
      icon: UserPlus,
      color: "text-amber-600",
      filterFn: (c) =>
        ["Onboarding", "NEW ONBOARDING", "INCOMPLETE ONBOARDING"].includes(
          c.status,
        ),
    },
    "support-queue": {
      title: "CLIENT SUCCESS & SUPPORT QUEUE",
      icon: HelpCircle,
      color: "text-blue-600",
      filterFn: (c) =>
        ["Monitoring Issue", "Attention", "Awaiting Response"].includes(
          c.status,
        ),
    },
    "escalation-queue": {
      title: "ESCALATION & MANAGEMENT QUEUE",
      icon: AlertTriangle,
      color: "text-red-600",
      filterFn: (c) =>
        c.status === "Attention" ||
        (c.slaHoursRemaining !== undefined && c.slaHoursRemaining <= 4),
    },
    "complaints-queue": {
      title: "COMPLAINTS & MAILING QUEUE",
      icon: Mail,
      color: "text-purple-600",
      filterFn: () => true,
    },
    "bureau-queue": {
      title: "BUREAU CALLING QUEUE",
      icon: Phone,
      color: "text-indigo-600",
      filterFn: () => true,
    },
  };

  const spec = specs[queueType] || specs["dispute-queue"];
  const queueClients = scopedClients.filter(spec.filterFn);

  return (
    <OpsQueueView
      title={spec.title}
      icon={spec.icon}
      color={spec.color}
      clients={queueClients}
      onOpenClient={setOpenClientId}
      statusColumnLabel="Queue Status"
      slaWarningHours={4}
      detailColumn={{
        label: "Round",
        render: (c) => (
          <span className="font-semibold text-foreground">{c.round}</span>
        ),
      }}
    />
  );
}
