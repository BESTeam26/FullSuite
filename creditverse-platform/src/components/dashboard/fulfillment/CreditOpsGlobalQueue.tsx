import type { ElementType } from "react";
/**
 * CreditOps Global Queue — cross-partner queue view.
 *
 * Aggregates authorized client/work records from ALL CreditOps Partners for a
 * given queue type. Every row retains Partner context. Same canonical client
 * records — aggregated by query/view only, never duplicated.
 *
 * Includes interactive inline status transition triggers.
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
  ChevronRight,
} from "lucide-react";
import type { FulfillmentClient } from "@/lib/fulfillment/fulfillment-client-domain";
import { useCreditOpsStore } from "@/lib/fulfillment/creditops-client-store";
import { useCreditOpsWebhooks } from "@/lib/fulfillment/creditops-webhooks";
import { getPartnerByScope } from "@/lib/fulfillment/creditops-partners";
import { clientGroupLabel } from "@/lib/fulfillment/fulfillment-client-domain";
import {
  FulfillmentStatusPill,
  Avatar,
  ALL_STATUS_OPTIONS,
} from "./client-list-helpers";
import { ClientWorkWorkspace } from "./ClientWorkWorkspace";
import { cn } from "@/lib/utils";

interface Props {
  queueType: string;
}

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
  const [search, setSearch] = useState("");
  const [partnerFilter, setPartnerFilter] = useState("all");
  const [openClientId, setOpenClientId] = useState<string | null>(null);
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);

  const spec = QUEUE_SPECS[queueType] ?? QUEUE_SPECS["dispute-queue"];
  const Icon = spec.icon;

  const queueClients = useMemo(
    () =>
      store.clients.filter(spec.filterFn).filter((c) => {
        if (partnerFilter !== "all") {
          if (
            c.organizationId !== partnerFilter &&
            c.outsourcingGroupId !== partnerFilter
          )
            return false;
        }
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          clientGroupLabel(c).toLowerCase().includes(q)
        );
      }),
    [store.clients, spec, search, partnerFilter],
  );

  if (openClientId) {
    return (
      <ClientWorkWorkspace
        clientId={openClientId}
        onBack={() => setOpenClientId(null)}
      />
    );
  }

  const commitStatus = (client: FulfillmentClient, newStatus: string) => {
    const prev = client.status;
    store.updateStatus(
      client.id,
      newStatus as FulfillmentClient["status"],
      "Manager (BES HQ)",
    );
    // Push the status change to external CRMs via webhooks
    webhooks.pushStatusChange({
      clientId: client.id,
      clientName: client.name,
      partnerName: clientGroupLabel(client),
      previousStatus: prev,
      newStatus,
    });
    setEditingStatusId(null);
  };

  return (
    <div className="space-y-4">
      {/* Header + filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl bg-muted",
              spec.color,
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold tracking-wide text-foreground">
              {spec.title}
            </h2>
            <p className="text-xs text-muted-foreground">
              {queueClients.length} clients across all Partners requiring action
              in this queue
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={partnerFilter}
            onChange={(e) => setPartnerFilter(e.target.value)}
            className="rounded-lg border border-border bg-background py-1.5 px-3 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">All Partners</option>
            {[
              { id: "sub-1", name: "Apex Credit Co." },
              { id: "sub-2", name: "Pioneer Credit Solutions" },
              { id: "sub-4", name: "CreditFix Solutions" },
              { id: "os-group-1", name: "CRC Outsourcing" },
              { id: "os-group-2", name: "Metro Dispute Partners" },
              { id: "sub-3", name: "EDP Management Group" },
            ].map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="relative min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search across all Partners..."
              className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {[
                "Client",
                "Partner",
                "Service Group",
                "Round",
                "Queue Status",
                "Assigned Agent",
                "SLA",
                "Action",
              ].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {queueClients.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  No clients in this queue.
                </td>
              </tr>
            ) : (
              queueClients.map((c) => {
                const partner = getPartnerByScope(
                  c.organizationId ?? c.outsourcingGroupId ?? "",
                );
                const group =
                  partner?.group === "managed"
                    ? "Managed Ops"
                    : partner?.group === "outsourcing"
                      ? "Outsourcing"
                      : "CreditOps Users";
                return (
                  <tr
                    key={c.id}
                    className="cursor-pointer transition-colors hover:bg-muted/30"
                    onClick={() => setOpenClientId(c.id)}
                  >
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-foreground">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {c.email}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-foreground">
                      {partner?.name ?? clientGroupLabel(c)}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {group}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-foreground">
                      {c.round}
                    </td>
                    <td
                      className="px-3 py-2.5"
                      onClick={(e) => {
                        const tag = (e.target as HTMLElement).tagName;
                        if (["SELECT", "OPTION"].includes(tag))
                          e.stopPropagation();
                      }}
                    >
                      {editingStatusId === c.id ? (
                        <select
                          autoFocus
                          defaultValue={c.status}
                          onBlur={(e) => commitStatus(c, e.target.value)}
                          onChange={(e) => commitStatus(c, e.target.value)}
                          className="rounded border border-primary bg-background px-1.5 py-1 text-[11px] text-foreground focus:outline-none"
                        >
                          {ALL_STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingStatusId(c.id);
                          }}
                          title="Click to transition status"
                        >
                          <FulfillmentStatusPill status={c.status} />
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="inline-flex items-center gap-1.5">
                        <Avatar name={c.assignedAgent ?? "Unassigned"} />
                        <span className="text-xs text-foreground">
                          {c.assignedAgent ?? "Unassigned"}
                        </span>
                      </div>
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 font-extrabold",
                        c.slaHoursRemaining !== undefined &&
                          c.slaHoursRemaining <= 4
                          ? "text-red-600"
                          : "text-foreground",
                      )}
                    >
                      {c.slaHoursRemaining !== undefined
                        ? `${c.slaHoursRemaining}h`
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenClientId(c.id);
                        }}
                        className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[10px] font-bold text-primary-foreground hover:opacity-90"
                      >
                        Open <ChevronRight className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
