/**
 * Fulfillment Clients panel — Main Client List for the selected CreditOps Partner.
 *
 * ONE canonical client list per Partner. A fast ClickUp/Airtable-style
 * operational client table, purpose-built for CreditOps.
 *
 * Filtering, the toolbar and the outsourcing-group card are shared with
 * FundingOps; this file supplies the CreditOps store, columns, statuses and
 * its own sort fields.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { isActiveClient } from "@/lib/fulfillment/fulfillment-client-domain";
import { OpsSelect } from "@/components/ui/ops-select";
import { useDepartmentStatusMap } from "@/lib/data/use-department-statuses";
import { currentDepartment, openDepartments } from "@/lib/fulfillment/department-domain";
import type { DepartmentStatus } from "@/lib/fulfillment/creditops-store-types";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { useCreditOpsStore } from "@/lib/fulfillment/creditops-client-store";
import type { CreditOpsPartner } from "@/lib/fulfillment/creditops-partners";
import { useAuth } from "@/lib/auth/auth-context";
import {
  countActive,
  filterAndSortClients,
} from "@/lib/fulfillment/ops-client-filtering";
import {
  COLUMN_DEFS,
  STATUS_OPTIONS,
  loadPrefs,
  savePrefs,
  type ViewPrefs,
} from "./client-list-helpers";
import { ClientListTable } from "./ClientListTable";
import { ClientListGrid } from "./ClientListGrid";
import { OpsClientListToolbar } from "./OpsClientListToolbar";
import { AddClientModal } from "./AddClientModal";
import { ClientWorkWorkspace } from "./ClientWorkWorkspace";

const ALL_STATUSES = "All Statuses";
/* Who is looking, not a name in the source. "Assigned to me" used to mean
   "assigned to Keila Betancourt" for everybody, so the filter showed the wrong
   person's work to whoever opened it. */

/** Groups whose Partner workspace hides the Mode / Source column. */
const GROUPS_HIDING_MODE = ["managed", "outsourcing"];

interface FulfillmentClientsPanelProps {
  selectedScope?: string;
  assignedOnlyFilter?: boolean;
  partner?: CreditOpsPartner | undefined;
  /** Opens this client's workspace on mount / when it changes (deep link). */
  initialOpenClientId?: string | null;
}

