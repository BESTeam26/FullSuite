import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchAgencyBrand, saveAgencyBrand } from "@/lib/data/agencies";

/**
 * BES Agency Settings — platform control plane state.
 * Manages the entire SaaS, not an individual Sub-Account.
 */

export type EntitlementState = "Active" | "Trial" | "Suspended" | "Cancelled";

export interface ProductConfig {
  key: string;
  label: string;
  state: EntitlementState;
  plan: string;
  limit: string;
  addons: string[];
}

export interface AgencyUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  scope: string;
  assignment: string;
  active: boolean;
  assignedOnly: boolean;
}

export interface PermissionRow {
  role: string;
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  assign: boolean;
  approve: boolean;
  export: boolean;
  manageSettings: boolean;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  severity: "info" | "warning" | "critical";
}

export interface IntegrationRow {
  id: string;
  name: string;
  category: string;
  status: "Connected" | "Needs Attention" | "Disconnected";
  lastSync: string;
}

interface AgencySettingsContextType {
  agency: {
    name: string;
    logoUrl: string;
    supportEmail: string;
    supportPhone: string;
    timezone: string;
    currency: string;
    platformUrl: string;
    legalUrl: string;
  };
  setAgency: (patch: Partial<AgencySettingsContextType["agency"]>) => void;
  /** Persist the brand form to the agency row. Rejects for non-admins. */
  saveBrand: () => Promise<void>;
  brandSaveError: string | null;
  canSaveBrand: boolean;

  products: ProductConfig[];
  setProductState: (key: string, state: EntitlementState) => void;

  users: AgencyUserRow[];
  toggleUserActive: (id: string) => void;
  toggleUserAssignedOnly: (id: string) => void;

  permissions: PermissionRow[];

  audit: AuditEntry[];

  integrations: IntegrationRow[];

  featureFlags: Record<string, boolean>;
  toggleFlag: (key: string) => void;

  saved: boolean;
  markSaved: () => void;
}

const AgencySettingsContext = createContext<
  AgencySettingsContextType | undefined
>(undefined);

const seedUsers: AgencyUserRow[] = [
  {
    id: "ag-1",
    name: "Platform Admin",
    email: "admin@bes.io",
    role: "Agency Owner",
    scope: "Global",
    assignment: "All",
    active: true,
    assignedOnly: false,
  },
  {
    id: "ag-2",
    name: "Carlos Mendoza",
    email: "carlos@bes.io",
    role: "Team Lead",
    scope: "CreditOps Division",
    assignment: "Division",
    active: true,
    assignedOnly: false,
  },
  {
    id: "ag-3",
    name: "Keila Betancourt",
    email: "keila@bes.io",
    role: "Agent",
    scope: "CreditOps Division",
    assignment: "Assigned Only",
    active: true,
    assignedOnly: true,
  },
  {
    id: "ag-4",
    name: "Daniel Reyes",
    email: "daniel@bes.io",
    role: "Agent",
    scope: "Fulfillment",
    assignment: "Assigned Only",
    active: false,
    assignedOnly: true,
  },
];

const seedPermissions: PermissionRow[] = [
  {
    role: "Agency Owner",
    view: true,
    create: true,
    edit: true,
    delete: true,
    assign: true,
    approve: true,
    export: true,
    manageSettings: true,
  },
  {
    role: "Admin",
    view: true,
    create: true,
    edit: true,
    delete: false,
    assign: true,
    approve: true,
    export: true,
    manageSettings: true,
  },
  {
    role: "Manager",
    view: true,
    create: true,
    edit: true,
    delete: false,
    assign: true,
    approve: true,
    export: true,
    manageSettings: false,
  },
  {
    role: "Team Lead",
    view: true,
    create: true,
    edit: true,
    delete: false,
    assign: true,
    approve: true,
    export: false,
    manageSettings: false,
  },
  {
    role: "Agent",
    view: true,
    create: true,
    edit: true,
    delete: false,
    assign: false,
    approve: false,
    export: false,
    manageSettings: false,
  },
];

const seedAudit: AuditEntry[] = [
  {
    id: "a1",
    at: "Aug 31, 09:42 AM",
    actor: "Platform Admin",
    action: "User invited",
    target: "daniel@bes.io → Agent",
    severity: "info",
  },
  {
    id: "a2",
    at: "Aug 30, 04:15 PM",
    actor: "Platform Admin",
    action: "Entitlement changed",
    target: "Apex Credit Co. → FundingOps Trial",
    severity: "info",
  },
  {
    id: "a3",
    at: "Aug 29, 11:08 AM",
    actor: "Platform Admin",
    action: "User disabled",
    target: "Daniel Reyes",
    severity: "warning",
  },
  {
    id: "a4",
    at: "Aug 28, 02:30 PM",
    actor: "Platform Admin",
    action: "Permission override",
    target: "Manager → export enabled",
    severity: "warning",
  },
  {
    id: "a5",
    at: "Aug 27, 08:00 AM",
    actor: "System",
    action: "Sub-Account archived",
    target: "Test Org #2",
    severity: "critical",
  },
];

