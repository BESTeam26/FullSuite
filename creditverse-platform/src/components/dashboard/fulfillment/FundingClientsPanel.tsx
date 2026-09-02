/**
 * Funding Clients panel — Main Client List for the selected FundingOps Partner.
 *
 * ONE canonical funding client list per Partner. A fast ClickUp/Airtable-style
 * operational client table, purpose-built for FundingOps.
 *
 * Owns its own controls: List/Grid, Assigned to Me, Search, Status, Sort,
 * + Add Client, Columns. Controls do NOT render globally on other views.
 *
 * Mirrors FulfillmentClientsPanel but reads from the FundingOps store and uses
 * funding-domain columns + statuses.
 */

import { useEffect, useMemo, useState } from "react";
import { Search, List, LayoutGrid, Plus, Columns3, X } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { seedFundingGroups } from "@/lib/fulfillment/fundingops-seed";
import { clientGroupLabel } from "@/lib/fulfillment/fundingops-domain";
import { useFundingOpsStore } from "@/lib/fulfillment/fundingops-client-store";
import type { FundingOpsPartner } from "@/lib/fulfillment/fundingops-partners";
import {
  FUNDING_COLUMN_DEFS,
  FUNDING_STATUS_OPTIONS,
  loadFundingPrefs,
  saveFundingPrefs,
  type FundingViewPrefs,
  type FundingColId,
} from "./funding-client-list-helpers";
import { FundingClientListTable } from "./FundingClientListTable";
import { FundingClientListGrid } from "./FundingClientListGrid";
import { FundingAddClientModal } from "./FundingAddClientModal";
import { FundingClientWorkWorkspace } from "./FundingClientWorkWorkspace";
import { cn } from "@/lib/utils";

interface FundingClientsPanelProps {
  selectedScope?: string;
  assignedOnlyFilter?: boolean;
  partner?: FundingOpsPartner | undefined;
}

