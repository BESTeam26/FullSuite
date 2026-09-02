import { createContext, useContext, useState, type ReactNode } from "react";

export type MonitoringStatus =
  "connected" | "monitoring-issue" | "needs-review";

export interface ClientMonitoringState {
  status: MonitoringStatus;
  /** Lifetime count of failed/blocked import attempts — kept for the audit record. */
  attempts: number;
  lastAttemptAt: string | null;
  lastReason: string | null;
  /** True when a human has corrected the auto-set status. */
  manuallySet: boolean;
  history: { at: string; event: string }[];
}

const DEFAULT_STATE: ClientMonitoringState = {
  status: "connected",
  attempts: 0,
  lastAttemptAt: null,
  lastReason: null,
  manuallySet: false,
  history: [],
};

interface MonitoringContextValue {
  getState: (clientId: string) => ClientMonitoringState;
  recordFailedAttempt: (clientId: string, reason: string) => void;
  recordSuccess: (clientId: string) => void;
  setManualStatus: (
    clientId: string,
    status: MonitoringStatus,
    note?: string,
  ) => void;
}

const MonitoringContext = createContext<MonitoringContextValue>({
  getState: () => DEFAULT_STATE,
  recordFailedAttempt: () => {},
  recordSuccess: () => {},
  setManualStatus: () => {},
});

function timestamp() {
  return new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export const MonitoringStatusProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [states, setStates] = useState<Record<string, ClientMonitoringState>>(
    {},
  );

  const getState = (clientId: string) => states[clientId] ?? DEFAULT_STATE;

  const recordFailedAttempt = (clientId: string, reason: string) => {
    setStates((prev) => {
      const current = prev[clientId] ?? DEFAULT_STATE;
      const attempts = current.attempts + 1;
      return {
        ...prev,
        [clientId]: {
          status: "monitoring-issue",
          attempts,
          lastAttemptAt: timestamp(),
          lastReason: reason,
          manuallySet: false,
          history: [
            {
              at: timestamp(),
              event: `Attempt #${attempts} blocked — ${reason}. Status auto-set to "Monitoring Issue".`,
            },
            ...current.history,
          ],
        },
      };
    });
  };

  const recordSuccess = (clientId: string) => {
    setStates((prev) => {
      const current = prev[clientId] ?? DEFAULT_STATE;
      return {
        ...prev,
        [clientId]: {
          ...current,
          status: "connected",
          lastAttemptAt: timestamp(),
          lastReason: null,
          manuallySet: false,
          history: [
            {
              at: timestamp(),
              event: `Report imported successfully. Status auto-cleared to "Connected" (${current.attempts} historical failed attempt${current.attempts === 1 ? "" : "s"} on record).`,
            },
            ...current.history,
          ],
        },
      };
    });
  };

  const setManualStatus = (
    clientId: string,
    status: MonitoringStatus,
    note?: string,
  ) => {
    setStates((prev) => {
      const current = prev[clientId] ?? DEFAULT_STATE;
      return {
        ...prev,
        [clientId]: {
          ...current,
          status,
          manuallySet: true,
          history: [
            {
              at: timestamp(),
              event:
                note ??
                `Status manually corrected to "${statusLabel(status)}" by user.`,
            },
            ...current.history,
          ],
        },
      };
    });
  };

  return (
    <MonitoringContext.Provider
      value={{ getState, recordFailedAttempt, recordSuccess, setManualStatus }}
    >
      {children}
    </MonitoringContext.Provider>
  );
};

export function statusLabel(status: MonitoringStatus) {
  switch (status) {
    case "connected":
      return "Connected";
    case "monitoring-issue":
      return "Monitoring Issue";
    case "needs-review":
      return "Needs Review";
  }
}

export const useMonitoringStatus = () => useContext(MonitoringContext);
