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
  Search,
  Landmark,
  DollarSign,
  CheckCircle2,
} from "lucide-react";
import type { FundingClient } from "@/lib/fulfillment/fundingops-domain";
import { formatCurrency } from "@/lib/fulfillment/fundingops-domain";
import { useFundingOpsStore } from "@/lib/fulfillment/fundingops-client-store";
import { DivisionTable } from "@/components/dashboard/DivisionLayout";
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
  const [search, setSearch] = useState("");
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
  const Icon = spec.icon;

  const queueClients = scopedClients.filter(spec.filterFn).filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl bg-muted ${spec.color}`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-foreground tracking-wide">
              {spec.title}
            </h2>
            <p className="text-xs text-muted-foreground">
              {queueClients.length} clients requiring action in this funding
              stage queue
            </p>
          </div>
        </div>
        <div className="relative min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search this queue..."
            className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <DivisionTable
        columns={[
          "Client Name",
          "Email / Phone",
          "Requested",
          "Stage Status",
          "Assigned Agent",
          "SLA Hours",
          "Action",
        ]}
        rows={queueClients.map((c) => [
          <button
            onClick={() =>
              onOpenClient ? onOpenClient(c.id) : setOpenClientId(c.id)
            }
            className="text-left"
          >
            <p className="font-bold text-foreground hover:text-primary">
              {c.name}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {c.mode === "saas_pulled"
                ? c.organizationName
                : c.outsourcingGroupName}
            </p>
          </button>,
          <div>
            <p className="text-xs text-foreground">{c.email}</p>
            <p className="text-[11px] text-muted-foreground">
              {c.phone || "No phone"}
            </p>
          </div>,
          <span className="font-semibold text-foreground">
            {c.totalRequested ? formatCurrency(c.totalRequested) : "—"}
          </span>,
          <span className="inline-flex rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-bold text-amber-700 border border-amber-500/30">
            {c.status}
          </span>,
          c.assignedAgent || "Unassigned",
          <span
            className={`font-extrabold ${c.slaHoursRemaining && c.slaHoursRemaining <= 8 ? "text-red-600" : "text-foreground"}`}
          >
            {c.slaHoursRemaining ? `${c.slaHoursRemaining}h` : "—"}
          </span>,
          <button
            onClick={() =>
              onOpenClient ? onOpenClient(c.id) : setOpenClientId(c.id)
            }
            className="rounded-md bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90"
          >
            Open File
          </button>,
        ])}
      />
    </div>
  );
}
