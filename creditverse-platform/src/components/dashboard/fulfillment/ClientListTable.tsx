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
import {
  DaysToUpdateCell, EditableChoiceCell, EditableDateCell,
} from "@/components/dashboard/fulfillment/ClientRowEditors";
import { updateClientField } from "@/lib/data/fulfillment-clients";
import { useQueryClient } from "@tanstack/react-query";

/* Dee's board reaches Round 13; "Round 4+" stays for anything recorded under
   it before the numbered rounds existed (0189). */
const ROUND_OPTIONS = [
  "Pre-Round", "Round 1", "Round 2", "Round 3", "Round 4+",
  "Round 5", "Round 6", "Round 7", "Round 8", "Round 9",
  "Round 10", "Round 11", "Round 12", "Round 13", "Completed",
];
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
  const queryClient = useQueryClient();
  /* One invalidation after an inline edit. The list is a shared query, so
     refetching it here is what puts the new value in front of everybody
     looking at the same row rather than only the person who typed it. */
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["creditops"] });
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
          /* Editable in the row, like the board Dee runs today. Every one of
             these writes the record and the database trigger writes the
             activity entry — the screen never logs its own change. */
          case "round":
            return (
              <EditableChoiceCell
                label="Current round"
                value={client.round}
                options={ROUND_OPTIONS}
                onSave={async (next) => {
                  await updateClientField({ clientId: client.id, round: next as never });
                  await refresh();
                }}
              />
            );
          case "processed":
            return (
              <EditableDateCell
                label="Processed date"
                value={(client as { processedOn?: string | null }).processedOn ?? null}
                onSave={async (next) => {
                  await updateClientField({ clientId: client.id, processedOn: next });
                  await refresh();
                }}
              />
            );
          case "dueDate":
            return (
              <EditableDateCell
                label="Due date"
                value={(client as { dueAt?: string | null }).dueAt ?? null}
                onSave={async (next) => {
                  await updateClientField({ clientId: client.id, dueAt: next });
                  await refresh();
                }}
              />
            );
          case "daysToUpdate":
            return <DaysToUpdateCell dueAt={(client as { dueAt?: string | null }).dueAt ?? null} />;
          case "latestComment": {
            const latest = store.getActivity(client.id)[0];
            return latest ? (
              <span className="block truncate text-[11px] text-muted-foreground" title={latest.detail}>
                {latest.detail || latest.action}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            );
          }
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
