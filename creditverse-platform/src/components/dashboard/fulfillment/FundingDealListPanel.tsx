/**
 * Funding Deal List — the scope-aware primary list view.
 *
 * Replaces the old "Clients" tab. The LEFT TREE is the client navigation, so
 * the list view shows DEALS, not clients. Scope-aware:
 *
 *   selectedScope = "all"        → all authorized deals across companies
 *   selectedScope = <partner>    → that company's deals
 *   clientId      = <id>         → that client's deals only
 *
 * Clicking a deal opens the Deal Workspace. Same canonical records — filtered
 * projection only, never duplicated.
 */

import { useMemo, useState } from "react";
import { Search, Layers, ChevronRight } from "lucide-react";
import { useAllFundingFiles } from "@/lib/data/use-funding";
import { useFundingOpsStore } from "@/lib/fulfillment/fundingops-client-store";
import { useFundingDealStore } from "@/lib/fulfillment/funding-deal-store";
import {
  clientGroupLabel,
  formatCurrency,
  clientGroupKey,
  DEAL_STATUSES,
} from "@/lib/fulfillment/fundingops-domain";
import { getFundingPartnerByScope } from "@/lib/fulfillment/fundingops-partners";
import { dealCode } from "./funding-deal-data";
import { FundingStatusPill } from "./funding-client-list-helpers";
import { cn } from "@/lib/utils";
import { OpsSelect } from "@/components/ui/ops-select";

interface Props {
  /** Partner scope id, or "all" for management (cross-partner). */
  selectedScope?: string;
  /** When set, restricts the list to one client's deals. */
  clientId?: string;
  onOpenDeal: (dealId: string) => void;
}

export function FundingDealListPanel({
  selectedScope = "all",
  clientId,
  onOpenDeal,
}: Props) {
  const store = useFundingOpsStore();
  const dealStore = useFundingDealStore();
  // Business names come from the files, loaded once for the whole division
  // rather than looked up per deal (rule 14).
  const { data: files } = useAllFundingFiles();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Statuses");

  const deals = useMemo(() => {
    let list = dealStore.deals.filter((d) => {
      if (clientId) return d.clientId === clientId;
      return true;
    });

    list = list.filter((d) => {
      if (selectedScope !== "all" && !clientId) {
        const client = store.clients.find((c) => c.id === d.clientId);
        if (!client) return false;
        if (clientGroupKey(client) !== selectedScope) return false;
      }
      if (statusFilter !== "All Statuses" && d.status !== statusFilter)
        return false;
      if (search) {
        const q = search.toLowerCase();
        const client = store.clients.find((c) => c.id === d.clientId);
        const file = files.find((f) => f.id === d.fileId);
        const hay = [
          dealCode(d.id),
          d.lender,
          d.program,
          client?.name ?? "",
          client?.email ?? "",
          file?.businessName ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return list;
  }, [
    dealStore.deals,
    store.clients,
    selectedScope,
    clientId,
    search,
    statusFilter,
  ]);

  const scopeLabel = clientId
    ? (store.clients.find((c) => c.id === clientId)?.name ?? "Client")
    : selectedScope === "all"
      ? "All Partners"
      : (getFundingPartnerByScope(selectedScope)?.name ?? "Partner");

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold tracking-wide text-foreground">
              DEAL LIST
            </h2>
            <p className="text-xs text-muted-foreground">
              {deals.length} deals · {scopeLabel}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search deals, lenders, clients..."
              className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <OpsSelect
            value={statusFilter}
            onValueChange={setStatusFilter}
            aria-label="Filter by status"
            options={["All Statuses", ...DEAL_STATUSES]}
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {[
                "Deal",
                "Client / Business",
                "Lender / Program",
                "Amount",
                "Status",
                "Stips",
                "Partner",
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
            {deals.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No deals match your filters.
                </td>
              </tr>
            ) : (
              deals.map((d) => {
                const client = store.clients.find((c) => c.id === d.clientId);
                const file = files.find((f) => f.id === d.fileId);
                const partner = client
                  ? getFundingPartnerByScope(
                      client.organizationId ?? client.outsourcingGroupId ?? "",
                    )
                  : undefined;
                return (
                  <tr
                    key={d.id}
                    className="cursor-pointer transition-colors hover:bg-muted/30"
                    onClick={() => onOpenDeal(d.id)}
                  >
                    <td className="px-3 py-2.5">
                      <p className="font-bold text-foreground">
                        {dealCode(d.id)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {d.submittedAt}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-foreground">
                        {client?.name ?? "—"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {file?.businessName ?? "—"}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-foreground">{d.lender}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {d.program}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-foreground">
                      {formatCurrency(d.amount)}
                      {d.rate && (
                        <span className="ml-1 text-[11px] text-muted-foreground">
                          {d.rate}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <FundingStatusPill status={d.status} />
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold",
                          d.stipsOutstanding > 0
                            ? "bg-amber-500/10 text-status-warning"
                            : "bg-emerald-500/10 text-status-success",
                        )}
                      >
                        {d.stipsOutstanding} open
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {partner?.name ??
                        (client ? clientGroupLabel(client) : "—")}
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDeal(d.id);
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
