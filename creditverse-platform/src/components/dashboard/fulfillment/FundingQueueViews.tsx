import type { ElementType } from "react";
import { useAllFundingFiles } from "@/lib/data/use-funding";
import { stagesForDepartment } from "@/lib/funding/pipeline-stages";
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

  /* Queues are keyed on the FUNDING FILE stage (separation step 3): a client
     is in a queue when one of its files is on a stage that department works
     (DEPARTMENT_STAGES maps the 17-stage spine onto the seven departments). Clients with no file
     yet fall back to their own status so intake is not invisible. */
  const files = useAllFundingFiles();
  const stagesByClient = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const f of files.data) {
      if (!m.has(f.clientId)) m.set(f.clientId, new Set());
      m.get(f.clientId)!.add(f.stage);
    }
    return m;
  }, [files.data]);
  const inStage = (c: FundingClient, stages: string[]) => {
    const fileStages = stagesByClient.get(c.id);
    if (fileStages && fileStages.size > 0) return stages.some((st) => fileStages.has(st));
    return stages.includes(c.status);
  };
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
      color: "text-status-warning",
      filterFn: (c) => inStage(c, [...stagesForDepartment("Readiness Review"), "Onboarding", "Readiness Review"]),
    },
    "document-queue": {
      title: "DOCUMENT REVIEW QUEUE",
      icon: FileText,
      color: "text-status-info",
      filterFn: (c) => inStage(c, [...stagesForDepartment("Document Review"), "Document Review"]),
    },
    "lender-matching-queue": {
      title: "LENDER MATCHING QUEUE",
      icon: Landmark,
      color: "text-status-info",
      filterFn: (c) => inStage(c, [...stagesForDepartment("Lender Matching"), "Lender Matching"]),
    },
    "submissions-queue": {
      title: "SUBMISSIONS QUEUE",
      icon: DollarSign,
      color: "text-sky-600",
      filterFn: (c) => inStage(c, [...stagesForDepartment("Submissions"), "Submitted"]),
    },
    "stipulations-queue": {
      title: "STIPULATIONS QUEUE",
      icon: FileText,
      color: "text-status-warning",
      filterFn: (c) => inStage(c, [...stagesForDepartment("Stipulations"), "Stipulations"]),
    },
    "offers-queue": {
      title: "OFFERS QUEUE",
      icon: DollarSign,
      color: "text-purple-600",
      filterFn: (c) => inStage(c, [...stagesForDepartment("Offers"), "Offer Received"]),
    },
    "funded-queue": {
      title: "FUNDED DEALS QUEUE",
      icon: CheckCircle2,
      color: "text-status-success",
      filterFn: (c) => inStage(c, [...stagesForDepartment("Funded Deals"), "Funded"]),
    },
    "escalation-queue": {
      title: "ESCALATION & SLA QUEUE",
      icon: AlertTriangle,
      color: "text-status-danger",
      filterFn: (c) =>
        c.slaHoursRemaining !== undefined && c.slaHoursRemaining <= 8,
    },
    "onboarding-queue": {
      title: "ONBOARDING QUEUE",
      icon: UserPlus,
      color: "text-status-warning",
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
