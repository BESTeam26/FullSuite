// Permission & role model for multi-portal access (Agency, Affiliate, Outsourcing).
// Mirrors the "delegated scopes" design from the platform blueprint: every portal
// only sees the capabilities explicitly granted to its role.

export type Role = "owner" | "affiliate" | "outsourcing";

export interface ScopeDef {
  key: string;
  label: string;
}

export interface RoleDef {
  key: Role;
  label: string;
  shortLabel: string;
  description: string;
  granted: ScopeDef[];
  blocked: ScopeDef[];
}

export const ROLES: Record<Role, RoleDef> = {
  owner: {
    key: "owner",
    label: "Agency Owner",
    shortLabel: "Owner",
    description:
      "Full administrative access across every engine, tenant setting, billing control, and portal — including admin views of Affiliate and Outsourcing portals.",
    granted: [{ key: "ALL", label: "Full platform access" }],
    blocked: [],
  },
  affiliate: {
    key: "affiliate",
    label: "Affiliate Partner",
    shortLabel: "Affiliate",
    description:
      "Referral tracking, commission and payout visibility only. No access to client credit data, case files, or agency billing controls.",
    granted: [
      { key: "REFERRAL_LINK_VIEW", label: "Referral links & tracking" },
      { key: "COMMISSION_VIEW", label: "Commission ledger" },
      { key: "PAYOUT_VIEW", label: "Payout history" },
      { key: "MARKETING_ASSET_VIEW", label: "Marketing asset library" },
    ],
    blocked: [
      { key: "CLIENT_PII", label: "Client personal & credit data" },
      { key: "CASE_READ", label: "Dispute case files" },
      { key: "TENANT_BILLING_ADMIN", label: "Agency billing controls" },
      { key: "USER_ADMIN", label: "Team & user administration" },
    ],
  },
  outsourcing: {
    key: "outsourcing",
    label: "Outsourcing Processor",
    shortLabel: "Processor",
    description:
      "Delegated, time-limited access to assigned case work only. Client identity fields are redacted and no financial administration is visible.",
    granted: [
      { key: "CASE_READ", label: "Assigned case read" },
      { key: "ISSUE_REVIEW", label: "Issue review" },
      { key: "DOCUMENT_REDACTED_VIEW", label: "Redacted document view" },
      { key: "LETTER_DRAFT", label: "Letter drafting" },
      { key: "LETTER_QA", label: "Letter QA" },
      { key: "CLIENT_MESSAGE", label: "Client messaging (scoped)" },
    ],
    blocked: [
      { key: "TENANT_BILLING_ADMIN", label: "Billing administration" },
      { key: "USER_ADMIN", label: "User administration" },
      { key: "EXPORT_ALL", label: "Full data export" },
      { key: "DELETE_AUDIT", label: "Audit log deletion" },
      { key: "PAYMENT_METHOD_VIEW", label: "Payment method details" },
      { key: "SSN_FULL_VIEW", label: "Full SSN / unmasked identity" },
    ],
  },
};

export const ROLE_LIST: Role[] = ["owner", "affiliate", "outsourcing"];
