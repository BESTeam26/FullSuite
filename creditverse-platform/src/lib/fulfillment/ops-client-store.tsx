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
import { errorMessage } from "@/lib/data/error-message";
import { useAuth } from "@/lib/auth/auth-context";
import {
  DEFAULT_VISIBILITY,
  postNote,
  timelineKey,
  type TimelineEntry,
} from "@/lib/data/activity";
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
  /**
   * Mutations resolve when the database has accepted the write, and reject
   * when it has not. Callers await them so a control can show a pending state
   * and, on failure, keep what the user typed instead of clearing it.
   */
  updateStatus: (
    clientId: string,
    newStatus: string,
    actor: string,
  ) => Promise<void>;
  updateAssignee: (
    clientId: string,
    newAssignee: string,
    actor: string,
  ) => Promise<void>;
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
  ) => Promise<void>;
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
  /**
   * Persist a note. Resolves with the created activity id, which the composer
   * needs in order to attach uploaded files to the row that now exists.
   */
  addActivity: (
    entry: Omit<OpsActivityEntry, "id" | "timestamp"> & { body?: unknown },
  ) => Promise<string | void>;
  togglePin: (activityId: string) => void;
  setMark: (activityId: string, mark: string | undefined) => void;
  /** Record one production unit (one file worked) with the selected actions. */
  logProduction: (input: ProductionLogInput) => Promise<void>;
}

/**
 * A division's live backend. Supplying one makes the store read and write the
 * database whenever the app is in live mode; without one the division stays on
 * seed data, which is how a division is carried until its tables exist.
 */
