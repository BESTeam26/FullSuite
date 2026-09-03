/**
 * Ops Client Store factory — the shared mutable client + activity store used by
 * every Managed Operations division.
 *
 * One store per division is the SINGLE source of truth for that division's
 * workspace. The Main Client List, every Queue, and the Client Work workspace
 * all read from and write to it. That guarantees:
 *
 *   - One canonical client record (no duplicates across queues)
 *   - One email = one file per Partner (hard block on same-scope duplicate)
 *   - Cross-partner duplicates are allowed but reported (cancel & re-enroll)
 *   - Every change (status, assignee, email, phone) is logged to Activity
 *   - Inline edits in the table and full-file edits stay in sync
 *   - Status changes fire an onStatusChange hook so external CRM webhooks
 *     can push the change to GHL / DisputeFox / generic endpoints
 *
 * CreditOps and FundingOps previously kept byte-identical copies of all of this
 * (rule 13). `createOpsClientStore` builds one, closing over the division's own
 * seed data, department seeding and id prefixes. Each call gets its own context
 * and its own status-change handler, so the divisions stay fully isolated.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  checkClientConflict,
  clientGroupLabel,
  type ClientConflictResult,
  type OpsClient,
} from "@/lib/fulfillment/ops-client-domain";
import type { OpsActivityEntry } from "@/lib/fulfillment/ops-activity-domain";

export interface StatusChangePayload {
  clientId: string;
  clientName: string;
  partnerName: string;
  previousStatus: string;
  newStatus: string;
}

export type StatusChangeHandler = (payload: StatusChangePayload) => void;

/** Result of attempting to add a client. */
export interface AddClientOutcome<T extends OpsClient> {
  id: string;
  /** true when the add was blocked by a same-scope duplicate. */
  blocked: boolean;
  /** Existing record that already owns this email in the same scope. */
  existing?: T;
  /** Same email found on other partner scopes (informational). */
  crossScopeMatches: T[];
}

export interface ProductionLogInput {
  clientId: string;
  clientName: string;
  partnerName: string;
  department: string;
  /** Labels of the selected Work Completion actions. */
  actions: string[];
  workNotes?: string;
  actor: string;
}

export interface OpsClientStoreValue<T extends OpsClient, D> {
  clients: T[];
  activity: OpsActivityEntry[];
  getActivity: (clientId: string) => OpsActivityEntry[];
  getDepartmentStatuses: (clientId: string) => D[];
  updateStatus: (clientId: string, newStatus: string, actor: string) => void;
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
  /**
   * What would adding this client collide with? Performs NO write, so intake
   * surfaces can warn and take a decision BEFORE the record exists.
   */
  checkAddConflict: (
    client: Omit<T, "id" | "lastActivity" | "createdAt">,
  ) => ClientConflictResult<T>;
  addClient: (
    client: Omit<T, "id" | "lastActivity" | "createdAt">,
  ) => AddClientOutcome<T>;
  addActivity: (entry: Omit<OpsActivityEntry, "id" | "timestamp">) => void;
  togglePin: (activityId: string) => void;
  setMark: (activityId: string, mark: string | undefined) => void;
  /** Record one production unit (one file worked) with the selected actions. */
  logProduction: (input: ProductionLogInput) => void;
}

export interface OpsClientStoreConfig<T extends OpsClient, D> {
  seedClients: T[];
  /** Initial per-department / per-stage statuses for a client. */
  seedDepartmentStatuses: (client: T) => D[];
  /** Prefix for generated activity ids, e.g. "act" or "fact". */
  activityIdPrefix: string;
  /** Prefix for generated client ids, e.g. "fc" or "ffc". */
  clientIdPrefix: string;
}

const nowISO = () => new Date().toISOString();

/** The partner scope a candidate client would belong to. */
const scopeIdOf = (client: {
  mode: string;
  organizationId?: string;
  outsourcingGroupId?: string;
}): string =>
  client.mode === "saas_pulled"
    ? (client.organizationId ?? "")
    : (client.outsourcingGroupId ?? "");

