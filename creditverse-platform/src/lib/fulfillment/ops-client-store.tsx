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
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/auth-context";
import { DEFAULT_VISIBILITY, postNote } from "@/lib/data/activity";
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
  /**
   * Whether assignment can actually be saved right now.
   *
   * A division whose backend cannot yet resolve a person to a profile record
   * reports false, and the interface must not offer the control (rule 3: if a
   * user cannot use something, do not render it). Previously the control was
   * rendered and threw an error after the click.
   */
  canAssign: boolean;
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

/**
 * A division's live backend. Supplying one makes the store read and write the
 * database whenever the app is in live mode; without one the division stays on
 * seed data, which is how a division is carried until its tables exist.
 */
export interface OpsClientLiveBackend<T extends OpsClient, D> {
  fetchClients: () => Promise<T[]>;
  fetchDepartmentStatuses: (clientId: string) => Promise<D[]>;
  updateStatus: (clientId: string, status: string) => Promise<void>;
  /**
   * Omit until the division can resolve an assignee to a real profile id.
   * Names are not identities (rule 4), so a division without a people
   * directory reports "cannot assign" rather than guessing from a name.
   */
  updateAssignee?: (clientId: string, assigneeName: string) => Promise<void>;
  updateContact: (
    clientId: string,
    field: "email" | "phone",
    value: string,
  ) => Promise<void>;
  /**
   * Tenant-owned writes receive the agency from the authenticated context —
   * never from a component, a constant, or anything a caller could choose.
   * The database checks it again through RLS.
   */
  addClient: (
    client: Omit<T, "id" | "lastActivity" | "createdAt">,
    agencyId: string,
  ) => Promise<string>;
  logProduction: (input: ProductionLogInput, agencyId: string) => Promise<void>;
}

export interface OpsClientStoreConfig<T extends OpsClient, D> {
  seedClients: T[];
  /** `activity_events.entity_type` for this division's records. */
  activityEntityType: string;
  /** Initial per-department / per-stage statuses for a client. */
  seedDepartmentStatuses: (client: T) => D[];
  /** Prefix for generated activity ids, e.g. "act" or "fact". */
  activityIdPrefix: string;
  /** Prefix for generated client ids, e.g. "fc" or "ffc". */
  clientIdPrefix: string;
  /** Cache key root for this division's live queries. */
  queryKey: string;
  /** Omit to keep the division on seed data. */
  live?: OpsClientLiveBackend<T, D>;
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

