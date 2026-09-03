/**
 * ClientListTable — CreditOps Main Client List, bound to the shared ops table.
 *
 * Supplies this division's status vocabulary, assignee pool, 4-hour SLA
 * threshold and its two unique columns: dispute Round and Open Items.
 */

import type { FulfillmentClient } from "@/lib/fulfillment/fulfillment-client-domain";
import {
  useCreditOpsStore,
  ELIGIBLE_ASSIGNEES,
} from "@/lib/fulfillment/creditops-client-store";
import {
  ALL_STATUS_OPTIONS,
  FulfillmentStatusPill,
  type ColDef,
  type ColId,
  type ViewPrefs,
} from "./client-list-helpers";
import { OpsClientListTable } from "./OpsClientListTable";

const ACTOR = "Agent (BES HQ)";
const SLA_WARNING_HOURS = 4;

interface ClientListTableProps {
  clients: FulfillmentClient[];
  visibleCols: ColDef<ColId>[];
  prefs: ViewPrefs;
  setPrefs: React.Dispatch<React.SetStateAction<ViewPrefs>>;
  onOpenClient: (id: string) => void;
}

export function ClientListTable({
  clients,
  visibleCols,
  prefs,
  setPrefs,
  onOpenClient,
}: ClientListTableProps) {
  const store = useCreditOpsStore();

  return (
    <OpsClientListTable<FulfillmentClient, ColId>
      clients={clients}
      visibleCols={visibleCols}
      prefs={prefs}
      setPrefs={setPrefs}
      onOpenClient={onOpenClient}
      actor={ACTOR}
      statusOptions={ALL_STATUS_OPTIONS}
      assignees={ELIGIBLE_ASSIGNEES}
      slaWarningHours={SLA_WARNING_HOURS}
      renderStatusPill={(status) => <FulfillmentStatusPill status={status} />}
      actions={{
        allClients: store.clients,
        updateStatus: (id, status, actor) =>
          store.updateStatus(
            id,
            status as FulfillmentClient["status"],
            actor,
          ),
        updateAssignee: store.updateAssignee,
        updateContact: store.updateContact,
        logActivity: store.addActivity,
      }}
      renderExtraCell={(client, colId) => {
        switch (colId) {
          case "round":
            return (
              <span className="font-semibold text-foreground">
                {client.round}
              </span>
            );
          case "openItems":
            return <span className="text-foreground">{client.openItems}</span>;
          default:
            return null;
        }
      }}
    />
  );
}
