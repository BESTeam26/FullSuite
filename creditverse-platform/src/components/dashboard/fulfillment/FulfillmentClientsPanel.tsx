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

import { useEffect, useMemo, useState } from "react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { seedOutsourcingGroups } from "@/lib/fulfillment/fulfillment-client-seed";
import { useCreditOpsStore } from "@/lib/fulfillment/creditops-client-store";
import type { CreditOpsPartner } from "@/lib/fulfillment/creditops-partners";
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
import { OutsourcingGroupCard } from "./OutsourcingGroupCard";
import { AddClientModal } from "./AddClientModal";
import { ClientWorkWorkspace } from "./ClientWorkWorkspace";

const ALL_STATUSES = "All Statuses";
const CURRENT_AGENT = "Keila Betancourt";
const INACTIVE_STATUSES = ["Completed", "Archived", "Graduated"];

/** Groups whose Partner workspace hides the Mode / Source column. */
const GROUPS_HIDING_MODE = ["managed", "outsourcing"];

interface FulfillmentClientsPanelProps {
  selectedScope?: string;
  assignedOnlyFilter?: boolean;
  partner?: CreditOpsPartner | undefined;
}

export function FulfillmentClientsPanel({
  selectedScope = "all",
  assignedOnlyFilter = false,
  partner,
}: FulfillmentClientsPanelProps) {
  const store = useCreditOpsStore();
  const [prefs, setPrefs] = useState<ViewPrefs>(() => loadPrefs());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL_STATUSES);
  const [assignedOnly, setAssignedOnly] = useState(assignedOnlyFilter);
  const [showColumns, setShowColumns] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [openClientId, setOpenClientId] = useState<string | null>(null);

  useEffect(() => savePrefs(prefs), [prefs]);
  const setPref = <K extends keyof ViewPrefs>(key: K, value: ViewPrefs[K]) =>
    setPrefs((p) => ({ ...p, [key]: value }));

  const filtered = useMemo(
    () =>
      filterAndSortClients(
        store.clients,
        {
          selectedScope,
          search,
          statusFilter,
          allStatusesLabel: ALL_STATUSES,
          assignedOnly,
          currentAgent: CURRENT_AGENT,
        },
        {
          field: prefs.sortField,
          direction: prefs.sortDir,
          extraSortValue: (c, field) =>
            field === "round"
              ? c.round
              : field === "openItems"
                ? c.openItems
                : undefined,
        },
      ),
    [
      store.clients,
      search,
      statusFilter,
      selectedScope,
      assignedOnly,
      prefs.sortField,
      prefs.sortDir,
    ],
  );

  const activeCount = countActive(filtered, INACTIVE_STATUSES);

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

  const scopedGroup = seedOutsourcingGroups.find(
    (g) => g.id === selectedScope && selectedScope !== "all",
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
          clients={filtered}
          visibleCols={visibleCols}
          prefs={prefs}
          setPrefs={setPrefs}
          onOpenClient={setOpenClientId}
        />
      ) : (
        <ClientListGrid clients={filtered} onOpenClient={setOpenClientId} />
      )}

      {scopedGroup && <OutsourcingGroupCard group={scopedGroup} />}

      <AddClientModal
        open={showAddClient}
        onClose={() => setShowAddClient(false)}
        partner={partner}
      />
    </div>
  );
}
