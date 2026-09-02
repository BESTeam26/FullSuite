import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

/**
 * CRM Automation Bridge
 *
 * Design doctrine:
 * - This app is the FULFILLMENT / OPERATIONS layer.
 * - It NEVER sends SMS, email, or marketing messages itself.
 * - It only emits structured OUTBOUND signals (webhooks) to the connected
 *   front-office CRM, which owns pipeline stage moves, tag application,
 *   workflow/SMS/email triggers, and lead/contact sync.
 * - Each internal status event maps to a configurable CRM action
 *   (pipeline stage + tag + workflow trigger) so the mapping is data, not code.
 */

export type CrmConnectionStatus = "connected" | "disconnected" | "error";

export interface CrmConnection {
  status: CrmConnectionStatus;
  webhookUrl: string;
  apiKey: string;
  locationId: string;
  pipelineId: string;
  lastSignalAt: string | null;
  signalsEmitted: number;
}

/**
 * Canonical internal events that this fulfillment platform emits.
 * These are the only events that should ever fire a CRM signal.
 * Keep this list small and operationally meaningful — not every UI click.
 */
export type InternalEventKey =
  | "client.onboarded"
  | "client.monitoring_issue"
  | "client.bill_past_due"
  | "client.needs_action"
  | "dispute.round_started"
  | "dispute.round_mailed"
  | "dispute.response_received"
  | "dispute.needs_review"
  | "compliance.hold"
  | "compliance.release"
  | "funding.readiness_blocker"
  | "funding.submitted"
  | "diy.requested_professional_help"
  | "diy.requested_funding_review";

export interface CrmMapping {
  event: InternalEventKey;
  enabled: boolean;
  pipelineStage: string;
  tag: string;
  workflowTrigger: string;
  notes: string;
}

export interface CrmSignalLogEntry {
  id: string;
  at: string;
  event: InternalEventKey;
  clientId: string;
  clientName: string;
  subAccountId: string;
  crmStage: string;
  crmTag: string;
  crmWorkflow: string;
  status: "emitted" | "failed" | "skipped";
  message: string;
}

export interface EventMeta {
  clientId?: string;
  clientName?: string;
  subAccountId?: string;
  [k: string]: unknown;
}

export const EVENT_LABELS: Record<
  InternalEventKey,
  { label: string; group: string; description: string }
> = {
  "client.onboarded": {
    label: "Client onboarded",
    group: "Client",
    description:
      "Fires when a new client completes onboarding and is cleared for processing.",
  },
  "client.monitoring_issue": {
    label: "Monitoring issue",
    group: "Client",
    description:
      "Fires when a credit-monitoring import fails and the client is auto-set to Monitoring Issue.",
  },
  "client.bill_past_due": {
    label: "Bill past due",
    group: "Client",
    description:
      "Fires when a client's billing eligibility engine blocks a charge.",
  },
  "client.needs_action": {
    label: "Needs client action",
    group: "Client",
    description:
      "Fires when a step requires the client to respond (ID upload, evidence, approval).",
  },
  "dispute.round_started": {
    label: "Dispute round started",
    group: "Dispute",
    description: "Fires when a new dispute round is opened on a client file.",
  },
  "dispute.round_mailed": {
    label: "Dispute round mailed",
    group: "Dispute",
    description: "Fires when round letters are printed/mailed or uploaded.",
  },
  "dispute.response_received": {
    label: "Bureau response received",
    group: "Dispute",
    description:
      "Fires when a CRA/furnisher response is logged on a client file.",
  },
  "dispute.needs_review": {
    label: "Dispute needs review",
    group: "Dispute",
    description:
      "Fires when a re-import surfaces items that need human or consumer review.",
  },
  "compliance.hold": {
    label: "Compliance hold",
    group: "Compliance",
    description: "Fires when a billing/legal compliance gate blocks a send.",
  },
  "compliance.release": {
    label: "Compliance released",
    group: "Compliance",
    description: "Fires when a previously held file is cleared for processing.",
  },
  "funding.readiness_blocker": {
    label: "Funding readiness blocker",
    group: "Funding",
    description:
      "Fires when a funding-readiness review identifies a credit or other blocker.",
  },
  "funding.submitted": {
    label: "Funding submitted",
    group: "Funding",
    description:
      "Fires when a funding application is submitted to a lender program.",
  },
  "diy.requested_professional_help": {
    label: "DIY → Professional help",
    group: "DIY",
    description:
      "Fires when a DIY consumer requests done-for-you professional credit help.",
  },
  "diy.requested_funding_review": {
    label: "DIY → Funding review",
    group: "DIY",
    description:
      "Fires when a DIY consumer requests a business funding readiness review.",
  },
};

export const EVENT_GROUPS = [
  "Client",
  "Dispute",
  "Compliance",
  "Funding",
  "DIY",
] as const;

const DEFAULT_CONNECTION: CrmConnection = {
  status: "disconnected",
  webhookUrl: "",
  apiKey: "",
  locationId: "",
  pipelineId: "",
  lastSignalAt: null,
  signalsEmitted: 0,
};

const DEFAULT_MAPPINGS: CrmMapping[] = (
  Object.keys(EVENT_LABELS) as InternalEventKey[]
).map((event, i) => ({
  event,
  enabled: i < 6, // enable the first few by default
  pipelineStage: "",
  tag: EVENT_LABELS[event].label.replace(/\s+/g, "-").toLowerCase(),
  workflowTrigger: "",
  notes: "",
}));

