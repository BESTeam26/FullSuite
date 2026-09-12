/**
 * CreditOps Partner registry.
 * A "Partner" is a workspace/list inside CreditOps (ClickUp analogy).
 * Partners are grouped under ManagedOps (SaaS-Pulled) or Outsourcing.
 * Each Partner owns ONE canonical set of End Client records; the 9 views
 * (Dashboard, SOPs & Logins, queues) are filtered views of those same records.
 */

import type { OpsPartner } from "@/lib/fulfillment/ops-client-domain";

export type PartnerGroup = "managed" | "outsourcing" | "creditops_users";

/**
 * Partners now come from the database (`lib/data/partners.ts`), where group and
 * mode are ordinary columns. Narrowing them to literal unions here would make
 * every live partner fail to typecheck against a constant that no longer
 * describes reality — the same change FundingOps needed. The unions above stay
 * as the documented vocabulary for the demo constants below.
 */
export type CreditOpsPartner = OpsPartner;

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

/**
 * The CreditOps workspace views, and WHO EACH ONE IS FOR.
 *
 * Dee, 2026-09-11: "Only show employees the operational workspace they are
 * responsible for. Do not make a Complaints agent navigate Processing,
 * Onboarding, Support, Bureau Calling, Escalations."
 *
 * Every view used to be shown to everybody, because the only filter was the
 * organization's `workspace_views` setting and `RoleAccess.views`, which is
 * empty for every role. Three scopes replace that:
 *
 *   universal   every authorized CreditOps member. Dashboard and Main Client
 *               List are the SHARED CLIENT DIRECTORY — deliberately not
 *               narrowed to a department or to your own assignments, so any
 *               agent can answer "where is this client?" for a caller.
 *   department  only the departments this person actually works, read from
 *               the canonical team → department assignment.
 *   management  cross-department operations tooling: the consolidated
 *               Escalation Queue and the CRM Signal Log.
 *
 * Presentation only. Row Level Security still decides which rows any of these
 * views receives, so a hidden queue hides nothing that was not already
 * protected, and a visible one shows nothing extra (rule 1).
 *
 * ── WHERE EACH VIEW LIVES: GLOBAL vs PARTNER ───────────────────────────────
 *
 * Dee, 2026-09-11: *"Since we already have GLOBAL CreditOps department queues,
 * do NOT repeat those same queues inside every Partner workspace… Global
 * queues for work. Partner workspace for visibility and client context."*
 *
 * `partnerLevel` says whether a view also belongs INSIDE one partner's
 * workspace. The department queues are false: there is ONE Dispute Queue for
 * all of CreditOps, and narrowing it to Kevin Hernandez is a filter on that
 * queue, not a second queue that has to be kept in step with it.
 *
 * The one exception is an organization's own CreditOps page, where there is no
 * global layer above it — their workspace IS the module, so their queues stay.
 * `CreditOpsPartnerWorkspace` takes that as an explicit prop rather than
 * inferring it.
 *
 * Order is operational: the file's journey, then reference material last.
 */
export type CreditOpsViewScope = "universal" | "department" | "management";

export const PARTNER_VIEWS = [
  { id: "dashboard", label: "Dashboard", scope: "universal", partnerLevel: true },
  { id: "main-list", label: "Main Client List", scope: "universal", partnerLevel: true },
  { id: "onboarding-queue", label: "Onboarding Queue", scope: "department", department: "Onboarding", partnerLevel: false },
  { id: "dispute-queue", label: "Dispute Queue", scope: "department", department: "Dispute", partnerLevel: false },
  { id: "support-queue", label: "Support Queue", scope: "department", department: "Support", partnerLevel: false },
  { id: "complaints-queue", label: "Complaints & Mailing", scope: "department", department: "Complaints", partnerLevel: false },
  { id: "bureau-queue", label: "Bureau Calling", scope: "department", department: "Bureau Calling", partnerLevel: false },
  { id: "escalation-queue", label: "Escalation Queue", scope: "management", partnerLevel: false },
  { id: "sops-logins", label: "SOPs & Logins", scope: "universal", partnerLevel: true },
] as const satisfies readonly {
  id: string; label: string; scope: CreditOpsViewScope; department?: string; partnerLevel: boolean;
}[];

export type PartnerViewId = (typeof PARTNER_VIEWS)[number]["id"];
