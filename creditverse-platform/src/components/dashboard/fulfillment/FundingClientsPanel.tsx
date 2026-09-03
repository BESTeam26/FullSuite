/**
 * Funding Clients panel — Main Client List for the selected FundingOps Partner.
 *
 * ONE canonical client list per Partner. A fast ClickUp/Airtable-style
 * operational client table, purpose-built for FundingOps.
 *
 * Filtering, the toolbar and the outsourcing-group card are shared with
 * CreditOps; this file supplies the FundingOps store, columns, statuses and
 * its own sort fields.
 */

import { useEffect, useMemo, useState } from "react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { seedFundingGroups } from "@/lib/fulfillment/fundingops-seed";
import { useFundingOpsStore } from "@/lib/fulfillment/fundingops-client-store";
import type { FundingOpsPartner } from "@/lib/fulfillment/fundingops-partners";
import {
  countActive,
  filterAndSortClients,
} from "@/lib/fulfillment/ops-client-filtering";
import { INACTIVE_FUNDING_STATUSES } from "@/lib/fulfillment/fundingops-domain";
import {
  FUNDING_COLUMN_DEFS,
  FUNDING_STATUS_OPTIONS,
  loadFundingPrefs,
  saveFundingPrefs,
  type FundingViewPrefs,
} from "./funding-client-list-helpers";
import { FundingClientListTable } from "./FundingClientListTable";
import { FundingClientListGrid } from "./FundingClientListGrid";
import { OpsClientListToolbar } from "./OpsClientListToolbar";
import { OutsourcingGroupCard } from "./OutsourcingGroupCard";
import { FundingAddClientModal } from "./FundingAddClientModal";
import { FundingClientWorkWorkspace } from "./FundingClientWorkWorkspace";
import { usePartners } from "@/lib/data/use-partners";
import { FUNDING_OPS_PARTNERS } from "@/lib/fulfillment/fundingops-partners";

const ALL_STATUSES = "All Statuses";
const CURRENT_AGENT = "Keila Betancourt";

/** Groups whose Partner workspace hides the Mode / Source column. */
const GROUPS_HIDING_MODE = ["outsourcing"];

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
  /* Offered in the Add Client modal when this panel has no partner in context
     (the management-level list). Cached by query key, so asking here costs
     nothing extra. */
  const { partners: livePartners } = usePartners(
    "fundingOps",
    FUNDING_OPS_PARTNERS,
  );
  const store = useFundingOpsStore();
  const [prefs, setPrefs] = useState<FundingViewPrefs>(() =>
    loadFundingPrefs(),
  );
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL_STATUSES);
  const [assignedOnly, setAssignedOnly] = useState(assignedOnlyFilter);
  const [showColumns, setShowColumns] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [openClientId, setOpenClientId] = useState<string | null>(null);

  useEffect(() => saveFundingPrefs(prefs), [prefs]);
  const setPref = <K extends keyof FundingViewPrefs>(
    key: K,
    value: FundingViewPrefs[K],
  ) => setPrefs((p) => ({ ...p, [key]: value }));

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
            field === "openFiles"
              ? c.openFiles
              : field === "requested"
                ? (c.totalRequested ?? 0)
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

  const activeCount = countActive(filtered, INACTIVE_FUNDING_STATUSES);

  const hideModeCol = !!partner && GROUPS_HIDING_MODE.includes(partner.group);
  const availableCols = hideModeCol
    ? FUNDING_COLUMN_DEFS.filter((c) => c.id !== "mode")
    : FUNDING_COLUMN_DEFS;
  const visibleCols = availableCols.filter((c) =>
    prefs.visibleCols.includes(c.id),
  );

  const scopedGroup = seedFundingGroups.find(
    (g) => g.id === selectedScope && selectedScope !== "all",
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
        statusOptions={FUNDING_STATUS_OPTIONS}
      />

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

      {scopedGroup && <OutsourcingGroupCard group={scopedGroup} />}

      <FundingAddClientModal
        open={showAddClient}
        onClose={() => setShowAddClient(false)}
        partner={partner}
        partnerOptions={
          partner
            ? undefined
            : livePartners.map((p) => ({
                scopeId: p.scopeId,
                name: p.name,
                mode: p.mode,
              }))
        }
      />
    </div>
  );
}
