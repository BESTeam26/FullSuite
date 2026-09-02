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
      icon: any;
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
              {queueClients.length} clients requiring action in this workflow
              queue
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
          "Round",
          "Queue Status",
          "Assigned Agent",
          "SLA Hours",
          "Action",
        ]}
        rows={queueClients.map((c) => [
          <button onClick={() => setOpenClientId(c.id)} className="text-left">
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
          <span className="font-semibold text-foreground">{c.round}</span>,
          <span className="inline-flex rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-bold text-amber-700 border border-amber-500/30">
            {c.status}
          </span>,
          c.assignedAgent || "Unassigned",
          <span
            className={`font-extrabold ${c.slaHoursRemaining && c.slaHoursRemaining <= 4 ? "text-red-600" : "text-foreground"}`}
          >
            {c.slaHoursRemaining ? `${c.slaHoursRemaining}h` : "—"}
          </span>,
          <button
            onClick={() => setOpenClientId(c.id)}
            className="rounded-md bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90"
          >
            Open File
          </button>,
        ])}
      />
    </div>
  );
}

import { EditableSopsAndLoginsView } from "./EditableSopsAndLoginsView";
