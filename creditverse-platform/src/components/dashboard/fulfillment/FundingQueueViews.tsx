import type { ElementType } from "react";
/**
 * Funding Queue Views and SOPs/Logins for the FundingOps Workspace.
 *
 * Each queue is self-contained: it owns its own search + status filter.
 * No global navigation layer inside a queue. No duplicate controls.
 * All queues read from the shared FundingOps store (one canonical client record).
 *
 * Mirrors QueueViews.tsx but uses funding-domain stages and the funding store.
 */

import { useMemo, useState } from "react";
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
import { OpsQueueView } from "./OpsQueueView";
import { FundingClientWorkWorkspace } from "./FundingClientWorkWorkspace";

interface FundingQueueProps {
  selectedScope: string;
  assignedOnly?: boolean;
  searchQuery?: string;
  onOpenClient?: (clientId: string) => void;
}

export function FundingQueueView({
  queueType,
  selectedScope,
  onOpenClient,
}: FundingQueueProps & { queueType: string }) {
  const store = useFundingOpsStore();
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

  if (openClientId) {
    return (
      <FundingClientWorkWorkspace
        clientId={openClientId}
        onBack={() => setOpenClientId(null)}
      />
    );
  }

  // Funding stage queue specs
  const specs: Record<
    string,
    {
      title: string;
      icon: ElementType;
      color: string;
      filterFn: (c: FundingClient) => boolean;
    }
  > = {
    "readiness-queue": {
      title: "READINESS REVIEW QUEUE",
      icon: CheckCircle2,
      color: "text-amber-600",
      filterFn: (c) => ["Onboarding", "Readiness Review"].includes(c.status),
    },
    "document-queue": {
      title: "DOCUMENT REVIEW QUEUE",
      icon: FileText,
      color: "text-blue-600",
      filterFn: (c) => c.status === "Document Review",
    },
    "lender-matching-queue": {
      title: "LENDER MATCHING QUEUE",
      icon: Landmark,
      color: "text-indigo-600",
      filterFn: (c) => c.status === "Lender Matching",
    },
    "submissions-queue": {
      title: "SUBMISSIONS QUEUE",
      icon: DollarSign,
      color: "text-sky-600",
      filterFn: (c) => c.status === "Submitted",
    },
    "stipulations-queue": {
      title: "STIPULATIONS QUEUE",
      icon: FileText,
      color: "text-amber-600",
      filterFn: (c) => c.status === "Stipulations",
    },
    "offers-queue": {
      title: "OFFERS QUEUE",
      icon: DollarSign,
      color: "text-purple-600",
      filterFn: (c) => c.status === "Offer Received",
    },
    "funded-queue": {
      title: "FUNDED DEALS QUEUE",
      icon: CheckCircle2,
      color: "text-emerald-600",
      filterFn: (c) => c.status === "Funded",
    },
    "escalation-queue": {
      title: "ESCALATION & SLA QUEUE",
      icon: AlertTriangle,
      color: "text-red-600",
      filterFn: (c) =>
        c.slaHoursRemaining !== undefined && c.slaHoursRemaining <= 8,
    },
    "onboarding-queue": {
      title: "ONBOARDING QUEUE",
      icon: UserPlus,
      color: "text-amber-600",
      filterFn: (c) => c.status === "Onboarding",
    },
  };

  const spec = specs[queueType] || specs["readiness-queue"];
  const queueClients = scopedClients.filter(spec.filterFn);

  return (
    <OpsQueueView
      title={spec.title}
      icon={spec.icon}
      color={spec.color}
      clients={queueClients}
      onOpenClient={(id) =>
        onOpenClient ? onOpenClient(id) : setOpenClientId(id)
      }
      statusColumnLabel="Stage Status"
      slaWarningHours={8}
      detailColumn={{
        label: "Requested",
        render: (c) => (
          <span className="font-semibold text-foreground">
            {c.totalRequested ? formatCurrency(c.totalRequested) : "—"}
          </span>
        ),
      }}
    />
  );
}
