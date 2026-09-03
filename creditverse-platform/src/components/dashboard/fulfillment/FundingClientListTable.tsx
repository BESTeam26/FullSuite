/**
 * FundingClientListTable — FundingOps Main Client List, bound to the shared
 * ops table.
 *
 * Supplies this division's status vocabulary, assignee pool, 8-hour SLA
 * threshold and its two unique columns: Open Files and Requested amount.
 */

import type { FundingClient } from "@/lib/fulfillment/fundingops-domain";
import { formatCurrency } from "@/lib/fulfillment/fundingops-domain";
import {
  useFundingOpsStore,
  FUNDING_ELIGIBLE_ASSIGNEES,
} from "@/lib/fulfillment/fundingops-client-store";
import {
  FUNDING_STATUS_OPTIONS,
  FundingStatusPill,
  type FundingColDef,
  type FundingColId,
  type FundingViewPrefs,
} from "./funding-client-list-helpers";
import { OpsClientListTable } from "./OpsClientListTable";

const ACTOR = "Agent (BES HQ)";
const SLA_WARNING_HOURS = 8;

/** "All Statuses" is a filter option, not an assignable status. */
const ASSIGNABLE_STATUSES = FUNDING_STATUS_OPTIONS.filter(
  (s) => s !== "All Statuses",
);

interface FundingClientListTableProps {
  clients: FundingClient[];
  visibleCols: FundingColDef[];
  prefs: FundingViewPrefs;
  setPrefs: React.Dispatch<React.SetStateAction<FundingViewPrefs>>;
  onOpenClient: (id: string) => void;
}

export function FundingClientListTable({
  clients,
  visibleCols,
  prefs,
  setPrefs,
  onOpenClient,
}: FundingClientListTableProps) {
  const store = useFundingOpsStore();

  return (
    <OpsClientListTable<FundingClient, FundingColId>
      clients={clients}
      visibleCols={visibleCols}
      prefs={prefs}
      setPrefs={setPrefs}
      onOpenClient={onOpenClient}
      actor={ACTOR}
      statusOptions={ASSIGNABLE_STATUSES}
      assignees={FUNDING_ELIGIBLE_ASSIGNEES}
      slaWarningHours={SLA_WARNING_HOURS}
      renderStatusPill={(status) => <FundingStatusPill status={status} />}
      actions={{
        allClients: store.clients,
        updateStatus: (id, status, actor) =>
          store.updateStatus(id, status as FundingClient["status"], actor),
        updateAssignee: store.updateAssignee,
        canAssign: store.canAssign,
        updateContact: store.updateContact,
        logActivity: store.addActivity,
      }}
      renderExtraCell={(client, colId) => {
        switch (colId) {
          case "openFiles":
            return <span className="text-foreground">{client.openFiles}</span>;
          case "requested":
            return (
              <span className="text-xs font-semibold text-foreground">
                {client.totalRequested
                  ? formatCurrency(client.totalRequested)
                  : "—"}
              </span>
            );
          default:
            return null;
        }
      }}
    />
  );
}
