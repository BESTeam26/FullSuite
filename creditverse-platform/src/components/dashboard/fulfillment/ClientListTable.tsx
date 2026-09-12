/**
 * ClientListTable — CreditOps Main Client List, bound to the shared ops table.
 *
 * Supplies this division's status vocabulary, assignee pool, 4-hour SLA
 * threshold and its operational columns: Credit Stage (round), Current
 * Department, Work Status and Open Work — the last three derived from the
 * client's department rows (one batched query, passed in by the panel).
 */

import type { FulfillmentClient } from "@/lib/fulfillment/fulfillment-client-domain";
import { useCreditOpsStore } from "@/lib/fulfillment/creditops-client-store";
import {
  ALL_STATUS_OPTIONS,
  FulfillmentStatusPill,
  type ColDef,
  type ColId,
  type ViewPrefs,
} from "./client-list-helpers";
import { OpsClientListTable } from "./OpsClientListTable";
import type { DepartmentStatus } from "@/lib/fulfillment/creditops-store-types";
import { currentDepartment, departmentStatuses, openDepartments } from "@/lib/fulfillment/department-domain";
import {
  DaysToUpdateCell, DueDateOverrideCell, EditableChoiceCell, EditableDateCell,
} from "@/components/dashboard/fulfillment/ClientRowEditors";
import { setClientDepartmentStatus, updateClientField } from "@/lib/data/fulfillment-clients";
import { clearDueOverride, setDueOverride } from "@/lib/data/client-workflow";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { formatDate } from "@/lib/format-date";
import { useQueryClient } from "@tanstack/react-query";

/* Dee's board reaches Round 13; "Round 4+" stays for anything recorded under
   it before the numbered rounds existed (0189). */
const ROUND_OPTIONS = [
  "Pre-Round", "Round 1", "Round 2", "Round 3", "Round 4+",
  "Round 5", "Round 6", "Round 7", "Round 8", "Round 9",
  "Round 10", "Round 11", "Round 12", "Round 13", "Completed",
];
import { useAuth } from "@/lib/auth/auth-context";
import { useAssignableRoster } from "@/lib/data/use-workforce";

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
  /* Identities from the live Workforce roster, shared with intake. */
  const assignees = useAssignableRoster();
  /* A due date is the output of the SLA policy, so retyping one is a Team
     Lead action; everyone else reads it (Dee: no silent date edits). */
  const canOverrideDates = useAgencyPermissions().can("ops.manage");
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
          case "dueDate": {
            /* The due date belongs to the department that owns the deadline,
               and `fulfillment_clients.due_at` is the derived read of it. So
               the cell adjusts the department — with the reason the SLA policy
               requires — rather than typing over a calculated value. */
            const cur = currentDepartment(departmentRows[client.id] ?? []);
            const due = (client as { dueAt?: string | null }).dueAt ?? null;
            if (!canOverrideDates) {
              return (
                <span className="text-[11px] text-foreground">
                  {due ? formatDate(due) : <span className="text-muted-foreground">—</span>}
                </span>
              );
            }
            return (
              <DueDateOverrideCell
                value={due}
                department={cur?.department ?? null}
                onSave={async (date, reason) => {
                  await setDueOverride(client.id, cur!.department, date, reason);
                  await refresh();
                }}
                onClear={async () => {
                  await clearDueOverride(client.id, cur!.department);
                  await refresh();
                }}
              />
            );
          }
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
          case "departmentStatus": {
            /* "Complaints · FTC Needed" — the operational state in one
               human phrase, the way Dee reads it out loud. */
            const cur = currentDepartment(departmentRows[client.id] ?? []);
            if (!cur) return <span className="text-muted-foreground">No open work</span>;
            return (
              <span className="flex min-w-0 items-center gap-1 text-[11px]">
                <span className="font-semibold text-foreground">{cur.department}</span>
                <span className="text-muted-foreground">·</span>
                <span className="truncate text-foreground">{cur.status}</span>
              </span>
            );
          }
          case "department": {
            const cur = currentDepartment(departmentRows[client.id] ?? []);
            return cur ? (
              <span className="font-semibold text-foreground">{cur.department}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            );
          }
          case "workStatus": {
            /* The operational status of the department currently working the
               file — the one an agent changes all day. `set_client_department_
               status` validates it against that department's vocabulary and
               writes the activity entry in the same transaction, so the row
               cannot record a status the department does not have. */
            const cur = currentDepartment(departmentRows[client.id] ?? []);
            if (!cur) return <span className="text-muted-foreground">No open work</span>;
            return (
              <EditableChoiceCell
                label={`${cur.department} work status`}
                value={cur.status}
                options={departmentStatuses(cur.department)}
                onSave={async (next) => {
                  await setClientDepartmentStatus({
                    clientId: client.id,
                    department: cur.department,
                    status: next,
                  });
                  await refresh();
                }}
              />
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