  /** Seed-data implementation. Used in demo mode, and by any division
      that has no live backend yet. */
  function DemoProvider({ children }: { children: ReactNode }) {
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
        prev.map((a) =>
          a.id === activityId ? { ...a, pinned: !a.pinned } : a,
        ),
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
        canAssign: true,
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

  /* ------------------------------------------------------------------ */
  /* Live implementation                                                 */
  /*                                                                     */
  /* Same contract as DemoProvider, backed by the database. Reads go      */
  /* through TanStack Query under one key so multiple panels asking for   */
  /* the client list share a single request (rule 14); writes invalidate  */
  /* that key rather than each maintaining its own copy.                  */
  /* ------------------------------------------------------------------ */

  function LiveProvider({
    backend,
    children,
  }: {
    backend: OpsClientLiveBackend<T, D>;
    children: ReactNode;
  }) {
    const queryClient = useQueryClient();
    /* The one place a division learns which agency it is acting for. Read from
       the authenticated context, never passed in — a caller that could choose
       the agency is the vulnerability this removes. */
    const { agencyId, user } = useAuth();
    const userId = user?.id;
    const clientsKey = [config.queryKey, "clients"];

    const clientsQuery = useQuery({
      queryKey: clientsKey,
      queryFn: backend.fetchClients,
      staleTime: 15_000,
    });
    const clients = useMemo(() => clientsQuery.data ?? [], [clientsQuery.data]);

    /* Department statuses belong to one open file, so they are fetched per
       client and cached separately — never loaded with the whole list. */
    const [deptStatuses, setDeptStatuses] = useState<Record<string, D[]>>({});
    const requested = useRef<Set<string>>(new Set());

    const invalidate = useCallback(
      () => queryClient.invalidateQueries({ queryKey: clientsKey }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [queryClient],
    );

    const report = (action: string) => (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`${action} failed`, { description: msg });
    };

    /* Activity lives in its own table and is read by the timeline component;
       the store exposes an empty list here rather than pretending to hold it. */
    const activity: OpsActivityEntry[] = [];

    const getDepartmentStatuses = useCallback(
      (clientId: string) => {
        if (!requested.current.has(clientId)) {
          requested.current.add(clientId);
          backend
            .fetchDepartmentStatuses(clientId)
            .then((rows) =>
              setDeptStatuses((prev) => ({ ...prev, [clientId]: rows })),
            )
            .catch(report("Loading department status"));
        }
        return deptStatuses[clientId] ?? [];
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [deptStatuses],
    );

    const updateStatus = useCallback(
      (clientId: string, newStatus: string) => {
        const client = clients.find((c) => c.id === clientId);
        if (!client || client.status === newStatus) return;
        void backend
          .updateStatus(clientId, newStatus)
          .then(() => {
            notifyStatusChange({
              clientId,
              clientName: client.name,
              partnerName: clientGroupLabel(client),
              previousStatus: client.status,
              newStatus,
            });
            return invalidate();
          })
          .catch(report("Status update"));
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [clients, invalidate],
    );

    const canAssign = Boolean(backend.updateAssignee);

    const updateAssignee = useCallback(
      (clientId: string, newAssignee: string) => {
        if (!backend.updateAssignee) return;
        void backend
          .updateAssignee(clientId, newAssignee)
          .then(invalidate)
          .catch(report("Assignment update"));
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [invalidate],
    );

    const updateContact = useCallback(
      (clientId: string, field: "email" | "phone", value: string) => {
        void backend
          .updateContact(clientId, field, value)
          .then(invalidate)
          .catch(report("Contact update"));
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [invalidate],
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
        // The database has the authoritative unique index; this pre-check is
        // what lets the interface explain the collision before writing.
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
        if (!agencyId) {
          // Default deny. Without a resolved agency there is no tenant to file
          // this under, and guessing one is exactly the failure this guards.
          report("Adding client")(
            new Error("No agency context — cannot create this record."),
          );
          return { id: "", blocked: true, crossScopeMatches: [] };
        }
        void backend
          .addClient(client, agencyId)
          .then(invalidate)
          .catch(report("Adding client"));
        return {
          id: "",
          blocked: false,
          crossScopeMatches: conflict.crossScopeMatches,
        };
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [clients, invalidate, agencyId],
    );

    /**
     * Persist a human note onto the canonical timeline.
     *
     * The audience is the author's explicit choice, defaulting to the most
     * restrictive level when a caller supplies none. The database checks it
     * again in the insert policy, so a tampered client cannot post as an
     * audience it is not entitled to.
     */
    const postLiveNote = useCallback(
      (entry: Omit<OpsActivityEntry, "id" | "timestamp">) => {
        const client = clients.find((c) => c.id === entry.clientId);
        if (!agencyId || !userId) return;
        void postNote({
          agencyId,
          organizationId: client?.organizationId,
          entityType: config.activityEntityType,
          entityId: entry.clientId,
          actorId: userId,
          actorName: entry.actor,
          action: entry.action,
          detail: entry.detail,
          visibility: entry.visibility ?? DEFAULT_VISIBILITY,
          mark: entry.mark,
        })
          .then(invalidate)
          .catch(report("Posting note"));
      },
      [agencyId, userId, clients, invalidate],
    );

    const logProduction = useCallback(
      (input: ProductionLogInput) => {
        if (!agencyId) {
          report("Logging production")(
            new Error("No agency context — cannot record this work."),
          );
          return;
        }
        void backend
          .logProduction(input, agencyId)
          .then(() => {
            notifyStatusChange({
              clientId: input.clientId,
              clientName: input.clientName,
              partnerName: input.partnerName,
              previousStatus: "—",
              newStatus: `Work completed (${input.department})`,
            });
            return invalidate();
          })
          .catch(report("Logging production"));
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [invalidate],
    );

    const noop = () => {};
    const value = useMemo<OpsClientStoreValue<T, D>>(
      () => ({
        clients,
        activity,
        getActivity: () => [],
        getDepartmentStatuses,
        updateStatus,
        updateAssignee,
        canAssign,
        updateContact,
        checkAddConflict,
        addClient,
        addActivity: postLiveNote,
        togglePin: noop,
        setMark: noop,
        logProduction,
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [
        clients,
        getDepartmentStatuses,
        updateStatus,
        updateAssignee,
        updateContact,
        checkAddConflict,
        addClient,
        logProduction,
      ],
    );

    return <Context.Provider value={value}>{children}</Context.Provider>;
  }

  /**
   * Chooses the implementation. Both hooks below are safe to skip because only
   * one provider component is ever mounted; the choice is made by auth mode and
   * whether this division has a live backend at all.
   */
  function Provider({ children }: { children: ReactNode }) {
    const { mode, status } = useAuth();
    const useLive =
      Boolean(config.live) && mode === "live" && status === "signed-in";
    return useLive ? (
      <LiveProvider backend={config.live!}>{children}</LiveProvider>
    ) : (
      <DemoProvider>{children}</DemoProvider>
    );
  }

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
      canAssign: false,
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