export function FundingClientsPanel({
  selectedScope = "all",
  assignedOnlyFilter = false,
  partner,
}: FundingClientsPanelProps) {
  const store = useFundingOpsStore();
  const [prefs, setPrefs] = useState<FundingViewPrefs>(() =>
    loadFundingPrefs(),
  );
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [assignedOnly, setAssignedOnly] = useState(assignedOnlyFilter);
  const [showColumns, setShowColumns] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [openClientId, setOpenClientId] = useState<string | null>(null);

  useEffect(() => saveFundingPrefs(prefs), [prefs]);
  const setPref = <K extends keyof FundingViewPrefs>(
    key: K,
    value: FundingViewPrefs[K],
  ) => setPrefs((p) => ({ ...p, [key]: value }));

  const filtered = useMemo(() => {
    let list = store.clients.filter((c) => {
      if (selectedScope !== "all") {
        if (
          c.organizationId !== selectedScope &&
          c.outsourcingGroupId !== selectedScope
        )
          return false;
      }
      if (assignedOnly && c.assignedAgent !== "Keila Betancourt") return false;
      if (statusFilter !== "All Statuses" && c.status !== statusFilter)
        return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !c.name.toLowerCase().includes(q) &&
          !c.email.toLowerCase().includes(q) &&
          !clientGroupLabel(c).toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });

    const dir = prefs.sortDir === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (prefs.sortField) {
        case "client":
          av = a.name;
          bv = b.name;
          break;
        case "email":
          av = a.email;
          bv = b.email;
          break;
        case "status":
          av = a.status;
          bv = b.status;
          break;
        case "agent":
          av = a.assignedAgent ?? "Unassigned";
          bv = b.assignedAgent ?? "Unassigned";
          break;
        case "openFiles":
          av = a.openFiles;
          bv = b.openFiles;
          break;
        case "requested":
          av = a.totalRequested ?? 0;
          bv = b.totalRequested ?? 0;
          break;
        case "sla":
          av = a.slaHoursRemaining ?? 9999;
          bv = b.slaHoursRemaining ?? 9999;
          break;
        case "lastActivity":
          av = a.lastActivity;
          bv = b.lastActivity;
          break;
        default:
          av = a.name;
          bv = b.name;
      }
      if (typeof av === "number" && typeof bv === "number")
        return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return list;
  }, [
    store.clients,
    search,
    statusFilter,
    selectedScope,
    assignedOnly,
    prefs.sortField,
    prefs.sortDir,
  ]);

  const activeCount = filtered.filter(
    (c) => !["Funded", "Declined", "Withdrawn", "Archived"].includes(c.status),
  ).length;

  const hideModeCol = !!partner && partner.group === "outsourcing";

  const availableCols = hideModeCol
    ? FUNDING_COLUMN_DEFS.filter((c) => c.id !== "mode")
    : FUNDING_COLUMN_DEFS;

  const visibleCols = availableCols.filter((c) =>
    prefs.visibleCols.includes(c.id),
  );

  if (openClientId) {
    return (
      <FundingClientWorkWorkspace
        clientId={openClientId}
        onBack={() => setOpenClientId(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-border bg-background p-1">
            <button
              onClick={() => setPref("view", "list")}
              className={cn(
                "rounded-md p-1.5 transition-colors",
                prefs.view === "list"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPref("view", "grid")}
              className={cn(
                "rounded-md p-1.5 transition-colors",
                prefs.view === "grid"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={() => setAssignedOnly((v) => !v)}
            className={cn(
              "ml-1 inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
              assignedOnly
                ? "border-emerald-600 bg-emerald-500/10 text-emerald-700"
                : "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors",
                assignedOnly ? "bg-emerald-600" : "bg-muted-foreground/40",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow transition",
                  assignedOnly ? "translate-x-3" : "translate-x-0",
                )}
              />
            </span>
            Assigned to Me
          </button>

          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5">
            <span className="text-xs font-semibold text-foreground">
              {activeCount} Active
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowAddClient(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> Add Client
          </button>

          <div className="relative">
            <button
              onClick={() => setShowColumns((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
            >
              <Columns3 className="h-3.5 w-3.5" /> Columns
            </button>
            {showColumns && (
              <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-border bg-card p-2 shadow-lg">
                <div className="mb-1 flex items-center justify-between px-1">
                  <span className="text-[11px] font-bold uppercase text-muted-foreground">
                    Show Columns
                  </span>
                  <button onClick={() => setShowColumns(false)}>
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                </div>
                {availableCols.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs text-foreground hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={prefs.visibleCols.includes(c.id)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...prefs.visibleCols, c.id]
                          : prefs.visibleCols.filter((x) => x !== c.id);
                        setPref("visibleCols", next);
                      }}
                      className="h-3.5 w-3.5"
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="relative min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search client..."
              className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-border bg-background py-1.5 px-3 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {FUNDING_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <ContentCard title="No clients match your filters">
          <p className="text-sm text-muted-foreground">
            Adjust the status filter or search to find clients for this Partner.
          </p>
        </ContentCard>
      ) : prefs.view === "list" ? (
        <FundingClientListTable
          clients={filtered}
          visibleCols={visibleCols}
          prefs={prefs}
          setPrefs={setPrefs}
          onOpenClient={setOpenClientId}
        />
      ) : (
        <FundingClientListGrid
          clients={filtered}
          onOpenClient={setOpenClientId}
        />
      )}

      {/* Outsourcing group management */}
      {selectedScope !== "all" &&
        seedFundingGroups.some((g) => g.id === selectedScope) && (
          <div className="mt-6">
            <ContentCard title="Outsourcing Group">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      {[
                        "Group",
                        "Partner",
                        "Contact",
                        "Contract",
                        "Clients",
                        "Status",
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {seedFundingGroups
                      .filter((g) => g.id === selectedScope)
                      .map((g) => (
                        <tr key={g.id} className="hover:bg-muted/30">
                          <td className="px-4 py-2.5 text-foreground">
                            {g.name}
                          </td>
                          <td className="px-4 py-2.5 text-foreground">
                            {g.partnerName}
                          </td>
                          <td className="px-4 py-2.5 text-foreground">
                            {g.contactEmail}
                          </td>
                          <td className="px-4 py-2.5 text-foreground">
                            {g.contractRef ?? "—"}
                          </td>
                          <td className="px-4 py-2.5 text-foreground">
                            {g.clientCount}
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={cn(
                                "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                                g.status === "Active"
                                  ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
                                  : "bg-amber-500/10 text-amber-700 border-amber-500/30",
                              )}
                            >
                              {g.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </ContentCard>
          </div>
        )}

      <FundingAddClientModal
        open={showAddClient}
        onClose={() => setShowAddClient(false)}
        partner={partner}
      />
    </div>
  );
}
