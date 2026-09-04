/**
 * BES Canonical Domain Model
 * ---------------------------
 * Strict Agency HQ vs Sub-Account boundary.
 *
 * BES Agency HQ  = the operator of the SaaS and BES-delivered services.
 * Sub-Account    = a Customer Organization (separate company) with its own
 *                   users, clients, products, permissions, work, and reporting.
 *
 * Hierarchy:
 *   BES Agency
 *     -> Customer Organization (Sub-Account)
 *        -> Organization Owner / Principal
 *        -> Business(es)
 *        -> Product Entitlements (CreditOps / FundingOps / DIY / OI)
 *        -> Organization Users (internal staff)
 *        -> External Users (BRM / Sales Partner / Lender / Affiliate / Client)
 *        -> End Clients
 *           -> Credit Cases / Funding Deals / Projects
 *              -> Work Items (shared operations engine)
 *
 * Domain concepts kept SEPARATE (never one generic "Partner"):
 *   - Customer Organization
 *   - Organization Owner / Principal
 *   - Sales Partner (FundingOps)
 *   - Referral Partner (DIY / affiliate)
 *   - BRM (Business Relationship Manager)
 *   - Lender
 *   - End Client / Borrower
 *
 * Operations engine is SHARED but SCOPED:
 *   scope = AGENCY   -> BES employees only
 *   scope = ORGANIZATION -> a customer org's own employees
 * Work enters the Agency layer ONLY via an explicit BES service
 * (Done-For-You fulfillment, outsourcing, support escalation, etc.).
 */

export type ProductKey =
  | "creditOps"
  | "fundingOps"
  | "diyCredit"
  | "oi"
  | "crm"
  | "workspaces"
  | "talentOps";

export type ProductLabel =
  | "CreditOps"
  | "FundingOps"
  | "DIY Credit"
  | "Operational Intelligence"
  | "BES CRM"
  | "Custom Workspaces"
  | "TalentOps";

export interface ProductEntitlement {
  key: ProductKey;
  label: ProductLabel;
  enabled: boolean;
}

/** A business entity owned by an Organization principal (one org may have many). */
export interface Business {
  id: string;
  name: string;
  legalName?: string;
  ein?: string;
  industry?: string;
  timeInBusinessMonths?: number;
  monthlyRevenue?: number;
}

/** Work-item scope — the hard boundary between BES and customer work. */
export type WorkScope = "AGENCY" | "ORGANIZATION";

/** What a work item is attached to (shared ops engine, typed attachments). */
export type WorkRelatedType =
  "credit_case" | "funding_deal" | "project" | "support" | "fulfillment";

export type WorkStage =
  | "Queued"
  | "Assigned"
  | "In Processing"
  | "Ready for QA"
  | "QA Review"
  | "Completed"
  | "Blocked"
  | "Attention";

export interface WorkItem {
  id: string;
  scope: WorkScope;
  organizationId?: string; // null/undefined => AGENCY
  relatedType: WorkRelatedType;
  relatedId: string;
  title: string;
  stage: WorkStage;
  assignedTo?: string;
  slaHoursRemaining?: number;
  createdAt: string;
  /** Set when the item lives in a Custom Workspace (rule 17). */
  workspaceId?: string;
  /** Owning agency — needed to post activity on the record. */
  agencyId?: string;
  /** BES division that owns execution (creditops, fundingops, bes_crm, talentops). */
  division?: string;
  /** For AGENCY-scope work about a customer (e.g. a BES CRM project). */
  subjectOrganizationId?: string;
  description?: string;
  dueAt?: string;
}

/* ------------------------------------------------------------------ */
/* Organization users — internal customer staff                        */
/* ------------------------------------------------------------------ */

export type OrgRole =
  | "org_admin"
  | "org_manager"
  | "credit_processor"
  | "credit_qa"
  | "credit_support"
  | "credit_sales"
  | "credit_complaints"
  | "credit_bureau_caller"
  | "funding_admin"
  | "funding_manager"
  | "funding_processor"
  | "funding_doc_reviewer"
  | "funding_underwriter"
  | "funding_sales"
  | "funding_support";

