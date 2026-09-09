/**
 * Ops role resolver — the ONE place that turns a person's real membership into
 * the CreditOps / FundingOps interface role.
 *
 * The interface role only shapes what the screen offers (which departments can
 * be logged, whether the Management layer is shown). It is never the security
 * boundary: every write is still checked by Row Level Security against the
 * membership rows this resolver reads (rule 1, rule 3). What the resolver fixes
 * is honesty — the surface used to hold its role in browser state defaulting to
 * "admin", so a processor saw Management controls the database would refuse.
 *
 * Inputs are the canonical rows: `agency_memberships.role` for BES staff and
 * `org_memberships.role` for the active organization. Names, emails and team
 * labels are never consulted (rule 4).
 */
import type { Enums } from "@/lib/supabase/database.types";
import type { CreditOpsRoleKey } from "@/lib/fulfillment/creditops-access";
import {
  agencyRoleAccess,
  defaultRoleAccess,
  NO_ACCESS,
  type OpsProduct,
  type RoleAccess,
} from "@/lib/fulfillment/role-access-defaults";
import type { FundingOpsRoleKey } from "@/lib/fulfillment/fundingops-access";

export type AgencyRoleKey = Enums<"agency_role">;
export type OrgRoleKey = Enums<"org_role">;

export interface RoleResolutionInput {
  /** `agency_memberships.role` when the person is BES staff, else null. */
  agencyRole: AgencyRoleKey | null;
  /** `org_memberships.role` for the ACTIVE organization, else null. */
  orgRole: OrgRoleKey | null;
}

/* BES staff: owners, admins and managers run the division; leads and agents
   work files. A team lead does not get the cross-partner Management layer from
   the role alone — that is a scope question the database answers (rule 1:
   default to deny when unclear). */
const AGENCY_TO_CREDITOPS: Record<AgencyRoleKey, CreditOpsRoleKey> = {
  agency_owner: "admin",
  agency_admin: "admin",
  agency_manager: "admin",
  agency_team_lead: "full-agent",
  agency_agent: "full-agent",
  /* 0234: the generic operational role. Reach beyond this comes from
     capabilities and assignments, not a rank. */
  agency_user: "full-agent",
};

const AGENCY_TO_FUNDINGOPS: Record<AgencyRoleKey, FundingOpsRoleKey> = {
  agency_owner: "admin",
  agency_admin: "admin",
  agency_manager: "admin",
  agency_team_lead: "full-agent",
  agency_agent: "full-agent",
  /* 0234: the generic operational role. Reach beyond this comes from
     capabilities and assignments, not a rank. */
  agency_user: "full-agent",
};

/* Organization members. A funding-only role has no CreditOps role and vice
   versa: "none" means the surface offers nothing to log. Sales has no
   CreditOps department of its own; onboarding is the hand-off it feeds. QA
   reviews every department's work but edits none of the progress — the
   existing "full-agent" definition is exactly that. */
const ORG_TO_CREDITOPS: Record<OrgRoleKey, CreditOpsRoleKey> = {
  org_admin: "admin",
  org_manager: "admin",
  /* 0234: the generic organization user starts at the narrowest CreditOps
     surface; department reach is granted per member, not per rank. */
  org_user: "dispute",
  credit_processor: "dispute",
  credit_qa: "full-agent",
  credit_support: "support",
  credit_sales: "onboarding",
  credit_complaints: "complaints",
  credit_bureau_caller: "bureau",
  funding_admin: "none",
  funding_manager: "none",
  funding_processor: "none",
  funding_doc_reviewer: "none",
  funding_underwriter: "none",
  funding_sales: "none",
  funding_support: "none",
};

const ORG_TO_FUNDINGOPS: Record<OrgRoleKey, FundingOpsRoleKey> = {
  org_admin: "admin",
  org_manager: "admin",
  /* 0234: reach is granted per member. The processor surface is the
     narrowest full working view. */
  org_user: "full-agent",
  funding_admin: "admin",
  funding_manager: "admin",
  funding_processor: "full-agent",
  funding_doc_reviewer: "documents",
  funding_underwriter: "readiness",
  funding_sales: "offers",
  funding_support: "stipulations",
  credit_processor: "none",
  credit_qa: "none",
  credit_support: "none",
  credit_sales: "none",
  credit_complaints: "none",
  credit_bureau_caller: "none",
};

/** Agency membership wins when both exist: BES staff act for BES. */
export function resolveCreditOpsRole(input: RoleResolutionInput): CreditOpsRoleKey {
  if (input.agencyRole) return AGENCY_TO_CREDITOPS[input.agencyRole];
  if (input.orgRole) return ORG_TO_CREDITOPS[input.orgRole];
  return "none";
}

export function resolveFundingOpsRole(input: RoleResolutionInput): FundingOpsRoleKey {
  if (input.agencyRole) return AGENCY_TO_FUNDINGOPS[input.agencyRole];
  if (input.orgRole) return ORG_TO_FUNDINGOPS[input.orgRole];
  return "none";
}

/**
 * The resolved access for a person in a product — the one answer the
 * providers consume.
 *
 *   BES staff        → BES's own rules for their agency role
 *   organization user → the organization's configured row for (role, product),
 *                       else the platform default
 *   no membership    → nothing
 */
export function resolveOpsAccess(input: RoleResolutionInput & {
  product: OpsProduct;
  /** The organization's configured row for this role/product, if any. */
  configured: RoleAccess | null;
}): RoleAccess {
  if (input.agencyRole) return agencyRoleAccess(input.agencyRole, input.product);
  if (input.orgRole) return input.configured ?? defaultRoleAccess(input.orgRole, input.product);
  return NO_ACCESS;
}