const seedIntegrations: IntegrationRow[] = [
  {
    id: "i1",
    name: "Front-Office CRM",
    category: "CRM / Automation",
    status: "Connected",
    lastSync: "2 min ago",
  },
  {
    id: "i2",
    name: "Stripe",
    category: "Payments",
    status: "Connected",
    lastSync: "5 min ago",
  },
  {
    id: "i3",
    name: "SmartCredit",
    category: "Credit Data",
    status: "Needs Attention",
    lastSync: "3 days ago",
  },
  {
    id: "i4",
    name: "IdentityIQ / IDIQ",
    category: "Credit Data",
    status: "Disconnected",
    lastSync: "Never",
  },
  {
    id: "i5",
    name: "LetterStream",
    category: "Print & Mail",
    status: "Connected",
    lastSync: "1 hr ago",
  },
  {
    id: "i6",
    name: "Twilio",
    category: "SMS",
    status: "Connected",
    lastSync: "12 min ago",
  },
];

export const AgencySettingsProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in" && !!auth.agencyId;
  const [agency, setAgencyState] = useState({
    name: "Blessed Empire Services",
    logoUrl: "",
    supportEmail: "support@bes.io",
    supportPhone: "(817) 985-3536",
    timezone: "America/Chicago",
    currency: "USD",
    platformUrl: "https://app.bes.io",
    legalUrl: "https://bes.io/legal",
  });
  // Live: the form shows the agency row, not the demo defaults.
  const brandQuery = useQuery({
    queryKey: ["agency", "brand", auth.agencyId],
    queryFn: () => fetchAgencyBrand(auth.agencyId as string),
    enabled: live,
    staleTime: 60_000,
  });
  useEffect(() => {
    if (brandQuery.data) setAgencyState(brandQuery.data);
  }, [brandQuery.data]);
  const queryClient = useQueryClient();
  const [brandSaveError, setBrandSaveError] = useState<string | null>(null);
  const canSaveBrand = live && auth.isAgencyAdmin;

  const [products, setProducts] = useState<ProductConfig[]>([
    {
      key: "creditOps",
      label: "CreditOps",
      state: "Active",
      plan: "Scale",
      limit: "1,500 clients",
      addons: ["AI Copilot", "Bulk Mail"],
    },
    {
      key: "fundingOps",
      label: "FundingOps",
      state: "Active",
      plan: "Growth",
      limit: "500 deals",
      addons: ["Lender Intelligence"],
    },
    {
      key: "diyCredit",
      label: "DIY Credit",
      state: "Active",
      plan: "Platform",
      limit: "Unlimited",
      addons: ["Referral Engine"],
    },
    {
      key: "oi",
      label: "Operational Intelligence",
      state: "Trial",
      plan: "—",
      limit: "—",
      addons: [],
    },
    {
      key: "crm",
      label: "BES CRM Benefit",
      state: "Active",
      plan: "Included",
      limit: "—",
      addons: [],
    },
  ]);

  const [users, setUsers] = useState<AgencyUserRow[]>(seedUsers);
  const [permissions] = useState<PermissionRow[]>(seedPermissions);
  const [audit] = useState<AuditEntry[]>(seedAudit);
  const [integrations] = useState<IntegrationRow[]>(seedIntegrations);
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({
    beta_score_simulator: true,
    beta_pdf_ocr: false,
    maintenance_mode: false,
    global_announcement: false,
  });
  const [saved, setSaved] = useState(false);

  const setAgency = (patch: Partial<typeof agency>) =>
    setAgencyState((p) => ({ ...p, ...patch }));

  const setProductState = (key: string, state: EntitlementState) =>
    setProducts((prev) =>
      prev.map((p) => (p.key === key ? { ...p, state } : p)),
    );

  const toggleUserActive = (id: string) =>
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, active: !u.active } : u)),
    );

  const toggleUserAssignedOnly = (id: string) =>
    setUsers((prev) =>
      prev.map((u) =>
        u.id === id ? { ...u, assignedOnly: !u.assignedOnly } : u,
      ),
    );

  const toggleFlag = (key: string) =>
    setFeatureFlags((prev) => ({ ...prev, [key]: !prev[key] }));

  const markSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  const saveBrand = async () => {
    setBrandSaveError(null);
    if (!live || !auth.agencyId) {
      setBrandSaveError("Sign in as a BES agency admin to save.");
      return;
    }
    try {
      await saveAgencyBrand(auth.agencyId, agency);
      await queryClient.invalidateQueries({ queryKey: ["agency", "brand"] });
      markSaved(); // now means what it says: the row was written
    } catch (e) {
      setBrandSaveError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <AgencySettingsContext.Provider
      value={{
        agency,
        setAgency,
        products,
        setProductState,
        users,
        toggleUserActive,
        toggleUserAssignedOnly,
        permissions,
        audit,
        integrations,
        featureFlags,
        toggleFlag,
        saved,
        markSaved,
        saveBrand,
        brandSaveError,
        canSaveBrand,
      }}
    >
      {children}
    </AgencySettingsContext.Provider>
  );
};

const safeSettings: AgencySettingsContextType = {
  agency: {
    name: "",
    logoUrl: "",
    supportEmail: "",
    supportPhone: "",
    timezone: "",
    currency: "",
    platformUrl: "",
    legalUrl: "",
  },
  setAgency: () => {},
  products: [],
  setProductState: () => {},
  users: [],
  toggleUserActive: () => {},
  toggleUserAssignedOnly: () => {},
  permissions: [],
  audit: [],
  integrations: [],
  featureFlags: {},
  toggleFlag: () => {},
  saved: false,
  markSaved: () => {},
  saveBrand: async () => {},
  brandSaveError: null,
  canSaveBrand: false,
};

export const useAgencySettings = () => {
  const ctx = useContext(AgencySettingsContext);
  return ctx ?? safeSettings;
};