interface CrmAutomationValue {
  connection: CrmConnection;
  mappings: CrmMapping[];
  log: CrmSignalLogEntry[];
  setConnection: (patch: Partial<CrmConnection>) => void;
  connect: (patch: Partial<CrmConnection>) => void;
  disconnect: () => void;
  updateMapping: (event: InternalEventKey, patch: Partial<CrmMapping>) => void;
  toggleMapping: (event: InternalEventKey) => void;
  emit: (event: InternalEventKey, meta?: EventMeta) => CrmSignalLogEntry;
  clearLog: () => void;
}

const CrmAutomationContext = createContext<CrmAutomationValue | null>(null);

function ts() {
  return new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function rid() {
  return Math.random().toString(36).slice(2, 10);
}

export const CrmAutomationProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [connection, setConnection] =
    useState<CrmConnection>(DEFAULT_CONNECTION);
  const [mappings, setMappings] = useState<CrmMapping[]>(DEFAULT_MAPPINGS);
  const [log, setLog] = useState<CrmSignalLogEntry[]>([]);

  const setConnectionPatch = (patch: Partial<CrmConnection>) =>
    setConnection((prev) => ({ ...prev, ...patch }));

  const connect = (patch: Partial<CrmConnection>) =>
    setConnection((prev) => ({
      ...prev,
      ...patch,
      status: "connected",
      lastSignalAt: null,
    }));

  const disconnect = () =>
    setConnection((prev) => ({
      ...DEFAULT_CONNECTION,
      status: "disconnected",
    }));

  const updateMapping = (event: InternalEventKey, patch: Partial<CrmMapping>) =>
    setMappings((prev) =>
      prev.map((m) => (m.event === event ? { ...m, ...patch } : m)),
    );

  const toggleMapping = (event: InternalEventKey) =>
    setMappings((prev) =>
      prev.map((m) => (m.event === event ? { ...m, enabled: !m.enabled } : m)),
    );

  /**
   * Emit a structured signal to the connected CRM.
   *
   * In production this performs a real fetch() POST to `connection.webhookUrl`
   * with the payload below. In this frontend shell it records the event log
   * so the operator can audit exactly what would be sent.
   *
   * The payload schema is intentionally compatible with a generic CRM
   * inbound webhook (locationId + contact + pipelineStage + tag + workflow).
   */
  const emit = useCallback(
    (event: InternalEventKey, meta?: EventMeta): CrmSignalLogEntry => {
      const mapping = mappings.find((m) => m.event === event);
      const base: CrmSignalLogEntry = {
        id: rid(),
        at: ts(),
        event,
        clientId: meta?.clientId ?? "—",
        clientName: meta?.clientName ?? "—",
        subAccountId: meta?.subAccountId ?? "HQ",
        crmStage: mapping?.pipelineStage ?? "(unmapped)",
        crmTag: mapping?.tag ?? EVENT_LABELS[event].label,
        crmWorkflow: mapping?.workflowTrigger ?? "(none)",
        status: "skipped",
        message: "",
      };

      // Do nothing if the bridge is disconnected.
      if (connection.status !== "connected") {
        const entry: CrmSignalLogEntry = {
          ...base,
          status: "skipped",
          message: "CRM bridge disconnected — signal not emitted.",
        };
        setLog((prev) => [entry, ...prev].slice(0, 200));
        return entry;
      }

      // Do nothing if the mapping is disabled.
      if (mapping && !mapping.enabled) {
        const entry: CrmSignalLogEntry = {
          ...base,
          status: "skipped",
          message: "Mapping disabled — signal not emitted.",
        };
        setLog((prev) => [entry, ...prev].slice(0, 200));
        return entry;
      }

      // Build the payload a real integration would POST.
      const payload = {
        event,
        label: EVENT_LABELS[event].label,
        timestamp: new Date().toISOString(),
        locationId: connection.locationId,
        pipelineId: connection.pipelineId,
        pipelineStage: mapping?.pipelineStage ?? null,
        tag: mapping?.tag ?? null,
        workflowTrigger: mapping?.workflowTrigger ?? null,
        contact: {
          clientId: meta?.clientId ?? null,
          clientName: meta?.clientName ?? null,
        },
        subAccountId: meta?.subAccountId ?? "HQ",
        meta: meta ?? {},
      };

      // Frontend shell: record the emission. A real backend would:
      //   await fetch(connection.webhookUrl, { method: "POST",
      //     headers: { Authorization: `Bearer ${connection.apiKey}`,
      //                "Content-Type": "application/json" },
      //     body: JSON.stringify(payload) });
      void payload; // placeholder for the production fetch path
      const entry: CrmSignalLogEntry = {
        ...base,
        status: "emitted",
        message: `Signal emitted → stage "${
          mapping?.pipelineStage ?? "(unmapped)"
        }", tag "${mapping?.tag ?? EVENT_LABELS[event].label}".`,
      };
      setLog((prev) => [entry, ...prev].slice(0, 200));
      setConnection((prev) => ({
        ...prev,
        lastSignalAt: ts(),
        signalsEmitted: prev.signalsEmitted + 1,
      }));
      return entry;
    },
    [connection, mappings],
  );

  const clearLog = () => setLog([]);

  const value: CrmAutomationValue = {
    connection,
    mappings,
    log,
    setConnection: setConnectionPatch,
    connect,
    disconnect,
    updateMapping,
    toggleMapping,
    emit,
    clearLog,
  };

  return (
    <CrmAutomationContext.Provider value={value}>
      {children}
    </CrmAutomationContext.Provider>
  );
};

export const useCrmAutomation = () => {
  const ctx = useContext(CrmAutomationContext);
  if (!ctx)
    throw new Error(
      "useCrmAutomation must be used within CrmAutomationProvider",
    );
  return ctx;
};