export interface OpsClientLiveBackend<T extends OpsClient, D> {
  fetchClients: () => Promise<T[]>;
  fetchDepartmentStatuses: (clientId: string) => Promise<D[]>;
  /**
   * Writes resolve to the updated canonical row.
   *
   * That row is what lets the store patch one entry in the cached list rather
   * than invalidating the whole thing. A backend that returned `void` left the
   * caller no way to see the result except refetching 13.2kb (rule 14).
   */
  updateStatus: (clientId: string, status: string) => Promise<T>;
  /**
   * Omit until the division can resolve an assignee to a real profile id.
   * Names are not identities (rule 4), so a division without a people
   * directory reports "cannot assign" rather than guessing from a name.
   */
  updateAssignee?: (clientId: string, assigneeName: string) => Promise<T>;
  updateContact: (
    clientId: string,
    field: "email" | "phone",
    value: string,
  ) => Promise<T>;
  /**
   * Tenant-owned writes receive the agency from the authenticated context —
   * never from a component, a constant, or anything a caller could choose.
   * The database checks it again through RLS.
   */
  addClient: (
    client: Omit<T, "id" | "lastActivity" | "createdAt">,
    agencyId: string,
  ) => Promise<string>;
  logProduction: (
    input: ProductionLogInput,
    agencyId: string,
    employeeId: string,
  ) => Promise<void>;
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

/**
 * Wrap a mutation so its rejection is never "unhandled", without swallowing it.
 *
 * Store mutations toast their own failure and then rethrow, so an awaiting
 * caller — the comment composer, Complete Work — can keep what the user typed
 * and offer a retry. Most callers do not await; for them the toast is the whole
 * error surface, and an un-awaited rejection would reach the console as an
 * unhandled rejection.
 *
 * Attaching a no-op handler marks the promise handled but does not consume it:
 * rejection tracking is per-promise, and `await` still throws for callers that
 * want it. One place, so no call site has to remember either behaviour.
 */
const handled =
  <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
  (...args: A): Promise<R> => {
    const p = fn(...args);
    p.catch(() => {});
    return p;
  };

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
      async (entry: Omit<OpsActivityEntry, "id" | "timestamp">) => {
        const id = newActId();
        setActivity((prev) => [{ ...entry, id, timestamp: nowISO() }, ...prev]);
        return id;
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
      async (clientId: string, newStatus: string, actor: string) => {
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
      async (clientId: string, newAssignee: string, actor: string) => {
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
      async (
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

    const logProduction = useCallback(async (input: ProductionLogInput) => {
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

    /**
     * Replace one client in the cached list with the row the database just
     * returned.
     *
     * Every mutation used to invalidate `clientsKey`, which refetched all
     * seventeen clients (13.2kb) to show one changed field. Every queue in the
     * division filters this same cached array — there are no separate queue
     * queries — so patching the row here updates the list, every queue and
     * every count at once, with no request at all (rule 14).
     */
    const patchClient = useCallback(
      (updated: T) => {
        queryClient.setQueryData<T[]>(clientsKey, (prev) =>
          prev
            ? prev.map((c) => (c.id === updated.id ? updated : c))
            : prev,
        );
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [queryClient],
    );

    /** For writes that change list MEMBERSHIP, not just one row's fields. */
    const invalidate = useCallback(
      () => queryClient.invalidateQueries({ queryKey: clientsKey }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [queryClient],
    );

    const report = (action: string) => (err: unknown) => {
      toast.error(`${action} failed`, {
        description: errorMessage(err, "Unknown error."),
      });
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
      async (clientId: string, newStatus: string) => {
        const client = clients.find((c) => c.id === clientId);
        if (!client || client.status === newStatus) return;
        try {
          const updated = await backend.updateStatus(clientId, newStatus);
          patchClient(updated);
          /* Fired after the write is durable, never before — a signal that
             says the status changed must not go out if it did not. */
          notifyStatusChange({
            clientId,
            clientName: client.name,
            partnerName: clientGroupLabel(client),
            previousStatus: client.status,
            newStatus,
          });
        } catch (err) {
          report("Status update")(err);
          throw err;
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [clients, patchClient],
    );

    const canAssign = Boolean(backend.updateAssignee);

    const updateAssignee = useCallback(
      async (clientId: string, newAssignee: string) => {
        if (!backend.updateAssignee) return;
        try {
          patchClient(await backend.updateAssignee(clientId, newAssignee));
        } catch (err) {
          report("Assignment update")(err);
          throw err;
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [patchClient],
    );

    const updateContact = useCallback(
      async (clientId: string, field: "email" | "phone", value: string) => {
        try {
          patchClient(await backend.updateContact(clientId, field, value));
        } catch (err) {
          report("Contact update")(err);
          throw err;
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [patchClient],
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
      async (
        entry: Omit<OpsActivityEntry, "id" | "timestamp"> & { body?: unknown },
      ) => {
        const client = clients.find((c) => c.id === entry.clientId);
        if (!agencyId || !userId) {
          // Default deny, and say so. Silently returning let the composer
          // clear itself as though the note had been saved.
          const err = new Error(
            "No authenticated agency context — cannot post this note.",
          );
          report("Posting note")(err);
          throw err;
        }
        try {
          const created = await postNote({
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
            body: entry.body,
          });
          /* Place the PERSISTED row — the one the database returned, with its
             real id, created_at and visibility — at the head of the timeline
             cache. `fetchTimeline` orders newest first, so the head is where
             it belongs.

             This replaces two wrongs. The write was fire-and-forget and the
             timeline was then invalidated separately by the caller, so the
             refetch raced the insert and usually won: the note was missing
             until the query went stale seconds later. And the write
             invalidated the CLIENT LIST, which the note does not change. */
          queryClient.setQueryData<TimelineEntry[]>(
            timelineKey(config.activityEntityType, entry.clientId),
            (prev) => (prev ? [created, ...prev] : [created]),
          );
          return created.id;
        } catch (err) {
          report("Posting note")(err);
          // Rethrown so the composer keeps the text and can offer a retry.
          throw err;
        }
      },
      [agencyId, userId, clients, queryClient],
    );

    const logProduction = useCallback(
      async (input: ProductionLogInput) => {
        if (!agencyId || !userId) {
          const err = new Error(
            "No authenticated agency context — cannot record this work.",
          );
          report("Logging production")(err);
          throw err;
        }
        try {
          /* `employeeId` comes from the resolved session. It used to be read
             back from GoTrue inside the insert — a 299ms network call in front
             of every write, for an id already in hand. RLS still enforces
             `employee_id = auth.uid()`, so the guarantee is unchanged. */
          await backend.logProduction(input, agencyId, userId);
          notifyStatusChange({
            clientId: input.clientId,
            clientName: input.clientName,
            partnerName: input.partnerName,
            previousStatus: "—",
            newStatus: `Work completed (${input.department})`,
          });
          /* Production is its own table; no client row changed, so nothing in
             the client list needs refetching. The open-items count comes from
             `fulfillment_clients` and is not touched by a production insert. */
        } catch (err) {
          report("Logging production")(err);
          throw err;
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [agencyId, userId],
    );

    const noop = () => {};
    const value = useMemo<OpsClientStoreValue<T, D>>(
      () => ({
        clients,
        activity,
        getActivity: () => [],
        getDepartmentStatuses,
        /* `handled` keeps the rejection reachable for callers that await it
           while ensuring callers that do not never produce an unhandled
           rejection — the toast is their error surface. */
        updateStatus: handled(updateStatus),
        updateAssignee: handled(updateAssignee),
        canAssign,
        updateContact: handled(updateContact),
        checkAddConflict,
        addClient,
        addActivity: handled(postLiveNote),
        togglePin: noop,
        setMark: noop,
        logProduction: handled(logProduction),
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
    /* Outside a provider there is no tenant, so every write refuses rather
       than resolving as though it had succeeded (rule 1: default deny). */
    const denied = () =>
      Promise.reject(new Error("No operations context — write refused."));
    return {
      clients: [],
      activity: [],
      getActivity: () => [],
      getDepartmentStatuses: () => [],
      updateStatus: denied,
      updateAssignee: denied,
      canAssign: false,
      updateContact: denied,
      checkAddConflict: () => ({ crossScopeMatches: [] }),
      addClient: () => ({ id: "", blocked: true, crossScopeMatches: [] }),
      addActivity: denied,
      togglePin: noop,
      setMark: noop,
      logProduction: denied,
    };
  }

  return { Provider, useStore, setStatusChangeHandler };
}
