/**
 * ClientListTable — CreditOps Main Client List, bound to the shared ops table.
 *
 * Supplies this division's status vocabulary, assignee pool, 4-hour SLA
 * threshold and its operational columns: Credit Stage (round), Current
 * Department, Work Status and Open Work — the last three derived from the
 * client's department rows (one batched query, passed in by the panel).
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
import type { DepartmentStatus } from "@/lib/fulfillment/creditops-store-types";
import { currentDepartment, openDepartments } from "@/lib/fulfillment/department-domain";
import { useAuth } from "@/lib/auth/auth-context";
import { useWorkforce } from "@/lib/data/use-workforce";

/* Who is actually doing it. Every activity entry used to be attributed to
   "Agent (BES HQ)" — a name nobody has — so history could not say who did the
   work (rules 4 and 10). Read from the session, per render. */
const useActor = () => useAuth().displayName ?? "BES staff";
const SLA_WARNING_HOURS = 4;

interface ClientListTableProps {
  clients: FulfillmentClient[];
  visibleCols: ColDef<ColId>[];
  prefs: ViewPrefs;
  setPrefs: React.Dispatch<React.SetStateAction<ViewPrefs>>;
  onOpenClient: (id: string) => void;
  /** Department rows per client id (batched by the panel). */
  departmentRows: Record<string, DepartmentStatus[]>;
}

export function ClientListTable({
  clients,
  visibleCols,
  prefs,
  setPrefs,
  onOpenClient,
  departmentRows,
}: ClientListTableProps) {
  /* The real roster, not a list of names in the source. "Unassigned" first so
     the honest choice is the default and nobody has to pick a person to save. */
  const roster = useWorkforce();
  const assignees = [
    ...ELIGIBLE_ASSIGNEES,
    ...(roster.data?.people ?? []).map((x) => x.name).filter(Boolean),
  ];
  const actor = useActor();
  const store = useCreditOpsStore();

  return (
    <OpsClientListTable<FulfillmentClient, ColId>
      clients={clients}
      visibleCols={visibleCols}
      prefs={prefs}
      setPrefs={setPrefs}
      onOpenClient={onOpenClient}
      actor={actor}
      statusOptions={ALL_STATUS_OPTIONS}
      assignees={assignees}
      slaWarningHours={SLA_WARNING_HOURS}
      renderStatusPill={(status) => <FulfillmentStatusPill status={status} />}
      actions={{
        allClients: store.clients,
        updateStatus: (id, status, actor) =>
          store.updateStatus(id, status as FulfillmentClient["status"], actor),
        updateAssignee: store.updateAssignee,
        canAssign: store.canAssign,
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
          case "department": {
            const cur = currentDepartment(departmentRows[client.id] ?? []);
            return cur ? (
              <span className="font-semibold text-foreground">{cur.department}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            );
          }
          case "workStatus": {
            const cur = currentDepartment(departmentRows[client.id] ?? []);
            return cur ? (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-status-success">
                {cur.status}
              </span>
            ) : (
              <span className="text-muted-foreground">No open work</span>
            );
          }
          case "openWork":
            return <span className="text-foreground">{openDepartments(departmentRows[client.id] ?? []).length}</span>;
          default:
            return null;
        }
      }}
    />
  );
}
