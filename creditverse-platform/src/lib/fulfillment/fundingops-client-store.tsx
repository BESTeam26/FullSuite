/**
 * FundingOps Client Store — shared mutable client + activity store.
 *
 * This is the SINGLE source of truth for the FundingOps fulfillment workspace.
 * The Main Client List, every stage queue, and the Funding Work workspace all
 * read from and write to this one store. That guarantees:
 *
 *   - One canonical funding client record (no duplicates across queues)
 *   - One email = one file per Partner (hard block on same-scope duplicate)
 *   - Cross-partner duplicates are allowed but warned (cancel & re-enroll)
 *   - Every change (status, assignee, email, phone) is logged to Activity
 *   - Inline edits in the table and full-file edits stay in sync
 *   - Status changes fire an onStatusChange hook so external CRM webhooks
 *     can push the change to GHL / generic endpoints
 *
 * The store is a React context so it can be consumed by any component under
 * the FundingOps page without prop drilling.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { seedFundingClients } from "@/lib/fulfillment/fundingops-seed";
import type { FundingClient } from "@/lib/fulfillment/fundingops-domain";
import { clientGroupLabel } from "@/lib/fulfillment/fundingops-domain";
import {
  type FundingActivityEntry,
  type FundingDepartmentStatus,
  type FundingCommentMark,
  checkFundingClientConflict,
  seedFundingDepartmentStatuses,
} from "@/lib/fulfillment/fundingops-store-types";
import {
  FUNDING_COMMENT_MARKS,
  getFundingMark,
} from "@/lib/fulfillment/fundingops-store-types";

export type FundingStatusChangeHandler = (payload: {
  clientId: string;
  clientName: string;
  partnerName: string;
  previousStatus: string;
  newStatus: string;
}) => void;

export type {
  FundingActivityEntry,
  FundingDepartmentStatus,
  FundingCommentMark,
};
export { FUNDING_COMMENT_MARKS, getFundingMark };

/* ------------------------------------------------------------------ */
/* Store shape                                                         */
/* ------------------------------------------------------------------ */

export interface AddFundingClientOutcome {
  id: string;
  /** true when the add was blocked by a same-scope duplicate. */
  blocked: boolean;
  /** Existing record that already owns this email in the same scope. */
  existing?: FundingClient;
  /** Same email found on other partner scopes (informational). */
  crossScopeMatches: FundingClient[];
}

interface FundingOpsStoreValue {
  clients: FundingClient[];
  activity: FundingActivityEntry[];
  getActivity: (clientId: string) => FundingActivityEntry[];
  getDepartmentStatuses: (clientId: string) => FundingDepartmentStatus[];
  updateStatus: (
    clientId: string,
    newStatus: FundingClient["status"],
    actor: string,
  ) => void;
  updateAssignee: (
    clientId: string,
    newAssignee: string,
    actor: string,
  ) => void;
  updateContact: (
    clientId: string,
    field: "email" | "phone",
    value: string,
    actor: string,
  ) => void;
  addClient: (
    client: Omit<FundingClient, "id" | "lastActivity" | "createdAt">,
  ) => AddFundingClientOutcome;
  addActivity: (entry: Omit<FundingActivityEntry, "id" | "timestamp">) => void;
  togglePin: (activityId: string) => void;
  setMark: (activityId: string, mark: string | undefined) => void;
  /** Record one production unit (one file worked) with the selected actions. */
  logProduction: (input: {
    clientId: string;
    clientName: string;
    partnerName: string;
    department: string;
    actions: string[];
    workNotes?: string;
    actor: string;
  }) => void;
}

const FundingOpsStoreContext = createContext<FundingOpsStoreValue | null>(null);

/* Module-level handler so the store can fire webhooks without prop drilling. */
let statusChangeHandler: FundingStatusChangeHandler | null = null;
export const setFundingStatusChangeHandler = (
  h: FundingStatusChangeHandler | null,
) => {
  statusChangeHandler = h;
};

/* Eligible assignees — scoped, NOT the entire agency directory. */
export const FUNDING_ELIGIBLE_ASSIGNEES = [
  "Keila Betancourt",
  "Carlos Mendoza",
  "Maria Santos",
  "James Wilson",
  "Unassigned",
];

