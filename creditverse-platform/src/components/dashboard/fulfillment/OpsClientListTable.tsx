/**
 * OpsClientListTable — the list view of a division's Main Client List.
 * Sortable headers, resizable columns, inline editing, avatars, open file.
 *
 * Inline email edits enforce the ONE EMAIL = ONE FILE PER PARTNER rule with an
 * in-app warning helper (never native alert/confirm):
 *   - Same email on THIS partner  → hard block banner, edit rejected.
 *   - Same email on ANOTHER partner → warn banner + "Confirm separate
 *     enrollment" so the agent can decide & document (cancel & re-enroll /
 *     shopping both). Confirming logs the decision to Activity.
 *
 * CreditOps and FundingOps render the identical table; they differ only in
 * their status vocabulary, assignee pool, SLA warning threshold and the one or
 * two columns unique to each (dispute round / open items vs open files /
 * requested amount). Those arrive as props, so the table itself never reaches
 * into a division store.
 */

import { useState, type ReactNode } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown, Pencil } from "lucide-react";
import {
  checkClientConflict,
  clientGroupKey,
  clientGroupLabel,
  type OpsClient,
} from "@/lib/fulfillment/ops-client-domain";
import {
  Avatar,
  ModeBadge,
  EMAIL_RE,
  PHONE_RE,
  type ColDef,
  type ViewPrefs,
} from "./ops-client-list-helpers";
import {
  EmailConflictBanner,
  type EmailConflictState,
} from "./EmailConflictBanner";
import { cn } from "@/lib/utils";
import { OpsSelect } from "@/components/ui/ops-select";

/** The store operations the table needs, supplied by the owning division. */
export interface OpsClientListActions<T extends OpsClient> {
  /** Full client set for the division — used for the duplicate-email check. */
  allClients: T[];
  updateStatus: (clientId: string, status: string, actor: string) => void;
  updateAssignee: (clientId: string, agent: string, actor: string) => void;
  /** False when the division cannot yet save an assignment; see the store. */
  canAssign: boolean;
  updateContact: (
    clientId: string,
    field: "email" | "phone",
    value: string,
    actor: string,
  ) => void;
  logActivity: (entry: {
    clientId: string;
    actor: string;
    action: string;
    detail: string;
    field?: string;
    previousValue?: string;
    newValue?: string;
  }) => void;
}

interface OpsClientListTableProps<T extends OpsClient, Id extends string> {
  clients: T[];
  visibleCols: ColDef<Id>[];
  prefs: ViewPrefs<Id>;
  setPrefs: React.Dispatch<React.SetStateAction<ViewPrefs<Id>>>;
  onOpenClient: (id: string) => void;
  actions: OpsClientListActions<T>;
  /** Name recorded as the actor on every edit this table performs. */
  actor: string;
  /** Selectable statuses for the inline status editor. */
  statusOptions: readonly string[];
  /** Scoped assignee pool — never the whole agency directory. */
  assignees: readonly string[];
  renderStatusPill: (status: string) => ReactNode;
  /** SLA hours at or below which the figure turns red. */
  slaWarningHours: number;
  /** Cells for columns unique to this division. Return null if unhandled. */
  renderExtraCell: (client: T, colId: Id) => ReactNode | null;
}

