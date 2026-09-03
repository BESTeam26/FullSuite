/**
 * FundingOps Partner registry.
 *
 * A "Partner" is a workspace/list inside FundingOps (ClickUp analogy). Partners
 * are grouped under Outsourcing or FundingOps Users (native BES FundingOps
 * SaaS). Each Partner owns ONE canonical set of Funding Client records; the
 * workspace views are filtered projections of those same records.
 *
 * Information architecture (Agency fulfillment workspace):
 *   - The LEFT TREE is the client hierarchy (Partner → Client → Deal(s)).
 *   - There is NO separate "Clients" tab — the tree IS the client navigation.
 *   - "Deal List" replaces "Clients". It is scope-aware:
 *       Management selected  = all authorized deals across companies
 *       Company selected     = that company's deals
 *       Client selected      = that client's deals
 *   - "Funding Files" is NOT surfaced as its own tab in the Agency workspace.
 *     The Agency team works from Client → Deals. The richer Funding File
 *     architecture is retained internally in the SaaS product.
 *   - "SOPs & Logins" is COMPANY-LEVEL ONLY. It never appears inside Client or
 *     Deal views.
 *
 * Identity model:
 *   - For BES SaaS subscribers, the PERSON identity is shared across the BES
 *     ecosystem (CreditOps + FundingOps). One Vanessa = one person, with
 *     separate CreditOps case and FundingOps deals.
 *   - For manual / non-SaaS partners, the Funding Client record is created
 *     inside this division workspace and is FundingOps-scoped (not force-merged
 *     into the global SaaS universe).
 *
 * The ONE EMAIL = ONE FILE PER PARTNER rule still applies within FundingOps:
 * the same email may exist on at most one record inside a given Partner's
 * list. Cross-partner duplicates are allowed but warned (cancel & re-enroll /
 * shopping both companies).
 */

import type { OpsPartner } from "@/lib/fulfillment/ops-client-domain";

export type FundingPartnerGroup = "outsourcing" | "fundingops_users";

/**
 * Partners now arrive from the database (`lib/data/partners.ts`), where the
 * group and mode are ordinary columns. Narrowing them to a literal union here
 * would make every live partner fail to typecheck against a constant that no
 * longer describes reality, so the base shape is used as-is. The union above
 * remains the documented vocabulary for the demo constants below.
 */
export type FundingOpsPartner = OpsPartner;

export const FUNDING_OPS_PARTNERS: FundingOpsPartner[] = [
  /* ===== 1. Outsourcing — Fulfillment Only for External Funding Partners ===== */
  {
    id: "fpartner-meridian",
    name: "Meridian Capital Partners",
    group: "outsourcing",
    scopeId: "fos-group-1",
    mode: "outsourcing_only",
    contactName: "Meridian Capital",
    contactEmail: "fulfillment@meridiancap.com",
    contractRef: "FOS-2026-007",
    status: "Active",
  },
  {
    id: "fpartner-summit",
    name: "Summit Business Lending",
    group: "outsourcing",
    scopeId: "fos-group-2",
    mode: "outsourcing_only",
    contactName: "Summit Business Lending",
    contactEmail: "ops@summitbl.com",
    contractRef: "FOS-2026-019",
    status: "Onboarding",
  },
  /* ===== 2. FundingOps Users — Native BES FundingOps SaaS Subscribers ===== */
  {
    id: "fpartner-edp",
    name: "EDP Management Group",
    group: "fundingops_users",
    scopeId: "fsub-4",
    mode: "native_fundingops",
    contactName: "Erika & Edgar",
    contactEmail: "erika@edpmanagement.com",
    contractRef: "BES-FUND-001",
    status: "Active",
  },
];

export const getFundingPartnerByScope = (
  scopeId: string,
): FundingOpsPartner | undefined =>
  FUNDING_OPS_PARTNERS.find((p) => p.scopeId === scopeId);

/**
 * Company (Partner) workspace tabs. SOPs & Logins is company-level only.
 * No "Clients" tab (the tree is the client nav) and no "Funding Files" tab
 * (the Agency works from Client → Deals).
 */
export const FUNDING_PARTNER_VIEWS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "sops-logins", label: "SOPs & Logins" },
  { id: "deal-list", label: "Deal List" },
  { id: "readiness", label: "Readiness" },
  { id: "documents", label: "Documents" },
  { id: "submissions", label: "Submissions" },
  { id: "stipulations", label: "Stipulations" },
  { id: "offers", label: "Offers" },
  { id: "funded", label: "Funded" },
] as const;

export type FundingPartnerViewId = (typeof FUNDING_PARTNER_VIEWS)[number]["id"];