const nowISO = () => new Date().toISOString();
const newActId = () =>
  `fact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export function FundingOpsStoreProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<FundingClient[]>(() =>
    seedFundingClients.map((c) => ({ ...c })),
  );
  const [activity, setActivity] = useState<FundingActivityEntry[]>([]);
  const [deptStatuses, setDeptStatuses] = useState<
    Record<string, FundingDepartmentStatus[]>
  >(() => {
    const map: Record<string, FundingDepartmentStatus[]> = {};
    seedFundingClients.forEach((c) => {
      map[c.id] = seedFundingDepartmentStatuses(c);
    });
    return map;
  });

  const addActivity = useCallback(
    (entry: Omit<FundingActivityEntry, "id" | "timestamp">) => {
      setActivity((prev) => [
        { ...entry, id: newActId(), timestamp: nowISO() },
        ...prev,
      ]);
    },
    [],
  );

  const togglePin = useCallback((activityId: string) => {
    setActivity((prev) =>
      prev.map((a) => (a.id === activityId ? { ...a, pinned: !a.pinned } : a)),
    );
  }, []);

  const setMark = useCallback(
    (activityId: string, mark: string | undefined) => {
      setActivity((prev) =>
        prev.map((a) =>
          a.id === activityId
            ? { ...a, mark: a.mark === mark ? undefined : mark }
            : a,
        ),
      );
    },
    [],
  );

  const getActivity = useCallback(
    (clientId: string) => activity.filter((a) => a.clientId === clientId),
    [activity],
  );

  const getDepartmentStatuses = useCallback(
    (clientId: string) => deptStatuses[clientId] ?? [],
    [deptStatuses],
  );

  const updateStatus = useCallback(
    (clientId: string, newStatus: FundingClient["status"], actor: string) => {
      setClients((prev) => {
        const client = prev.find((c) => c.id === clientId);
        if (!client) return prev;
        const prevStatus = client.status;
        if (prevStatus === newStatus) return prev;
        setActivity((a) => [
          {
            id: newActId(),
            timestamp: nowISO(),
            clientId,
            actor,
            action: "Status changed",
            detail: `${prevStatus} → ${newStatus}`,
            field: "status",
            previousValue: prevStatus,
            newValue: newStatus,
          },
          ...a,
        ]);
        if (statusChangeHandler) {
          try {
            statusChangeHandler({
              clientId,
              clientName: client.name,
              partnerName: clientGroupLabel(client),
              previousStatus: prevStatus,
              newStatus,
            });
          } catch {
            /* webhook failures must never block the status update */
          }
        }
        return prev.map((c) =>
          c.id === clientId
            ? { ...c, status: newStatus, lastActivity: "Just now" }
            : c,
        );
      });
    },
    [],
  );

  const updateAssignee = useCallback(
    (clientId: string, newAssignee: string, actor: string) => {
      setClients((prev) =>
        prev.map((c) => {
          if (c.id !== clientId) return c;
          const prevAssignee = c.assignedAgent ?? "Unassigned";
          if (prevAssignee === newAssignee) return c;
          setActivity((a) => [
            {
              id: newActId(),
              timestamp: nowISO(),
              clientId,
              actor,
              action: "Assignment changed",
              detail: `${prevAssignee} → ${newAssignee}`,
              field: "assignedAgent",
              previousValue: prevAssignee,
              newValue: newAssignee,
            },
            ...a,
          ]);
          return { ...c, assignedAgent: newAssignee, lastActivity: "Just now" };
        }),
      );
    },
    [],
  );

  const updateContact = useCallback(
    (
      clientId: string,
      field: "email" | "phone",
      value: string,
      actor: string,
    ) => {
      setClients((prev) =>
        prev.map((c) => {
          if (c.id !== clientId) return c;
          const prevValue = (c[field] as string) ?? "—";
          if (prevValue === value) return c;
          setActivity((a) => [
            {
              id: newActId(),
              timestamp: nowISO(),
              clientId,
              actor,
              action: `${field === "email" ? "Email" : "Phone"} updated`,
              detail: `${prevValue} → ${value}`,
              field,
              previousValue: prevValue,
              newValue: value,
            },
            ...a,
          ]);
          return { ...c, [field]: value, lastActivity: "Just now" };
        }),
      );
    },
    [],
  );

  const addClient = useCallback(
    (
      client: Omit<FundingClient, "id" | "lastActivity" | "createdAt">,
    ): AddFundingClientOutcome => {
      const scopeId =
        client.mode === "saas_pulled"
          ? (client.organizationId ?? "")
          : (client.outsourcingGroupId ?? "");

      // HARD RULE: one email = one file per Partner. Block same-scope dupes.
      const conflict = checkFundingClientConflict(
        client.email,
        scopeId,
        clients,
      );
      if (conflict.sameScopeDuplicate) {
        return {
          id: conflict.sameScopeDuplicate.id,
          blocked: true,
          existing: conflict.sameScopeDuplicate,
          crossScopeMatches: conflict.crossScopeMatches,
        };
      }

      const id = `ffc-${Date.now()}`;
      const newClient: FundingClient = {
        ...client,
        id,
        lastActivity: "Just now",
        createdAt: new Date().toISOString().split("T")[0],
      };
      setClients((prev) => [...prev, newClient]);
      setDeptStatuses((prev) => ({
        ...prev,
        [id]: seedFundingDepartmentStatuses(newClient),
      }));

      const crossNote =
        conflict.crossScopeMatches.length > 0
          ? ` · ⚠ also on ${conflict.crossScopeMatches
              .map((m) => clientGroupLabel(m))
              .join(", ")}`
          : "";
      setActivity((a) => [
        {
          id: newActId(),
          timestamp: nowISO(),
          clientId: id,
          actor: client.assignedAgent ?? "Agent (BES HQ)",
          action: "Client created",
          detail: `Added ${client.name} to workspace${crossNote}`,
        },
        ...a,
      ]);
      return {
        id,
        blocked: false,
        crossScopeMatches: conflict.crossScopeMatches,
      };
    },
    [clients],
  );

  const logProduction = useCallback(
    (input: {
      clientId: string;
      clientName: string;
      partnerName: string;
      department: string;
      actions: string[];
      workNotes?: string;
      actor: string;
    }) => {
      setActivity((a) => [
        {
          id: newActId(),
          timestamp: nowISO(),
          clientId: input.clientId,
          actor: input.actor,
          action: `[WORK_COMPLETED] ${input.department}`,
          detail: `File: ${input.clientName} · Actions: ${input.actions.join(", ")}${input.workNotes ? ` · Notes: ${input.workNotes}` : ""}`,
          field: "completeWork",
          previousValue: undefined,
          newValue: `${input.actions.length} action(s) logged`,
        },
        ...a,
      ]);
      if (statusChangeHandler) {
        try {
          statusChangeHandler({
            clientId: input.clientId,
            clientName: input.clientName,
            partnerName: input.partnerName,
            previousStatus: "—",
            newStatus: `Work completed (${input.department})`,
          });
        } catch {
          /* webhook failures must never block the production log */
        }
      }
    },
    [],
  );

  const value = useMemo<FundingOpsStoreValue>(
    () => ({
      clients,
      activity,
      getActivity,
      getDepartmentStatuses,
      updateStatus,
      updateAssignee,
      updateContact,
      addClient,
      addActivity,
      togglePin,
      setMark,
      logProduction,
    }),
    [
      clients,
      activity,
      getActivity,
      getDepartmentStatuses,
      updateStatus,
      updateAssignee,
      updateContact,
      addClient,
      addActivity,
      togglePin,
      setMark,
      logProduction,
    ],
  );

  return (
    <FundingOpsStoreContext.Provider value={value}>
      {children}
    </FundingOpsStoreContext.Provider>
  );
}

export function useFundingOpsStore(): FundingOpsStoreValue {
  const ctx = useContext(FundingOpsStoreContext);
  if (ctx) return ctx;
  const noop = () => {};
  return {
    clients: [],
    activity: [],
    getActivity: () => [],
    getDepartmentStatuses: () => [],
    updateStatus: noop,
    updateAssignee: noop,
    updateContact: noop,
    addClient: () => ({ id: "", blocked: true, crossScopeMatches: [] }),
    addActivity: noop,
    togglePin: noop,
    setMark: noop,
    logProduction: noop,
  };
}
