/**
 * FundingClientListTable — FundingOps Main Client List, bound to the shared
 * ops table.
 *
 * Supplies this division's status vocabulary, assignee pool, 8-hour SLA
 * threshold and its two unique columns: Open Files and Requested amount.
 */

import type { FundingClient } from "@/lib/fulfillment/fundingops-domain";
import type { FundingDepartmentStatus } from "@/lib/fulfillment/fundingops-store-types";
import { FUNDINGOPS_DEPARTMENT_ORDER, isOpenFundingStatus } from "@/lib/fulfillment/funding-department-domain";
import { formatCurrency } from "@/lib/fulfillment/fundingops-domain";
import { useAuth } from "@/lib/auth/auth-context";
import { useWorkforce } from "@/lib/data/use-workforce";
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

/* Who is actually doing it. Every activity entry used to be attributed to
   "Agent (BES HQ)" — a name nobody has — so history could not say who did the
   work (rules 4 and 10). Read from the session, per render. */
const useActor = () => useAuth().displayName ?? "BES staff";
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
  /** Department rows per client id (batched by the panel). */
  departmentRows: Record<string, FundingDepartmentStatus[]>;
}

export function FundingClientListTable({
  clients,
  visibleCols,
  prefs,
  setPrefs,
  onOpenClient,
  departmentRows,
}: FundingClientListTableProps) {
  /* The real roster, not a list of names in the source. "Unassigned" first so
     the honest choice is the default and nobody has to pick a person to save. */
  const roster = useWorkforce();
  const assignees = [
    ...FUNDING_ELIGIBLE_ASSIGNEES,
    ...(roster.data?.people ?? []).map((x) => x.name).filter(Boolean),
  ];
  const actor = useActor();
  const order = new Map(FUNDINGOPS_DEPARTMENT_ORDER.map((d, i) => [d as string, i]));
  const openRows = (id: string) =>
    (departmentRows[id] ?? [])
      .filter((r) => isOpenFundingStatus(r.status))
      .sort((a, b) => (order.get(a.department) ?? 99) - (order.get(b.department) ?? 99));
  const store = useFundingOpsStore();

  return (
    <OpsClientListTable<FundingClient, FundingColId>
      clients={clients}
      visibleCols={visibleCols}
      prefs={prefs}
      setPrefs={setPrefs}
      onOpenClient={onOpenClient}
      actor={actor}
      statusOptions={ASSIGNABLE_STATUSES}
      assignees={assignees}
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
          case "department": {
            const cur = openRows(client.id)[0];
            return cur ? <span className="font-semibold text-foreground">{cur.department}</span> : <span className="text-muted-foreground">—</span>;
          }
          case "workStatus": {
            const cur = openRows(client.id)[0];
            return cur ? (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-status-success">{cur.status}</span>
            ) : (
              <span className="text-muted-foreground">No open work</span>
            );
          }
          case "openWork":
            return <span className="text-foreground">{openRows(client.id).length}</span>;
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