export function OpsClientListTable<T extends OpsClient, Id extends string>({
  clients,
  visibleCols,
  prefs,
  setPrefs,
  onOpenClient,
  actions,
  actor,
  statusOptions,
  assignees,
  renderStatusPill,
  slaWarningHours,
  renderExtraCell,
}: OpsClientListTableProps<T, Id>) {
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [editingContact, setEditingContact] = useState<{
    id: string;
    field: "email" | "phone";
    value: string;
  } | null>(null);
  /** Active inline-email conflict banner (replaces native alert/confirm). */
  const [emailConflict, setEmailConflict] =
    useState<EmailConflictState<T> | null>(null);

  const setPref = <K extends keyof ViewPrefs<Id>>(
    key: K,
    value: ViewPrefs<Id>[K],
  ) => setPrefs((p) => ({ ...p, [key]: value }));

  const startResize = (e: React.MouseEvent, colId: Id) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW =
      prefs.colWidths[colId] ??
      visibleCols.find((c) => c.id === colId)!.defaultWidth;
    const def = visibleCols.find((c) => c.id === colId)!;
    const onMove = (ev: MouseEvent) => {
      const newW = Math.max(
        def.minWidth,
        Math.min(400, startW + (ev.clientX - startX)),
      );
      setPrefs((p) => ({ ...p, colWidths: { ...p.colWidths, [colId]: newW } }));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const handleSort = (colId: Id) => {
    const def = visibleCols.find((c) => c.id === colId);
    if (!def?.sortable) return;
    if (prefs.sortField === colId) {
      setPref("sortDir", prefs.sortDir === "asc" ? "desc" : "asc");
    } else {
      setPref("sortField", colId);
      setPref("sortDir", "asc");
    }
  };

  const commitStatus = (clientId: string, newStatus: string) => {
    actions.updateStatus(clientId, newStatus, actor);
    setEditingStatusId(null);
  };
  const commitAgent = (clientId: string, newAgent: string) => {
    actions.updateAssignee(clientId, newAgent, actor);
    setEditingAgentId(null);
  };
  const commitContact = () => {
    if (!editingContact) return;
    const { id, field, value } = editingContact;
    if (!value.trim()) {
      setEditingContact(null);
      return;
    }
    const valid =
      field === "email"
        ? EMAIL_RE.test(value)
        : value === "" || PHONE_RE.test(value);
    if (!valid) {
      setEditingContact(null);
      return;
    }
    // Email guard: one email = one file per Partner. Show an in-app warning
    // banner (never native alert/confirm) so the agent can decide + document.
    if (field === "email") {
      const me = actions.allClients.find((c) => c.id === id);
      const scopeId = me ? clientGroupKey(me) : "";
      const conflict = checkClientConflict(
        value,
        scopeId,
        actions.allClients.filter((c) => c.id !== id),
      );
      if (
        conflict.sameScopeDuplicate ||
        conflict.crossScopeMatches.length > 0
      ) {
        setEmailConflict({
          clientId: id,
          value: value.trim(),
          sameScopeDuplicate: conflict.sameScopeDuplicate,
          crossScopeMatches: conflict.crossScopeMatches,
        });
        setEditingContact(null);
        return;
      }
    }
    actions.updateContact(id, field, value.trim(), actor);
    setEditingContact(null);
  };

  /** Agent confirmed a cross-partner email change → apply + log the decision. */
  const confirmCrossPartnerEmail = () => {
    if (!emailConflict) return;
    actions.updateContact(
      emailConflict.clientId,
      "email",
      emailConflict.value,
      actor,
    );
    actions.logActivity({
      clientId: emailConflict.clientId,
      actor,
      action: "Cross-partner email confirmed",
      detail: `Email set to ${emailConflict.value} — agent confirmed separate enrollment. Also on: ${emailConflict.crossScopeMatches
        .map((m) => `${m.name} (${clientGroupLabel(m)})`)
        .join(", ")}.`,
      field: "email",
      previousValue: undefined,
      newValue: emailConflict.value,
    });
    setEmailConflict(null);
  };

  const renderCell = (client: T, colId: Id): ReactNode => {
    switch (colId) {
      case "client":
        return (
          <button onClick={() => onOpenClient(client.id)} className="text-left">
            <p className="font-medium text-foreground hover:text-primary">
              {client.name}
            </p>
            <p className="text-[11px] text-muted-foreground">{client.email}</p>
          </button>
        );
      case "email":
        if (
          editingContact?.id === client.id &&
          editingContact.field === "email"
        ) {
          return (
            <input
              autoFocus
              defaultValue={client.email}
              onBlur={commitContact}
              onKeyDown={(e) => e.key === "Enter" && commitContact()}
              onChange={(e) =>
                setEditingContact({
                  id: client.id,
                  field: "email",
                  value: e.target.value,
                })
              }
              className="w-full rounded border border-primary bg-background px-1.5 py-1 text-xs text-foreground focus:outline-none"
            />
          );
        }
        return (
          <div className="group flex items-center gap-1.5">
            <span className="text-xs text-foreground">{client.email}</span>
            <button
              onClick={() =>
                setEditingContact({
                  id: client.id,
                  field: "email",
                  value: client.email,
                })
              }
              className="opacity-0 group-hover:opacity-100"
            >
              <Pencil className="h-3 w-3 text-muted-foreground hover:text-primary" />
            </button>
          </div>
        );
      case "phone":
        if (
          editingContact?.id === client.id &&
          editingContact.field === "phone"
        ) {
          return (
            <input
              autoFocus
              defaultValue={client.phone ?? ""}
              onBlur={commitContact}
              onKeyDown={(e) => e.key === "Enter" && commitContact()}
              onChange={(e) =>
                setEditingContact({
                  id: client.id,
                  field: "phone",
                  value: e.target.value,
                })
              }
              className="w-full rounded border border-primary bg-background px-1.5 py-1 text-xs text-foreground focus:outline-none"
            />
          );
        }
        return (
          <div className="group flex items-center gap-1.5">
            <span className="text-xs text-foreground">
              {client.phone ?? "—"}
            </span>
            <button
              onClick={() =>
                setEditingContact({
                  id: client.id,
                  field: "phone",
                  value: client.phone ?? "",
                })
              }
              className="opacity-0 group-hover:opacity-100"
            >
              <Pencil className="h-3 w-3 text-muted-foreground hover:text-primary" />
            </button>
          </div>
        );
      case "mode":
        return <ModeBadge client={client} />;
      case "status":
        if (editingStatusId === client.id) {
          return (
            <OpsSelect
              autoFocus
              openOnMount
              size="inline"
              aria-label="Status"
              value={client.status}
              onValueChange={(v) => commitStatus(client.id, v)}
              onDismiss={() => setEditingStatusId(null)}
              options={statusOptions}
            />
          );
        }
        return (
          <button onClick={() => setEditingStatusId(client.id)}>
            {renderStatusPill(client.status)}
          </button>
        );
      case "agent":
        if (editingAgentId === client.id) {
          return (
            <OpsSelect
              autoFocus
              openOnMount
              size="inline"
              aria-label="Assignee"
              value={client.assignedAgent ?? "Unassigned"}
              onValueChange={(v) => commitAgent(client.id, v)}
              onDismiss={() => setEditingAgentId(null)}
              options={assignees}
            />
          );
        }
        // Read-only until the division can resolve a person to a profile
        // record. Rendering an editor that fails on save is worse than showing
        // the value plainly (rule 3).
        if (!actions.canAssign) {
          return (
            <span
              className="inline-flex items-center gap-1.5"
              title="Assignment becomes editable once the Workforce directory is connected."
            >
              <Avatar name={client.assignedAgent ?? "Unassigned"} />
              <span className="text-xs text-foreground">
                {client.assignedAgent ?? "Unassigned"}
              </span>
            </span>
          );
        }
        return (
          <button
            onClick={() => setEditingAgentId(client.id)}
            className="inline-flex items-center gap-1.5"
          >
            <Avatar name={client.assignedAgent ?? "Unassigned"} />
            <span className="text-xs text-foreground">
              {client.assignedAgent ?? "Unassigned"}
            </span>
          </button>
        );
      case "sla":
        return client.slaHoursRemaining !== undefined ? (
          <span
            className={cn(
              "font-medium",
              client.slaHoursRemaining <= slaWarningHours
                ? "text-red-600"
                : "text-foreground",
            )}
          >
            {client.slaHoursRemaining}h
          </span>
        ) : (
          "—"
        );
      case "lastActivity":
        return (
          <span className="text-xs text-muted-foreground">
            {client.lastActivity}
          </span>
        );
      default:
        // Columns unique to the division (round / openItems / openFiles / requested).
        return renderExtraCell(client, colId);
    }
  };

  return (
    <div className="space-y-3">
      {emailConflict && (
        <EmailConflictBanner
          conflict={emailConflict}
          onDismiss={() => setEmailConflict(null)}
          onConfirmCrossPartner={confirmCrossPartnerEmail}
        />
      )}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {visibleCols.map((col) => (
                <th
                  key={col.id}
                  style={{
                    width: prefs.colWidths[col.id] ?? col.defaultWidth,
                    minWidth: col.minWidth,
                  }}
                  className="relative px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap"
                >
                  <button
                    onClick={() => handleSort(col.id)}
                    disabled={!col.sortable}
                    className={cn(
                      "inline-flex items-center gap-1",
                      col.sortable && "cursor-pointer hover:text-foreground",
                    )}
                  >
                    {col.label}
                    {col.sortable &&
                      prefs.sortField === col.id &&
                      (prefs.sortDir === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      ))}
                    {col.sortable && prefs.sortField !== col.id && (
                      <ArrowUpDown className="h-3 w-3 opacity-40" />
                    )}
                  </button>
                  <span
                    onMouseDown={(e) => startResize(e, col.id)}
                    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/30"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {clients.map((c) => (
              <tr
                key={c.id}
                className="cursor-pointer transition-colors hover:bg-muted/30"
                onClick={() => onOpenClient(c.id)}
              >
                {visibleCols.map((col) => (
                  <td
                    key={col.id}
                    style={{
                      width: prefs.colWidths[col.id] ?? col.defaultWidth,
                      minWidth: col.minWidth,
                    }}
                    className="px-3 py-2.5 text-foreground whitespace-nowrap"
                    onClick={(e) => {
                      const tag = (e.target as HTMLElement).tagName;
                      if (["INPUT", "SELECT", "BUTTON", "OPTION"].includes(tag))
                        e.stopPropagation();
                    }}
                  >
                    {renderCell(c, col.id)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