export interface OrgUser {
  id: string;
  name: string;
  email: string;
  role: OrgRole;
  product: ProductKey;
  /** Restrict to assigned records only. */
  assignedOnly: boolean;
  /** Department / team scope when assignedOnly is off. */
  teamScope?: string;
}

/* ------------------------------------------------------------------ */
/* External users — always record-scoped                              */
/* ------------------------------------------------------------------ */

export type ExternalRole =
  | "brm"
  | "sales_partner"
  | "referral_partner"
  | "lender"
  | "affiliate"
  | "client";

export interface ExternalUser {
  id: string;
  name: string;
  email: string;
  role: ExternalRole;
  /** Record-scoped: only sees records explicitly linked to this id. */
  scopedRecordIds: string[];
}

/* ------------------------------------------------------------------ */
/* Customer Organization (Sub-Account)                                 */
/* ------------------------------------------------------------------ */

export type OrgStatus = "Active" | "Pending Onboarding" | "At Risk" | "Paused";

export interface Organization {
  id: string;
  name: string;
  code: string;
  /** Organization Owner / Principal — the actual owner BES supports. */
  principal: {
    name: string;
    email: string;
  };
  address?: string;
  status: OrgStatus;
  joinedDate: string;
  /** Products activated for this organization. */
  entitlements: ProductEntitlement[];
  /** Whether this org subscribes to BES Done-For-You fulfillment. */
  /**
   * Whether BES performs fulfillment for this organization.
   *
   * A coarse stand-in, NOT the relationship rule 16 requires: it carries no
   * module, no authorized data scope, no effective dates and no BES team
   * scope, and it cannot express a partner who uses BES fulfillment WITHOUT a
   * SaaS organization — those are modelled separately as outsourcing groups.
   * Do not read this as "is a BES Partner". Replacing it needs a first-class
   * engagement record; see BUILD_STATUS.
   */
  isFulfillmentSubscriber: boolean;
  businesses: Business[];
  orgUsers: OrgUser[];
  externalUsers: ExternalUser[];
  branding?: {
    customDomain?: string;
    logoUrl?: string;
    primaryColor?: string;
    darkTheme?: boolean;
    companyTagline?: string;
  };
  isPinned?: boolean;
}

/* ------------------------------------------------------------------ */
/* BES Agency users — BES employees only                               */
/* ------------------------------------------------------------------ */

export type AgencyRole =
  | "agency_owner"
  | "agency_admin"
  | "agency_manager"
  | "agency_team_lead"
  | "agency_agent";

export interface AgencyUser {
  id: string;
  name: string;
  email: string;
  role: AgencyRole;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

export const PRODUCT_LABELS: Record<ProductKey, ProductLabel> = {
  creditOps: "CreditOps",
  fundingOps: "FundingOps",
  diyCredit: "DIY Credit",
  oi: "Operational Intelligence",
  crm: "BES CRM",
  workspaces: "Custom Workspaces",
  talentOps: "TalentOps",
};

export const isProductEnabled = (org: Organization, key: ProductKey): boolean =>
  org.entitlements.some((e) => e.key === key && e.enabled) ?? false;

/** Plan label derived from active entitlements. */
export const orgPlanLabel = (org: Organization): string => {
  const enabled = org.entitlements.filter((e) => e.enabled);
  if (enabled.length >= 3) return "Full Suite";
  if (enabled.length === 0) return "No Products";
  if (enabled.length === 1) return enabled[0].label;
  return enabled.map((e) => e.label).join(" + ");
};

/** A work item is Agency work only if scope === AGENCY. */
export const isAgencyWork = (w: WorkItem): boolean => w.scope === "AGENCY";

/** A work item belongs to an org's self-managed work. */
export const isOrgWork = (w: WorkItem, orgId: string): boolean =>
  w.scope === "ORGANIZATION" && w.organizationId === orgId;

/**
 * The hard boundary rule:
 * Sub-Account activity does NOT automatically become BES Agency work.
 * Work enters the Agency layer only via an explicit BES service.
 */
export const canAgencySeeWork = (w: WorkItem): boolean => w.scope === "AGENCY";

export const canOrgSeeWork = (w: WorkItem, orgId: string): boolean =>
  w.scope === "ORGANIZATION" && w.organizationId === orgId;