export function createOpsClientStore<T extends OpsClient, D>(
  config: OpsClientStoreConfig<T, D>,
) {
  const Context = createContext<OpsClientStoreValue<T, D> | null>(null);

  /**
   * Per-division handler so the store can fire webhooks without prop drilling
   * through every queue and table. Set by whichever provider owns the bridge.
   */
  let statusChangeHandler: StatusChangeHandler | null = null;
  const setStatusChangeHandler = (h: StatusChangeHandler | null) => {
    statusChangeHandler = h;
  };

  const newActId = () =>
    `${config.activityIdPrefix}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)}`;

  /** Webhook failures must never block the operational change that caused them. */
  const notifyStatusChange = (payload: StatusChangePayload) => {
    if (!statusChangeHandler) return;
    try {
      statusChangeHandler(payload);
    } catch {
      /* deliberately swallowed — see above */
    }
  };

  function Provider({ children }: { children: ReactNode }) {
    const [clients, setClients] = useState<T[]>(() =>
      config.seedClients.map((c) => ({ ...c })),
    );
    const [activity, setActivity] = useState<OpsActivityEntry[]>([]);
    const [deptStatuses, setDeptStatuses] = useState<Record<string, D[]>>(
      () => {
        const map: Record<string, D[]> = {};
        config.seedClients.forEach((c) => {
          map[c.id] = config.seedDepartmentStatuses(c);
        });
        return map;
      },
    );

    const addActivity = useCallback(
      (entry: Omit<OpsActivityEntry, "id" | "timestamp">) => {
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
      (clientId: string, newStatus: string, actor: string) => {
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
          notifyStatusChange({
            clientId,
            clientName: client.name,
            partnerName: clientGroupLabel(client),
            previousStatus: prevStatus,
            newStatus,
          });
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
            return {
              ...c,
              assignedAgent: newAssignee,
              lastActivity: "Just now",
            };
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

    const checkAddConflict = useCallback(
      (client: Omit<T, "id" | "lastActivity" | "createdAt">) =>
        checkClientConflict(client.email, scopeIdOf(client), clients),
      [clients],
    );

    const addClient = useCallback(
      (
        client: Omit<T, "id" | "lastActivity" | "createdAt">,
      ): AddClientOutcome<T> => {
        // HARD RULE: one email = one file per Partner. Block same-scope dupes.
        const conflict = checkClientConflict(
          client.email,
          scopeIdOf(client),
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

        const id = `${config.clientIdPrefix}-${Date.now()}`;
        const newClient = {
          ...client,
          id,
          lastActivity: "Just now",
          createdAt: new Date().toISOString().split("T")[0],
        } as T;
        setClients((prev) => [...prev, newClient]);
        setDeptStatuses((prev) => ({
          ...prev,
          [id]: config.seedDepartmentStatuses(newClient),
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

    const logProduction = useCallback((input: ProductionLogInput) => {
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
      notifyStatusChange({
        clientId: input.clientId,
        clientName: input.clientName,
        partnerName: input.partnerName,
        previousStatus: "—",
        newStatus: `Work completed (${input.department})`,
      });
    }, []);

    const value = useMemo<OpsClientStoreValue<T, D>>(
      () => ({
        clients,
        activity,
        getActivity,
        getDepartmentStatuses,
        updateStatus,
        updateAssignee,
        updateContact,
        checkAddConflict,
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
        checkAddConflict,
        addClient,
        addActivity,
        togglePin,
        setMark,
        logProduction,
      ],
    );

    return <Context.Provider value={value}>{children}</Context.Provider>;
  }

  /**
   * Reading the store outside its provider yields an inert store rather than
   * throwing, so a panel rendered in isolation degrades to an empty list
   * instead of crashing the workspace.
   */
  function useStore(): OpsClientStoreValue<T, D> {
    const ctx = useContext(Context);
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
      checkAddConflict: () => ({ crossScopeMatches: [] }),
      addClient: () => ({ id: "", blocked: true, crossScopeMatches: [] }),
      addActivity: noop,
      togglePin: noop,
      setMark: noop,
      logProduction: noop,
    };
  }

  return { Provider, useStore, setStatusChangeHandler };
}
