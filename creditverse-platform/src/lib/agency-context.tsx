import { createContext, useContext, useState, type ReactNode } from "react";
import type {
  Organization,
  WorkItem,
  WorkStage,
  ProductKey,
  AgencyUser,
} from "@/lib/bes-domain";
import { isProductEnabled, orgPlanLabel } from "@/lib/bes-domain";
import {
  seedOrganizations,
  seedWorkItems,
  seedAgencyUsers,
} from "@/lib/bes-seed-data";

/* ------------------------------------------------------------------ */
/* Legacy-compatible SubAccount shape (kept for existing UI consumers) */
/* ------------------------------------------------------------------ */

export type SubAccount = {
  id: string;
  name: string;
  code: string;
  ownerName: string;
  ownerEmail: string;
  address?: string;
  isPinned?: boolean;
  branding?: {
    customDomain?: string;
    logoUrl?: string;
    primaryColor?: string;
    darkTheme?: boolean;
    companyTagline?: string;
  };
  plan: string;
  isFulfillmentSubscriber: boolean;
  activeClients: number;
  monthlyRevenue: number;
  status: "Active" | "Pending Onboarding" | "At Risk" | "Paused";
  joinedDate: string;
  modules: {
    creditOps: boolean;
    fundingOps: boolean;
    diyCredit: boolean;
    crm: boolean;
  };
  openWorkOrders: number;
};

export type FulfillmentWorkOrder = {
  id: string;
  subAccountId: string;
  subAccountName: string;
  clientName: string;
  clientEmail: string;
  round: string;
  type:
    | "Round 1 Processing"
    | "Round 2 Escalation"
    | "CFPB Complaint"
    | "Experian Upload"
    | "FTC Filing"
    | "Address Verification";
  priority: "High" | "Urgent" | "Normal";
  assignedTo: string;
  slaHoursRemaining: number;
  status: "Queued" | "In Processing" | "Ready for QA" | "Completed" | "Blocked";
  dateSubmitted: string;
  itemCount: number;
};

/* ------------------------------------------------------------------ */
/* Map Organization -> legacy SubAccount                               */
/* ------------------------------------------------------------------ */

const toSubAccount = (org: Organization): SubAccount => ({
  id: org.id,
  name: org.name,
  code: org.code,
  ownerName: org.principal.name,
  ownerEmail: org.principal.email,
  address: org.address,
  isPinned: org.isPinned,
  branding: org.branding,
  plan: orgPlanLabel(org),
  isFulfillmentSubscriber: org.isFulfillmentSubscriber,
  activeClients: 0,
  monthlyRevenue: org.businesses.reduce(
    (s, b) => s + (b.monthlyRevenue ?? 0),
    0,
  ),
  status: org.status,
  joinedDate: org.joinedDate,
  modules: {
    creditOps: isProductEnabled(org, "creditOps"),
    fundingOps: isProductEnabled(org, "fundingOps"),
    diyCredit: isProductEnabled(org, "diyCredit"),
    crm: isProductEnabled(org, "crm"),
  },
  openWorkOrders: 0,
});

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

interface AgencyContextType {
  viewMode: "agency" | "subaccount";
  activeSubAccountId: string | null;
  activeSubAccount: SubAccount | null;
  activeOrganization: Organization | null;
  subAccounts: SubAccount[];
  organizations: Organization[];
  recentSubAccountIds: string[];
  workOrders: FulfillmentWorkOrder[];
  workItems: WorkItem[];
  agencyUsers: AgencyUser[];
  switchToAgencyView: () => void;
  switchToSubAccount: (id: string) => void;
  togglePinSubAccount: (id: string) => void;
  toggleFulfillmentSubscription: (subAccountId: string) => void;
  updateSubAccountBranding: (
    subAccountId: string,
    branding: Partial<NonNullable<Organization["branding"]>>,
  ) => void;
  updateWorkOrderStatus: (workOrderId: string, status: WorkStage) => void;
  addWorkOrder: (
    wo: Omit<FulfillmentWorkOrder, "id" | "dateSubmitted">,
  ) => void;
  addSubAccount: (
    acc: Omit<SubAccount, "id" | "joinedDate" | "openWorkOrders">,
  ) => void;
  agencyWork: WorkItem[];
  activeOrgWork: WorkItem[];
  isProductOn: (key: ProductKey) => boolean;
}

const AgencyContext = createContext<AgencyContextType | undefined>(undefined);

