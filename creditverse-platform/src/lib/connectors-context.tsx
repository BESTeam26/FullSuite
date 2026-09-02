import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface ProviderConnection {
  providerId: string;
  providerName: string;
  status: "connected" | "disconnected" | "error" | "pending";
  authMethod: "client-key" | "client-token" | "partner-api" | "";
  credentialLabel: string;
  connectedAt: string;
  lastSync: string;
  reportsPulled: number;
}

const PROVIDER_DEFS = [
  {
    id: "smartcredit",
    name: "SmartCredit",
    authMethod: "client-key" as const,
    authLabel: "Client Key + Client Secret",
    note: "Obtain via ConsumerDirect Partner Hub / SupportLink. Passwordless CRM integration.",
  },
  {
    id: "idiq",
    name: "IdentityIQ / MyScoreIQ (IDIQ)",
    authMethod: "partner-api" as const,
    authLabel: "Partner API Credentials",
    note: "IDIQ Credit Education CRM integration. Covers both IdentityIQ and MyScoreIQ.",
  },
  {
    id: "myfreescorenow",
    name: "MyFreeScoreNow",
    authMethod: "client-token" as const,
    authLabel: "Client Token (per consumer)",
    note: "Generate token from MFSN affiliate portal. Do NOT use password scraping.",
  },
];

const DEFAULT_CONNECTIONS: ProviderConnection[] = [
  {
    providerId: "smartcredit",
    providerName: "SmartCredit",
    status: "connected",
    authMethod: "client-key",
    credentialLabel: "SC-KEY-••••8421",
    connectedAt: "Aug 15, 2026",
    lastSync: "Aug 29, 2026 9:14 AM",
    reportsPulled: 1284,
  },
  {
    providerId: "idiq",
    providerName: "IdentityIQ / MyScoreIQ (IDIQ)",
    status: "pending",
    authMethod: "partner-api",
    credentialLabel: "Not yet entered",
    connectedAt: "—",
    lastSync: "—",
    reportsPulled: 0,
  },
  {
    providerId: "myfreescorenow",
    providerName: "MyFreeScoreNow",
    status: "disconnected",
    authMethod: "",
    credentialLabel: "—",
    connectedAt: "—",
    lastSync: "—",
    reportsPulled: 0,
  },
];

interface ConnectorsValue {
  providers: typeof PROVIDER_DEFS;
  connections: ProviderConnection[];
  connect: (providerId: string, credentialLabel: string) => void;
  disconnect: (providerId: string) => void;
}

const ConnectorsContext = createContext<ConnectorsValue>({
  providers: PROVIDER_DEFS,
  connections: DEFAULT_CONNECTIONS,
  connect: () => {},
  disconnect: () => {},
});

export const ConnectorsProvider = ({ children }: { children: ReactNode }) => {
  const [connections, setConnections] =
    useState<ProviderConnection[]>(DEFAULT_CONNECTIONS);

  const value = useMemo<ConnectorsValue>(
    () => ({
      providers: PROVIDER_DEFS,
      connections,
      connect: (providerId, credentialLabel) =>
        setConnections((prev) =>
          prev.map((c) =>
            c.providerId === providerId
              ? {
                  ...c,
                  status: "connected",
                  credentialLabel,
                  connectedAt: new Date().toLocaleDateString(),
                  lastSync: new Date().toLocaleString(),
                }
              : c,
          ),
        ),
      disconnect: (providerId) =>
        setConnections((prev) =>
          prev.map((c) =>
            c.providerId === providerId
              ? {
                  ...c,
                  status: "disconnected",
                  authMethod: "",
                  credentialLabel: "—",
                  connectedAt: "—",
                  lastSync: "—",
                }
              : c,
          ),
        ),
    }),
    [connections],
  );

  return (
    <ConnectorsContext.Provider value={value}>
      {children}
    </ConnectorsContext.Provider>
  );
};

export const useConnectors = () => useContext(ConnectorsContext);
