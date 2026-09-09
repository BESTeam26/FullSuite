/**
 * Role access — the Permission layer as data.
 *
 *   Product Entitlement → Organization Settings → Role/Permission → Team/Department → Assignment → User
 *
 * A `RoleAccess` says what a role may do inside ONE product of ONE
 * organization: which departments it works, which workspace views it sees,
 * whether it logs work or only reads, edits progress, or opens the management
 * layer. The organization owner/admin configures it (rows in
 * `organization_role_access`, written through the audited database function);
 * when nothing is configured, these platform defaults apply. They MUST agree
 * with `default_role_access()` in migration 0047 — the matrix checks a sample.
 *
 * None of this is the security boundary: Row Level Security decides which rows
 * exist for the person; role access only narrows what the interface offers on
 * them (rule 1, rule 3). A job title never appears here — roles are the
 * `org_role` / `agency_role` enums (rule 4).
 */
import type { Enums } from "@/lib/supabase/database.types";

export type OpsProduct = "creditOps" | "fundingOps";
export type OrgRoleKey = Enums<"org_role">;
export type AgencyRoleKey = Enums<"agency_role">;

export interface RoleAccess {
  /** Department keys (production_departments) the role may work or read. */
  departments: string[];
  /** Workspace view ids the role sees; empty = every view the organization shows. */
  views: string[];
  /** False = read access to the listed departments, no logging. */
  canLogWork: boolean;
  canEditProgress: boolean;
  canAccessManagement: boolean;
}

export const NO_ACCESS: RoleAccess = {
  departments: [],
  views: [],
  canLogWork: false,
  canEditProgress: false,
  canAccessManagement: false,
};

export const CREDITOPS_DEPARTMENTS = ["Onboarding", "Dispute", "Support", "Complaints", "Bureau Calling"] as const;
export const FUNDINGOPS_DEPARTMENTS = [
  "Readiness Review", "Document Review", "Lender Matching", "Submissions", "Stipulations", "Offers", "Funded Deals",
] as const;

export const departmentsFor = (product: OpsProduct): readonly string[] =>
  product === "creditOps" ? CREDITOPS_DEPARTMENTS : FUNDINGOPS_DEPARTMENTS;

/** Roles an organization may configure per product (admins/managers are always full). */
export const CONFIGURABLE_ROLES: Record<OpsProduct, OrgRoleKey[]> = {
  creditOps: ["credit_processor", "credit_qa", "credit_support", "credit_sales", "credit_complaints", "credit_bureau_caller"],
  fundingOps: ["funding_admin", "funding_manager", "funding_processor", "funding_doc_reviewer", "funding_underwriter", "funding_sales", "funding_support"],
};

export const ORG_ROLE_LABELS: Record<OrgRoleKey, string> = {
  org_admin: "Organization Admin",
  org_manager: "Organization Manager",
  org_user: "Organization User",
  credit_processor: "Credit Processor",
  credit_qa: "Credit QA",
  credit_support: "Credit Support",
  credit_sales: "Credit Sales",
  credit_complaints: "Complaints & Mailing",
  credit_bureau_caller: "Bureau Caller",
  funding_admin: "Funding Admin",
  funding_manager: "Funding Manager",
  funding_processor: "Funding Processor",
  funding_doc_reviewer: "Document Reviewer",
  funding_underwriter: "Underwriter",
  funding_sales: "Funding Sales",
  funding_support: "Funding Support",
};

const full = (product: OpsProduct, management: boolean): RoleAccess => ({
  departments: [...departmentsFor(product)],
  views: [],
  canLogWork: true,
  canEditProgress: management,
  canAccessManagement: management,
});

const only = (departments: string[], canLogWork = true): RoleAccess => ({
  departments,
  views: [],
  canLogWork,
  canEditProgress: false,
  canAccessManagement: false,
});

/** Platform default for an organization role in a product. Mirrors SQL `default_role_access`. */
export function defaultRoleAccess(role: OrgRoleKey, product: OpsProduct): RoleAccess {
  if (role === "org_admin" || role === "org_manager") return full(product, true);
  if (product === "creditOps") {
    switch (role) {
      case "credit_processor": return only(["Dispute"]);
      case "credit_qa": return only([...CREDITOPS_DEPARTMENTS], false); // reads every department, logs nothing
      case "credit_support": return only(["Support"]);
      case "credit_sales": return only(["Onboarding"]);
      case "credit_complaints": return only(["Complaints"]);
      case "credit_bureau_caller": return only(["Bureau Calling"]);
      default: return NO_ACCESS;
    }
  }
  switch (role) {
    case "funding_admin":
    case "funding_manager": return full("fundingOps", true);
    case "funding_processor": return full("fundingOps", false);
    case "funding_doc_reviewer": return only(["Document Review"]);
    case "funding_underwriter": return only(["Readiness Review", "Lender Matching"]);
    case "funding_sales": return only(["Offers", "Funded Deals"]);
    case "funding_support": return only(["Stipulations"]);
    default: return NO_ACCESS;
  }
}

/** BES staff operate under BES's own rules, not an organization's configuration. */
export function agencyRoleAccess(role: AgencyRoleKey, product: OpsProduct): RoleAccess {
  /* 0234: management is the admin role. (The retired manager rank arrives
     only from historical rows; its holders were migrated to agency_user with
     the ops.manage capability, which this presentation layer does not need to
     re-resolve — the database decides every actual grant.) */
  const management = role === "agency_owner" || role === "agency_admin" || role === "agency_manager";
  return full(product, management);
}
