/**
 * CreditOps Partner registry.
 * A "Partner" is a workspace/list inside CreditOps (ClickUp analogy).
 * Partners are grouped under ManagedOps (SaaS-Pulled) or Outsourcing.
 * Each Partner owns ONE canonical set of End Client records; the 9 views
 * (Dashboard, SOPs & Logins, queues) are filtered views of those same records.
 */

export type PartnerGroup = "managed" | "outsourcing" | "creditops_users";

export interface CreditOpsPartner {
  id: string;
  name: string;
  group: PartnerGroup;
  /** Sub-account organization id (managed / creditops_users) or outsourcing group id (outsourcing) */
  scopeId: string;
  /** Operational mode */
  mode: "saas_pulled" | "outsourcing_only" | "native_creditops";
  /** Partner contact / principal */
  contactName?: string;
  contactEmail?: string;
  /** Contract reference for outsourcing partners */
  contractRef?: string;
  status: "Active" | "Paused" | "Onboarding";
}

export const CREDIT_OPS_PARTNERS: CreditOpsPartner[] = [
  /* ===== 1. ManagedOps — External CRM (DF, CRC, etc.) where BES manages ops ===== */
  {
    id: "partner-apex",
    name: "Apex Credit Co.",
    group: "managed",
    scopeId: "sub-1",
    mode: "saas_pulled",
    contactName: "Daniel Reyes",
    contactEmail: "ops@apexcredit.com",
    status: "Active",
  },
  {
    id: "partner-pioneer",
    name: "Pioneer Credit Solutions",
    group: "managed",
    scopeId: "sub-2",
    mode: "saas_pulled",
    contactName: "Marcus Lee",
    contactEmail: "team@pioneercredit.com",
    status: "Active",
  },
  {
    id: "partner-creditfix",
    name: "CreditFix Solutions",
    group: "managed",
    scopeId: "sub-4",
    mode: "saas_pulled",
    contactName: "Sofia Martinez",
    contactEmail: "hello@creditfixsol.com",
    status: "Active",
  },
  /* ===== 2. Outsourcing — Fulfillment Only for External CRM Clients ===== */
  {
    id: "partner-crc",
    name: "CRC Outsourcing",
    group: "outsourcing",
    scopeId: "os-group-1",
    mode: "outsourcing_only",
    contactName: "Credit Restoration Center",
    contactEmail: "ops@creditrestorationcenter.com",
    contractRef: "OS-2026-014",
    status: "Active",
  },
  {
    id: "partner-metro",
    name: "Metro Dispute Partners",
    group: "outsourcing",
    scopeId: "os-group-2",
    mode: "outsourcing_only",
    contactName: "Metro Dispute LLC",
    contactEmail: "fulfillment@metrodispute.com",
    contractRef: "OS-2026-021",
    status: "Onboarding",
  },
  /* ===== 3. CreditOps Users — Native BES CreditOps SaaS + BES Fulfillment Subscribers ===== */
  {
    id: "partner-edp",
    name: "EDP Management Group",
    group: "creditops_users",
    scopeId: "sub-3",
    mode: "native_creditops",
    contactName: "Erika & Edgar",
    contactEmail: "erika@edpmanagement.com",
    contractRef: "BES-NATIVE-001",
    status: "Active",
  },
];

export const getPartnerByScope = (
  scopeId: string,
): CreditOpsPartner | undefined =>
  CREDIT_OPS_PARTNERS.find((p) => p.scopeId === scopeId);

export const PARTNER_VIEWS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "sops-logins", label: "SOPs & Logins" },
  { id: "main-list", label: "Main Client List" },
  { id: "dispute-queue", label: "Dispute Queue" },
  { id: "onboarding-queue", label: "Onboarding Queue" },
  { id: "support-queue", label: "Support Queue" },
  { id: "escalation-queue", label: "Escalation Queue" },
  { id: "complaints-queue", label: "Complaints & Mailing" },
  { id: "bureau-queue", label: "Bureau Calling" },
] as const;

export type PartnerViewId = (typeof PARTNER_VIEWS)[number]["id"];
