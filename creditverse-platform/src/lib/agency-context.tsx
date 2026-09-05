/**
 * Agency context — HQ ⇄ Organization view switching and the organization list.
 *
 * Data source depends on auth mode:
 *   live  → Supabase via TanStack Query (RLS-scoped), mutations invalidate.
 *   demo  → in-memory seed data (no backend).
 *
 * The public interface is unchanged so every existing consumer keeps working.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  fetchFulfillmentEngagements,
  isEngagementLive,
} from "@/lib/data/fulfillment-engagements";
import { toast } from "sonner";
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
import { useAuth } from "@/lib/auth/auth-context";
import {
  createOrganization,
  fetchOrganizations,
  pushRecentOrg,
  setEntitlement,
  togglePinnedOrg,
  updateOrganization,
  updateOrganizationBranding,
} from "@/lib/data/organizations";

/* ------------------------------------------------------------------ */
/* Legacy-compatible SubAccount shape (kept for existing UI consumers) */
/* ------------------------------------------------------------------ */

export type SubAccount = {
  id: string;
  /** Permanent Organization ID (BES-XXXXXX). */
  publicId: string;
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

const toSubAccount = (org: Organization): SubAccount => ({
  id: org.id,
  name: org.name,
  code: org.code,
  publicId: org.publicId,
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
  /** true while live organizations are loading for the first time */
  orgsLoading: boolean;
  orgsError: string | null;
  recentSubAccountIds: string[];
  workOrders: FulfillmentWorkOrder[];
  workItems: WorkItem[];
  agencyUsers: AgencyUser[];
  switchToAgencyView: () => void;
  switchToSubAccount: (id: string) => void;
  /** Route sync for /app/org/:publicId. */
  activateOrganizationByPublicId: (publicId: string) => "active" | "unknown" | "loading";
  resolveOrganizationByPublicId: (publicId: string) => "active" | "unknown" | "loading";
  /** True while the organizations list is still loading (live mode). */
  organizationsLoading: boolean;
  togglePinSubAccount: (id: string) => void;
  updateSubAccountBranding: (
    subAccountId: string,
    branding: Partial<NonNullable<Organization["branding"]>>,
  ) => void;
  updateWorkOrderStatus: (workOrderId: string, status: WorkStage) => void;
  addWorkOrder: (
    wo: Omit<FulfillmentWorkOrder, "id" | "dateSubmitted">,
  ) => void;
  addSubAccount: (
    acc: Omit<SubAccount, "id" | "publicId" | "joinedDate" | "openWorkOrders">,
  ) => void;
  agencyWork: WorkItem[];
  activeOrgWork: WorkItem[];
  isProductOn: (key: ProductKey) => boolean;
}

const AgencyContext = createContext<AgencyContextType | undefined>(undefined);

const ACTIVE_ORG_SESSION_KEY = "bes.activeOrganizationId";
/** Query keys that are NOT organization-scoped and survive an organization switch. */
const GLOBAL_QUERY_KEYS = new Set(["organizations", "fulfillment", "agency", "notifications", "teams", "outsourcing-groups", "user-preferences"]);

const reportError = (action: string) => (err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  toast.error(`${action} failed`, { description: msg });
};

export const AgencyProvider = ({ children }: { children: ReactNode }) => {
  const auth = useAuth();
  const live =
    auth.mode === "live" && auth.status === "signed-in" && !!auth.user;
  const userId = auth.user?.id ?? "";
  const queryClient = useQueryClient();

  /* ---- organizations: live query or local seed ---- */
  const orgQuery = useQuery({
    queryKey: ["organizations", userId],
    queryFn: () => fetchOrganizations(userId),
    enabled: live,
    staleTime: 30_000,
  });
  const [localOrgs, setLocalOrgs] = useState<Organization[]>(seedOrganizations);
  /* Memoised so the derived subAccounts list keeps a stable identity between
     renders; a fresh array each render would rebuild it every time. */
  /* Fulfillment status is the engagement, never the dead column
     organizations.is_fulfillment_subscriber (no policy reads it). One query,
     the same key useFulfillment() uses, so it is fetched once. */
  const engagementQuery = useQuery({
    queryKey: ["fulfillment", "engagements"],
    queryFn: fetchFulfillmentEngagements,
    enabled: live,
    staleTime: 5 * 60_000,
  });
  const organizations = useMemo(() => {
    if (!live) return localOrgs;
    const engagements = engagementQuery.data ?? [];
    return (orgQuery.data ?? []).map((o) => ({
      ...o,
      isFulfillmentSubscriber: engagements.some(
        (e) => e.organizationId === o.id && isEngagementLive(e),
      ),
    }));
  }, [live, orgQuery.data, engagementQuery.data, localOrgs]);
  const invalidateOrgs = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["organizations"] }),
    [queryClient],
  );

  /* ---- view state: ONE canonical active organization ----
     The id is restored from sessionStorage as a convenience only; every use
     below validates it against the organizations RLS returned to this user, so
     a stale or forged id resolves to nothing. Membership + RLS authorize;
     this state merely selects among what is already authorized. */
  const navigate = useNavigate();
  const [activeSubAccountId, setActiveSubAccountIdState] = useState<string | null>(() => {
    try { return sessionStorage.getItem(ACTIVE_ORG_SESSION_KEY); } catch { return null; }
  });
  const [viewMode, setViewMode] = useState<"agency" | "subaccount">(() => {
    try { return sessionStorage.getItem(ACTIVE_ORG_SESSION_KEY) ? "subaccount" : "agency"; } catch { return "agency"; }
  });
  const setActiveSubAccountId = useCallback((id: string | null) => {
    setActiveSubAccountIdState(id);
    try { if (id) sessionStorage.setItem(ACTIVE_ORG_SESSION_KEY, id); else sessionStorage.removeItem(ACTIVE_ORG_SESSION_KEY); } catch { /* storage unavailable: state still works */ }
  }, []);
  const [recentSubAccountIds, setRecentSubAccountIds] = useState<string[]>(
    live ? [] : ["sub-1", "sub-4"],
  );

  /* ---- work items (seed until Phase 2) ---- */
  const [workItems, setWorkItems] = useState<WorkItem[]>(seedWorkItems);
  const agencyUsers = seedAgencyUsers;

  const activeOrganization =
    organizations.find((o) => o.id === activeSubAccountId) || null;
  const subAccounts = useMemo(
    () => organizations.map(toSubAccount),
    [organizations],
  );
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

  /* Organization users never see BES Agency HQ: their view is their
     organization. Staff may hold a stale session id for an organization RLS
     no longer returns; that falls back to the agency view rather than an
     empty organization. */
  useEffect(() => {
    if (!live || orgQuery.isLoading) return;
    const visible = organizations.map((o) => o.id);
    if (!auth.isAgencyStaff) {
      if (visible.length === 0) return;
      if (!activeSubAccountId || !visible.includes(activeSubAccountId)) setActiveSubAccountId(visible[0]);
      if (viewMode !== "subaccount") setViewMode("subaccount");
    } else if (activeSubAccountId && organizations.length > 0 && !visible.includes(activeSubAccountId)) {
      setActiveSubAccountId(null);
      setViewMode("agency");
    }
  }, [live, orgQuery.isLoading, organizations, auth.isAgencyStaff, activeSubAccountId, viewMode, setActiveSubAccountId]);

  /* Switching is a context boundary: everything organization-scoped is
     dropped from the cache and the user lands on the organization's own
     dashboard. Global data (the organizations list, engagements, the agency,
     notifications, agency teams) survives, so the switch costs only the
     organization's own requests. */
  const invalidateOrganizationScope = useCallback(() => {
    void queryClient.invalidateQueries({
      predicate: (q) => !GLOBAL_QUERY_KEYS.has(String(q.queryKey[0])),
    });
  }, [queryClient]);

  /* ---- actions ---- */
  const switchToAgencyView = () => {
    if (live && !auth.isAgencyStaff) return; // not a BES user: no agency view exists for them
    setViewMode("agency");
    setActiveSubAccountId(null);
    invalidateOrganizationScope();
    navigate("/app");
  };

  const switchToSubAccount = (id: string) => {
    const org = organizations.find((o) => o.id === id);
    if (!org) return; // only organizations RLS returned to this user are switchable
    if (typeof performance !== "undefined") performance.mark("bes:org-switch:start");
    setViewMode("subaccount");
    setActiveSubAccountId(id);
    setRecentSubAccountIds((prev) =>
      [id, ...prev.filter((r) => r !== id)].slice(0, 5),
    );
    if (live) void pushRecentOrg(userId, id).catch(() => undefined);
    invalidateOrganizationScope();
    navigate(`/app/org/${org.publicId}`);
  };

  /** Route → context: /app/org/:publicId selects that organization if this user can see it. */
  /** Pure: what a route's public id resolves to. Safe to call during render. */
  const resolveOrganizationByPublicId = useCallback(
    (publicId: string): "active" | "unknown" | "loading" => {
      if (live && orgQuery.isLoading) return "loading";
      return organizations.some((o) => o.publicId === publicId) ? "active" : "unknown";
    },
    [live, orgQuery.isLoading, organizations],
  );
  /** Side effect: make that organization the active one. Call from an effect, never during render. */
  const activateOrganizationByPublicId = useCallback(
    (publicId: string): "active" | "unknown" | "loading" => {
      const state = resolveOrganizationByPublicId(publicId);
      if (state !== "active") return state;
      const org = organizations.find((o) => o.publicId === publicId)!;
      if (activeSubAccountId !== org.id) setActiveSubAccountId(org.id);
      if (viewMode !== "subaccount") setViewMode("subaccount");
      return "active";
    },
    [resolveOrganizationByPublicId, organizations, activeSubAccountId, viewMode, setActiveSubAccountId],
  );

  const togglePinSubAccount = (id: string) => {
    if (live) {
      void togglePinnedOrg(userId, id)
        .then(invalidateOrgs)
        .catch(reportError("Pin"));
      return;
    }
    setLocalOrgs((prev) =>
      prev.map((o) => (o.id === id ? { ...o, isPinned: !o.isPinned } : o)),
    );
  };

  const updateSubAccountBranding = (
    subAccountId: string,
    branding: Partial<NonNullable<Organization["branding"]>>,
  ) => {
    if (live) {
      void updateOrganizationBranding(subAccountId, branding)
        .then(invalidateOrgs)
        .catch(reportError("Branding update"));
      return;
    }
    setLocalOrgs((prev) =>
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
    acc: Omit<SubAccount, "id" | "publicId" | "joinedDate" | "openWorkOrders">,
  ) => {
    if (live) {
      const agencyId = auth.agencyMembership?.agency_id;
      if (!agencyId) {
        toast.error("Only BES agency staff can provision organizations.");
        return;
      }
      void createOrganization({
        agencyId,
        name: acc.name,
        code: acc.code,
        principalName: acc.ownerName,
        principalEmail: acc.ownerEmail,
        address: acc.address,
        status: acc.status,
        entitlements: {
          creditOps: acc.modules.creditOps,
          fundingOps: acc.modules.fundingOps,
          diyCredit: acc.modules.diyCredit,
          crm: acc.modules.crm,
        },
        branding: acc.branding,
      })
        .then(() => {
          toast.success(`${acc.name} provisioned`);
          return invalidateOrgs();
        })
        .catch(reportError("Provisioning"));
      return;
    }
    const newId = `sub-${localOrgs.length + 1}`;
    const newOrg: Organization = {
      id: newId,
      name: acc.name,
      code: acc.code,
      principal: { name: acc.ownerName, email: acc.ownerEmail },
      address: acc.address,
      status: acc.status,
      joinedDate: "Today",
      publicId: `BES-${acc.code.toUpperCase().padEnd(6, "X").slice(0, 6)}`, // demo only; live ids come from the database
      isFulfillmentSubscriber: false, // demo only; live derives from engagements
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
    setLocalOrgs((prev) => [...prev, newOrg]);
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
        orgsLoading: live && orgQuery.isPending,
        orgsError:
          live && orgQuery.error ? (orgQuery.error as Error).message : null,
        recentSubAccountIds,
        workOrders,
        workItems,
        agencyUsers,
        switchToAgencyView,
        switchToSubAccount,
        activateOrganizationByPublicId,
        resolveOrganizationByPublicId,
        organizationsLoading: live && orgQuery.isLoading,
        togglePinSubAccount,
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
  orgsLoading: false,
  orgsError: null,
  recentSubAccountIds: [],
  workOrders: [],
  workItems: [],
  agencyUsers: [],
  switchToAgencyView: () => {},
  switchToSubAccount: () => {},
  activateOrganizationByPublicId: () => "unknown",
  resolveOrganizationByPublicId: () => "unknown",
  organizationsLoading: false,
  togglePinSubAccount: () => {},
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

/** Convenience: add or remove a product entitlement (live only; no-op in demo). */
export const useSetEntitlement = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return (orgId: string, product: ProductKey, enabled: boolean) => {
    if (auth.mode !== "live") return Promise.resolve();
    return setEntitlement(orgId, product, enabled)
      .then(() =>
        queryClient.invalidateQueries({ queryKey: ["organizations"] }),
      )
      .catch(reportError("Entitlement update"));
  };
};
