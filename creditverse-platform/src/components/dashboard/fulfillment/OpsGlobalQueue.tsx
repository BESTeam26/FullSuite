/**
 * OpsGlobalQueue — a cross-partner queue view for any Managed Operations
 * division.
 *
 * Aggregates authorized client/work records from ALL of a division's Partners
 * for one queue. Every row keeps its Partner context. Same canonical client
 * records — aggregated by query/view only, never duplicated.
 *
 * Status can be transitioned inline here because this is the management view;
 * the division decides what a status change means (CreditOps also pushes it to
 * external CRMs via webhooks, FundingOps does not).
 */

import { useMemo, useState, type ElementType, type ReactNode } from "react";
import { Search, ChevronRight } from "lucide-react";
import {
  clientGroupLabel,
  type OpsClient,
  type OpsPartner,
} from "@/lib/fulfillment/ops-client-domain";
import { Avatar } from "./ops-client-list-helpers";
import { cn } from "@/lib/utils";
import { OpsSelect } from "@/components/ui/ops-select";

export interface OpsGlobalQueueColumn<T extends OpsClient> {
  label: string;
  render: (client: T) => ReactNode;
}

interface OpsGlobalQueueProps<T extends OpsClient, P extends OpsPartner> {
  title: string;
  icon: ElementType;
  /** Tailwind text-colour class for the header icon. */
  color: string;
  /** Clients already narrowed to this queue by the division. */
  clients: T[];
  /** Partners offered in the filter — the division's canonical partner list. */
  partners: readonly P[];
  resolvePartner: (client: T) => P | undefined;
  groupLabel: (group: string | undefined) => string;
  /** The one division-specific column: dispute Round vs Requested amount. */
  detailColumn: OpsGlobalQueueColumn<T>;
  /** "Queue Status" in CreditOps, "Stage Status" in FundingOps. */
  statusColumnLabel: string;
  statusOptions: readonly string[];
  renderStatusPill: (status: string) => ReactNode;
  /** Commit an inline status transition. */
  onCommitStatus: (client: T, newStatus: string) => void;
  /** SLA hours at or below which the figure turns red. */
  slaWarningHours: number;
  onOpenClient: (clientId: string) => void;
}

export function OpsGlobalQueue<T extends OpsClient, P extends OpsPartner>({
  title,
  icon: Icon,
  color,
  clients,
  partners,
  resolvePartner,
  groupLabel,
  detailColumn,
  statusColumnLabel,
  statusOptions,
  renderStatusPill,
  onCommitStatus,
  slaWarningHours,
  onOpenClient,
}: OpsGlobalQueueProps<T, P>) {
  const [search, setSearch] = useState("");
  const [partnerFilter, setPartnerFilter] = useState("all");
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);

  const visible = useMemo(
    () =>
      clients.filter((c) => {
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
    [clients, search, partnerFilter],
  );

  const commit = (client: T, newStatus: string) => {
    onCommitStatus(client, newStatus);
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
              color,
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold tracking-wide text-foreground">
              {title}
            </h2>
            <p className="text-xs text-muted-foreground">
              {visible.length} clients across all Partners requiring action in
              this queue
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OpsSelect
            value={partnerFilter}
            onValueChange={setPartnerFilter}
            aria-label="Filter by partner"
            options={[
              { value: "all", label: "All Partners" },
              ...partners.map((p) => ({ value: p.scopeId, label: p.name })),
            ]}
          />
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
                detailColumn.label,
                statusColumnLabel,
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
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  No clients in this queue.
                </td>
              </tr>
            ) : (
              visible.map((c) => {
                const partner = resolvePartner(c);
                return (
                  <tr
                    key={c.id}
                    className="cursor-pointer transition-colors hover:bg-muted/30"
                    onClick={() => onOpenClient(c.id)}
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
                      {groupLabel(partner?.group)}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-foreground">
                      {detailColumn.render(c)}
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
                        <OpsSelect
                          autoFocus
                          openOnMount
                          size="inline"
                          aria-label="Status"
                          value={c.status}
                          onValueChange={(v) => commit(c, v)}
                          onDismiss={() => setEditingStatusId(null)}
                          options={statusOptions}
                        />
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingStatusId(c.id);
                          }}
                          title="Click to transition status"
                        >
                          {renderStatusPill(c.status)}
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
                          c.slaHoursRemaining <= slaWarningHours
                          ? "text-status-danger"
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
                          onOpenClient(c.id);
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
