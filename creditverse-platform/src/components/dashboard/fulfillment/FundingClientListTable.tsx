/**
 * FundingClientListTable — the list view of the FundingOps Main Client List.
 * Sortable headers, resizable columns, inline editing, avatars, open file.
 *
 * Inline email edits enforce the ONE EMAIL = ONE FILE PER PARTNER rule with an
 * in-app warning helper (never native alert/confirm):
 *   - Same email on THIS partner  → hard block banner, edit rejected.
 *   - Same email on ANOTHER partner → warn banner + "Confirm separate
 *     enrollment" so the agent can decide & document (cancel & re-enroll /
 *     shopping both). Confirming logs the decision to Activity.
 */

import { useState, type ReactNode } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown, Pencil } from "lucide-react";
import type { FundingClient } from "@/lib/fulfillment/fundingops-domain";
import {
  checkFundingClientConflict,
  clientGroupKey,
  clientGroupLabel,
  formatCurrency,
} from "@/lib/fulfillment/fundingops-domain";
import {
  useFundingOpsStore,
  FUNDING_ELIGIBLE_ASSIGNEES,
} from "@/lib/fulfillment/fundingops-client-store";
import {
  type FundingColDef,
  type FundingColId,
  type FundingViewPrefs,
  FundingStatusPill,
  FundingModeBadge,
  FundingAvatar,
  FUNDING_EMAIL_RE,
  FUNDING_PHONE_RE,
} from "./funding-client-list-helpers";
import {
  FundingEmailConflictBanner,
  type FundingEmailConflictState,
} from "./FundingEmailConflictBanner";
import { cn } from "@/lib/utils";

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
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [editingContact, setEditingContact] = useState<{
    id: string;
    field: "email" | "phone";
    value: string;
  } | null>(null);
  const [emailConflict, setEmailConflict] =
    useState<FundingEmailConflictState | null>(null);

  const setPref = <K extends keyof FundingViewPrefs>(
    key: K,
    value: FundingViewPrefs[K],
  ) => setPrefs((p) => ({ ...p, [key]: value }));

  const startResize = (e: React.MouseEvent, colId: FundingColId) => {
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

  const handleSort = (colId: FundingColId) => {
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
    store.updateStatus(
      clientId,
      newStatus as FundingClient["status"],
      "Agent (BES HQ)",
    );
    setEditingStatusId(null);
  };
  const commitAgent = (clientId: string, newAgent: string) => {
    store.updateAssignee(clientId, newAgent, "Agent (BES HQ)");
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
        ? FUNDING_EMAIL_RE.test(value)
        : value === "" || FUNDING_PHONE_RE.test(value);
    if (!valid) {
      setEditingContact(null);
      return;
    }
    if (field === "email") {
      const me = store.clients.find((c) => c.id === id);
      const scopeId = me ? clientGroupKey(me) : "";
      const conflict = checkFundingClientConflict(
        value,
        scopeId,
        store.clients.filter((c) => c.id !== id),
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
    store.updateContact(id, field, value.trim(), "Agent (BES HQ)");
    setEditingContact(null);
  };

  const confirmCrossPartnerEmail = () => {
    if (!emailConflict) return;
    store.updateContact(
      emailConflict.clientId,
      "email",
      emailConflict.value,
      "Agent (BES HQ)",
    );
    store.addActivity({
      clientId: emailConflict.clientId,
      actor: "Agent (BES HQ)",
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

  const renderCell = (
    client: FundingClient,
    colId: FundingColId,
  ): ReactNode => {
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
        return <FundingModeBadge client={client} />;
      case "status":
        if (editingStatusId === client.id) {
          return (
            <select
              autoFocus
              defaultValue={client.status}
              onBlur={(e) => commitStatus(client.id, e.target.value)}
              onChange={(e) => commitStatus(client.id, e.target.value)}
              className="rounded border border-primary bg-background px-1.5 py-1 text-[11px] text-foreground focus:outline-none"
            >
              {[
                "Onboarding",
                "Readiness Review",
                "Document Review",
                "Lender Matching",
                "Submitted",
                "Stipulations",
                "Offer Received",
                "Funded",
                "Declined",
                "Withdrawn",
                "Archived",
              ].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          );
        }
        return (
          <button onClick={() => setEditingStatusId(client.id)}>
            <FundingStatusPill status={client.status} />
          </button>
        );
      case "agent":
        if (editingAgentId === client.id) {
          return (
            <select
              autoFocus
              defaultValue={client.assignedAgent ?? "Unassigned"}
              onBlur={(e) => commitAgent(client.id, e.target.value)}
              onChange={(e) => commitAgent(client.id, e.target.value)}
              className="rounded border border-primary bg-background px-1.5 py-1 text-[11px] text-foreground focus:outline-none"
            >
              {FUNDING_ELIGIBLE_ASSIGNEES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          );
        }
        return (
          <button
            onClick={() => setEditingAgentId(client.id)}
            className="inline-flex items-center gap-1.5"
          >
            <FundingAvatar name={client.assignedAgent ?? "Unassigned"} />
            <span className="text-xs text-foreground">
              {client.assignedAgent ?? "Unassigned"}
            </span>
          </button>
        );
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
      case "sla":
        return client.slaHoursRemaining !== undefined ? (
          <span
            className={cn(
              "font-medium",
              client.slaHoursRemaining <= 8
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
        return null;
    }
  };

  return (
    <div className="space-y-3">
      {emailConflict && (
        <FundingEmailConflictBanner
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