export function FulfillmentClientsPanel({
  selectedScope = "all",
  assignedOnlyFilter = false,
  partner,
  initialOpenClientId = null,
}: FulfillmentClientsPanelProps) {
  const { displayName } = useAuth();
  const store = useCreditOpsStore();
  const [prefs, setPrefs] = useState<ViewPrefs>(() => loadPrefs());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL_STATUSES);
  const [assignedOnly, setAssignedOnly] = useState(assignedOnlyFilter);
  /* Lifecycle view: active clients by default; history stays one click away. */
  const [lifecycleView, setLifecycleView] = useState<"active" | "all" | "archived">("active");
  const lifecycleFiltered = useMemo(
    () =>
      store.clients.filter((c) =>
        lifecycleView === "all" ? true : lifecycleView === "active" ? isActiveClient(c) : (c.lifecycle ?? (isActiveClient(c) ? "active" : "archived")) === "archived",
      ),
    [store.clients, lifecycleView],
  );
  const [showColumns, setShowColumns] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [openClientId, setOpenClientId] = useState<string | null>(
    initialOpenClientId,
  );

  useEffect(() => {
    if (initialOpenClientId) setOpenClientId(initialOpenClientId);
  }, [initialOpenClientId]);

  useEffect(() => savePrefs(prefs), [prefs]);
  const setPref = <K extends keyof ViewPrefs>(key: K, value: ViewPrefs[K]) =>
    setPrefs((p) => ({ ...p, [key]: value }));

  const departmentRowsRef = useRef<Record<string, DepartmentStatus[]>>({});
  const filtered = useMemo(
    () =>
      filterAndSortClients(
        lifecycleFiltered,
        {
          selectedScope,
          search,
          statusFilter,
          allStatusesLabel: ALL_STATUSES,
          assignedOnly,
          currentAgent: displayName ?? "",
        },
        {
          field: prefs.sortField,
          direction: prefs.sortDir,
          extraSortValue: (c, field) =>
            field === "round"
              ? c.round
              : field === "openItems"
                ? c.openItems
                : field === "department"
                  ? (currentDepartment(departmentRowsRef.current[c.id] ?? [])?.department ?? "")
                  : field === "workStatus"
                    ? (currentDepartment(departmentRowsRef.current[c.id] ?? [])?.status ?? "")
                    : field === "openWork"
                      ? openDepartments(departmentRowsRef.current[c.id] ?? []).length
                      : undefined,
        },
      ),
    [
      lifecycleFiltered,
      search,
      statusFilter,
      selectedScope,
      assignedOnly,
      prefs.sortField,
      prefs.sortDir,
    ],
  );

  /* One bounded query for the visible clients' department rows — the
     operational columns read from it; never a query per row (rule 14). */
  const visibleIds = useMemo(() => filtered.map((c) => c.id), [filtered]);
  const { byClient: departmentRows } = useDepartmentStatusMap(visibleIds);
  departmentRowsRef.current = departmentRows;
  const activeCount = filtered.filter((c) => isActiveClient(c)).length;

  // Mode / Source is only meaningful in the cross-partner Management view.
  // Inside a single ManagedOps or Outsourcing Partner workspace, the mode is
  // implied by the group, so we hide it to reduce clutter.
  const hideModeCol = !!partner && GROUPS_HIDING_MODE.includes(partner.group);
  const availableCols = hideModeCol
    ? COLUMN_DEFS.filter((c) => c.id !== "mode")
    : COLUMN_DEFS;
  const visibleCols = availableCols.filter((c) =>
    prefs.visibleCols.includes(c.id),
  );

  if (openClientId) {
    return (
      <ClientWorkWorkspace
        clientId={openClientId}
        onBack={() => setOpenClientId(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="mb-2 flex items-center justify-end gap-2 text-xs">
        <span className="text-muted-foreground">Show</span>
        <OpsSelect
          value={lifecycleView}
          onValueChange={(v) => setLifecycleView(v as "active" | "all" | "archived")}
          options={[
            { value: "active", label: "Active clients" },
            { value: "all", label: "All clients" },
            { value: "archived", label: "Archived clients" },
          ]}
          aria-label="Lifecycle filter"
        />
      </div>
      <OpsClientListToolbar
        view={prefs.view}
        onViewChange={(v) => setPref("view", v)}
        assignedOnly={assignedOnly}
        onAssignedOnlyChange={setAssignedOnly}
        activeCount={activeCount}
        onAddClient={() => setShowAddClient(true)}
        availableCols={availableCols}
        visibleColIds={prefs.visibleCols}
        onVisibleColsChange={(ids) => setPref("visibleCols", ids)}
        columnsOpen={showColumns}
        onColumnsOpenChange={setShowColumns}
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusOptions={STATUS_OPTIONS}
      />

      {filtered.length === 0 ? (
        <ContentCard title="No clients match your filters">
          <p className="text-sm text-muted-foreground">
            Adjust the status filter or search to find clients for this Partner.
          </p>
        </ContentCard>
      ) : prefs.view === "list" ? (
        <ClientListTable
          departmentRows={departmentRows}
          clients={filtered}
          visibleCols={visibleCols}
          prefs={prefs}
          setPrefs={setPrefs}
          onOpenClient={setOpenClientId}
        />
      ) : (
        <ClientListGrid clients={filtered} onOpenClient={setOpenClientId} />
      )}

      <AddClientModal
        open={showAddClient}
        onClose={() => setShowAddClient(false)}
        partner={partner}
      />
    </div>
  );
}