export const AgencyProvider = ({ children }: { children: ReactNode }) => {
  const [viewMode, setViewMode] = useState<"agency" | "subaccount">("agency");
  const [activeSubAccountId, setActiveSubAccountId] = useState<string | null>(
    null,
  );
  const [recentSubAccountIds, setRecentSubAccountIds] = useState<string[]>([
    "sub-1",
    "sub-4",
  ]);
  const [organizations, setOrganizations] =
    useState<Organization[]>(seedOrganizations);
  const [workItems, setWorkItems] = useState<WorkItem[]>(seedWorkItems);
  const agencyUsers = seedAgencyUsers;

  const activeOrganization =
    organizations.find((o) => o.id === activeSubAccountId) || null;

  const subAccounts = organizations.map(toSubAccount);
  const activeSubAccount =
    subAccounts.find((s) => s.id === activeSubAccountId) || null;

  const workOrders: FulfillmentWorkOrder[] = workItems
    .filter((w) => w.scope === "AGENCY")
    .map((w, i) => {
      const org = organizations[0];
      return {
        id: w.id,
        subAccountId: org?.id ?? "",
        subAccountName: org?.name ?? "BES Fulfillment",
        clientName: w.title.split("—")[1]?.trim() ?? "Client",
        clientEmail: "",
        round: "",
        type: "Round 1 Processing",
        priority: (w.slaHoursRemaining ?? 24) <= 4 ? "Urgent" : "High",
        assignedTo: w.assignedTo ?? "Unassigned",
        slaHoursRemaining: w.slaHoursRemaining ?? 24,
        status:
          w.stage === "Ready for QA"
            ? "Ready for QA"
            : (w.stage as FulfillmentWorkOrder["status"]),
        dateSubmitted: w.createdAt,
        itemCount: i + 1,
      };
    });

  const switchToAgencyView = () => {
    setViewMode("agency");
    setActiveSubAccountId(null);
  };

  const switchToSubAccount = (id: string) => {
    setViewMode("subaccount");
    setActiveSubAccountId(id);
    setRecentSubAccountIds((prev) =>
      [id, ...prev.filter((rId) => rId !== id)].slice(0, 5),
    );
  };

  const togglePinSubAccount = (id: string) => {
    setOrganizations((prev) =>
      prev.map((o) => (o.id === id ? { ...o, isPinned: !o.isPinned } : o)),
    );
  };

  const toggleFulfillmentSubscription = (subAccountId: string) => {
    setOrganizations((prev) =>
      prev.map((o) =>
        o.id === subAccountId
          ? { ...o, isFulfillmentSubscriber: !o.isFulfillmentSubscriber }
          : o,
      ),
    );
  };

  const updateSubAccountBranding = (
    subAccountId: string,
    branding: Partial<NonNullable<Organization["branding"]>>,
  ) => {
    setOrganizations((prev) =>
      prev.map((o) =>
        o.id === subAccountId
          ? { ...o, branding: { ...o.branding, ...branding } }
          : o,
      ),
    );
  };

  const updateWorkOrderStatus = (workOrderId: string, status: WorkStage) => {
    setWorkItems((prev) =>
      prev.map((w) => (w.id === workOrderId ? { ...w, stage: status } : w)),
    );
  };

  const addWorkOrder = (
    wo: Omit<FulfillmentWorkOrder, "id" | "dateSubmitted">,
  ) => {
    const newId = `WO-${Math.floor(9000 + Math.random() * 1000)}`;
    const newItem: WorkItem = {
      id: newId,
      scope: "AGENCY",
      relatedType: "fulfillment",
      relatedId: wo.subAccountId,
      title: `${wo.type} — ${wo.clientName}`,
      stage: wo.status,
      assignedTo: wo.assignedTo,
      slaHoursRemaining: wo.slaHoursRemaining,
      createdAt: "Just now",
    };
    setWorkItems((prev) => [newItem, ...prev]);
  };

  const addSubAccount = (
    acc: Omit<SubAccount, "id" | "joinedDate" | "openWorkOrders">,
  ) => {
    const newId = `sub-${organizations.length + 1}`;
    const newOrg: Organization = {
      id: newId,
      name: acc.name,
      code: acc.code,
      principal: { name: acc.ownerName, email: acc.ownerEmail },
      address: acc.address,
      status: acc.status,
      joinedDate: "Today",
      isFulfillmentSubscriber: acc.isFulfillmentSubscriber,
      isPinned: acc.isPinned,
      entitlements: [
        {
          key: "creditOps",
          label: "CreditOps",
          enabled: acc.modules.creditOps,
        },
        {
          key: "fundingOps",
          label: "FundingOps",
          enabled: acc.modules.fundingOps,
        },
        {
          key: "diyCredit",
          label: "DIY Credit",
          enabled: acc.modules.diyCredit,
        },
        { key: "crm", label: "BES CRM", enabled: acc.modules.crm },
      ],
      businesses: [],
      orgUsers: [],
      externalUsers: [],
      branding: acc.branding,
    };
    setOrganizations((prev) => [...prev, newOrg]);
  };

  const agencyWork = workItems.filter((w) => w.scope === "AGENCY");
  const activeOrgWork = activeSubAccountId
    ? workItems.filter(
        (w) =>
          w.scope === "ORGANIZATION" && w.organizationId === activeSubAccountId,
      )
    : [];

  const isProductOn = (key: ProductKey) =>
    activeOrganization ? isProductEnabled(activeOrganization, key) : false;

  return (
    <AgencyContext.Provider
      value={{
        viewMode,
        activeSubAccountId,
        activeSubAccount,
        activeOrganization,
        subAccounts,
        organizations,
        recentSubAccountIds,
        workOrders,
        workItems,
        agencyUsers,
        switchToAgencyView,
        switchToSubAccount,
        togglePinSubAccount,
        toggleFulfillmentSubscription,
        updateSubAccountBranding,
        updateWorkOrderStatus,
        addWorkOrder,
        addSubAccount,
        agencyWork,
        activeOrgWork,
        isProductOn,
      }}
    >
      {children}
    </AgencyContext.Provider>
  );
};

const safeAgency: AgencyContextType = {
  viewMode: "agency",
  activeSubAccountId: null,
  activeSubAccount: null,
  activeOrganization: null,
  subAccounts: [],
  organizations: [],
  recentSubAccountIds: [],
  workOrders: [],
  workItems: [],
  agencyUsers: [],
  switchToAgencyView: () => {},
  switchToSubAccount: () => {},
  togglePinSubAccount: () => {},
  toggleFulfillmentSubscription: () => {},
  updateSubAccountBranding: () => {},
  updateWorkOrderStatus: () => {},
  addWorkOrder: () => {},
  addSubAccount: () => {},
  agencyWork: [],
  activeOrgWork: [],
  isProductOn: () => false,
};

export const useAgency = () => {
  const ctx = useContext(AgencyContext);
  return ctx ?? safeAgency;
};
