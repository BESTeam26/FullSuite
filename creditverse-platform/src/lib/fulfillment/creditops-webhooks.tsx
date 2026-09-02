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
  useState,
  useCallback,
  type ReactNode,
} from "react";

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
  const [endpoints, setEndpoints] =
    useState<WebhookEndpoint[]>(DEFAULT_ENDPOINTS);
  const [signalLog, setSignalLog] = useState<WebhookSignalLogEntry[]>([]);

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
        setSignalLog((prev) =>
          [
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
            ...prev,
          ].slice(0, 200),
        );
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

      setSignalLog((prev) => [...newEntries, ...prev].slice(0, 200));
      setEndpoints((prev) =>
        prev.map((e) =>
          enabled.some((en) => en.id === e.id)
            ? { ...e, lastFiredAt: ts(), fires: e.fires + 1 }
            : e,
        ),
      );
    },
    [endpoints],
  );

  const clearLog = useCallback(() => setSignalLog([]), []);

  const value: CreditOpsWebhookValue = {
    endpoints,
    signalLog,
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
