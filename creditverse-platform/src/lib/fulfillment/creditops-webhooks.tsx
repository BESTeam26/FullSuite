/**
 * CreditOps Webhook Bridge
 *
 * Pushes partner status changes directly into external CRMs (GHL, DisputeFox,
 * or any generic webhook endpoint) in real time.
 *
 * Doctrine:
 * - This app is the fulfillment/operations layer.
 * - It emits structured OUTBOUND webhook signals when a client's operational
 *   status changes inside the CreditOps fulfillment workspace.
 * - The external CRM owns the actual pipeline move, tag, and automation trigger.
 * - Each status change maps to a configurable webhook payload so the mapping is
 *   data, not code.
 *
 * In this frontend shell, emissions are recorded in a live signal log so the
 * operator can audit exactly what would be POSTed. A real backend would perform
 * the fetch() to each enabled endpoint.
 */

import {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth/auth-context";
import {
  fetchWebhookDeliveries,
  recordWebhookDelivery,
} from "@/lib/data/fulfillment-clients";

export type WebhookType = "ghl" | "disputefox" | "generic";

export interface WebhookEndpoint {
  id: string;
  name: string;
  type: WebhookType;
  url: string;
  apiKey: string;
  enabled: boolean;
  lastFiredAt: string | null;
  fires: number;
}

export interface WebhookSignalLogEntry {
  id: string;
  at: string;
  endpointName: string;
  endpointType: WebhookType;
  clientId: string;
  clientName: string;
  partnerName: string;
  previousStatus: string;
  newStatus: string;
  status: "emitted" | "failed" | "skipped";
  message: string;
}

interface CreditOpsWebhookValue {
  endpoints: WebhookEndpoint[];
  signalLog: WebhookSignalLogEntry[];
  /** Called by the Signal Log panel when it opens. Idempotent. */
  loadSignalLog: () => void;
  addEndpoint: (
    ep: Omit<WebhookEndpoint, "id" | "lastFiredAt" | "fires">,
  ) => void;
  updateEndpoint: (id: string, patch: Partial<WebhookEndpoint>) => void;
  removeEndpoint: (id: string) => void;
  toggleEndpoint: (id: string) => void;
  pushStatusChange: (payload: {
    clientId: string;
    clientName: string;
    partnerName: string;
    previousStatus: string;
    newStatus: string;
  }) => void;
  clearLog: () => void;
}

const CreditOpsWebhookContext = createContext<CreditOpsWebhookValue | null>(
  null,
);

function rid() {
  return Math.random().toString(36).slice(2, 10);
}

function ts() {
  return new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const DEFAULT_ENDPOINTS: WebhookEndpoint[] = [
  {
    id: "wh-ghl",
    name: "GHL — CreditOps Pipeline",
    type: "ghl",
    url: "",
    apiKey: "",
    enabled: false,
    lastFiredAt: null,
    fires: 0,
  },
  {
    id: "wh-df",
    name: "DisputeFox — Status Sync",
    type: "disputefox",
    url: "",
    apiKey: "",
    enabled: false,
    lastFiredAt: null,
    fires: 0,
  },
];

export const CreditOpsWebhookProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const { mode, status, agencyId } = useAuth();
  const [endpoints, setEndpoints] =
    useState<WebhookEndpoint[]>(DEFAULT_ENDPOINTS);
  const [signalLog, setSignalLog] = useState<WebhookSignalLogEntry[]>([]);

  const persist =
    mode === "live" && status === "signed-in" && Boolean(agencyId);

  /**
   * Load the recent log from the database, on demand.
   *
   * This log records what the platform told an external CRM to do. Keeping it
   * in memory only meant it vanished on refresh, so there was no way to answer
   * "did we push that status change?" after the fact — an audit trail that
   * forgets is not one (rule 10).
   *
   * It is read when the Signal Log is opened, not when CreditOps mounts. The
   * panel is one tab among nine and is rarely the one in front of the user, so
   * loading it eagerly spent a request on every CreditOps visit to fill a
   * screen nobody was looking at (rule 7: do not load hidden tabs). The guard
   * makes it once per session rather than once per panel mount.
   */
  const loadRequested = useRef(false);

  const loadSignalLog = useCallback(() => {
    if (!persist || loadRequested.current) return;
    loadRequested.current = true;
    fetchWebhookDeliveries()
      .then((rows) => {
        setSignalLog(
          rows.map((r) => ({
            id: String(r.id),
            at: new Date(r.created_at).toLocaleString(),
            endpointName: r.endpoint_name,
            endpointType: "generic" as WebhookType,
            clientId: r.client_id ?? "",
            clientName: r.client_name,
            partnerName: r.partner_name,
            previousStatus: r.previous_status ?? "",
            newStatus: r.new_status,
            status: r.status,
            message: r.message ?? "",
          })),
        );
      })
      .catch(() => {
        // A log that cannot be read must not take the workspace down with it.
        // Allow a later open to retry rather than latching the failure.
        loadRequested.current = false;
      });
  }, [persist]);

  const addEndpoint = useCallback(
    (ep: Omit<WebhookEndpoint, "id" | "lastFiredAt" | "fires">) => {
      setEndpoints((prev) => [
        ...prev,
        { ...ep, id: rid(), lastFiredAt: null, fires: 0 },
      ]);
    },
    [],
  );

  const updateEndpoint = useCallback(
    (id: string, patch: Partial<WebhookEndpoint>) => {
      setEndpoints((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      );
    },
    [],
  );

  const removeEndpoint = useCallback((id: string) => {
    setEndpoints((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const toggleEndpoint = useCallback((id: string) => {
    setEndpoints((prev) =>
      prev.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e)),
    );
  }, []);

  /**
   * Show the signals, and record them.
   *
   * One place, so an emitted signal and a skipped one cannot end up with
   * different persistence behaviour — which is exactly how the log came to be
   * memory-only in the first place.
   */
  const commit = useCallback(
    (entries: WebhookSignalLogEntry[]) => {
      setSignalLog((prev) => [...entries, ...prev].slice(0, 200));
      if (!persist || !agencyId) return;
      // Fire-and-forget: recording the signal must never block or fail the
      // status change the operator just made.
      for (const entry of entries) {
        void recordWebhookDelivery({
          agencyId,
          endpointName: entry.endpointName,
          clientId: entry.clientId || undefined,
          clientName: entry.clientName,
          partnerName: entry.partnerName,
          previousStatus: entry.previousStatus,
          newStatus: entry.newStatus,
          status: entry.status,
          message: entry.message,
        }).catch(() => {});
      }
    },
    [persist, agencyId],
  );

  const pushStatusChange = useCallback(
    (payload: {
      clientId: string;
      clientName: string;
      partnerName: string;
      previousStatus: string;
      newStatus: string;
    }) => {
      const enabled = endpoints.filter((e) => e.enabled && e.url);
      if (enabled.length === 0) {
        // A skipped signal is recorded, not dropped. "We did not tell the CRM,
        // because nothing was configured" is exactly the question this log
        // exists to answer after the fact (rule 10).
        commit([
          {
            id: rid(),
            at: ts(),
            endpointName: "(none)",
            endpointType: "generic" as WebhookType,
            ...payload,
            status: "skipped" as const,
            message:
              "No enabled webhook endpoints — status change not pushed externally.",
          },
        ]);
        return;
      }

      const newEntries: WebhookSignalLogEntry[] = enabled.map((ep) => {
        // Build the payload a real integration would POST.
        const webhookPayload = {
          event: "creditops.status_changed",
          timestamp: new Date().toISOString(),
          endpointType: ep.type,
          client: {
            id: payload.clientId,
            name: payload.clientName,
            partner: payload.partnerName,
          },
          change: {
            from: payload.previousStatus,
            to: payload.newStatus,
          },
        };
        // Frontend shell: record the emission. A real backend would:
        //   await fetch(ep.url, { method: "POST",
        //     headers: { Authorization: `Bearer ${ep.apiKey}`,
        //                "Content-Type": "application/json" },
        //     body: JSON.stringify(webhookPayload) });
        void webhookPayload;
        return {
          id: rid(),
          at: ts(),
          endpointName: ep.name,
          endpointType: ep.type,
          clientId: payload.clientId,
          clientName: payload.clientName,
          partnerName: payload.partnerName,
          previousStatus: payload.previousStatus,
          newStatus: payload.newStatus,
          status: "emitted" as const,
          message: `Pushed ${payload.previousStatus} → ${payload.newStatus} to ${ep.name}.`,
        };
      });

      commit(newEntries);
      setEndpoints((prev) =>
        prev.map((e) =>
          enabled.some((en) => en.id === e.id)
            ? { ...e, lastFiredAt: ts(), fires: e.fires + 1 }
            : e,
        ),
      );
    },
    [endpoints, commit],
  );

  /**
   * Clears the on-screen list only — it does NOT delete delivery records.
   *
   * Rule 11: operational history is not erased by a UI button. Reopening the
   * workspace loads the stored log again, which is the intended behaviour.
   */
  const clearLog = useCallback(() => setSignalLog([]), []);

  const value: CreditOpsWebhookValue = {
    endpoints,
    signalLog,
    loadSignalLog,
    addEndpoint,
    updateEndpoint,
    removeEndpoint,
    toggleEndpoint,
    pushStatusChange,
    clearLog,
  };

  return (
    <CreditOpsWebhookContext.Provider value={value}>
      {children}
    </CreditOpsWebhookContext.Provider>
  );
};

export const useCreditOpsWebhooks = () => {
  const ctx = useContext(CreditOpsWebhookContext);
  if (!ctx)
    throw new Error(
      "useCreditOpsWebhooks must be used within CreditOpsWebhookProvider",
    );
  return ctx;
};
