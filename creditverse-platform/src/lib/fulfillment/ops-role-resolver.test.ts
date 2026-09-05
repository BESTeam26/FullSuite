import { describe, expect, it } from "vitest";
import { resolveCreditOpsRole, resolveFundingOpsRole } from "./ops-role-resolver";

describe("ops role resolver", () => {
  it("denies by default: no membership means nothing to log", () => {
    expect(resolveCreditOpsRole({ agencyRole: null, orgRole: null })).toBe("none");
    expect(resolveFundingOpsRole({ agencyRole: null, orgRole: null })).toBe("none");
  });

  it("organization admins and managers run both divisions", () => {
    for (const orgRole of ["org_admin", "org_manager"] as const) {
      expect(resolveCreditOpsRole({ agencyRole: null, orgRole })).toBe("admin");
      expect(resolveFundingOpsRole({ agencyRole: null, orgRole })).toBe("admin");
    }
  });

  it("a department role lands in its own department and nowhere else", () => {
    expect(resolveCreditOpsRole({ agencyRole: null, orgRole: "credit_processor" })).toBe("dispute");
    expect(resolveCreditOpsRole({ agencyRole: null, orgRole: "credit_bureau_caller" })).toBe("bureau");
    expect(resolveFundingOpsRole({ agencyRole: null, orgRole: "credit_processor" })).toBe("none");
    expect(resolveFundingOpsRole({ agencyRole: null, orgRole: "funding_doc_reviewer" })).toBe("documents");
    expect(resolveCreditOpsRole({ agencyRole: null, orgRole: "funding_doc_reviewer" })).toBe("none");
  });

  it("BES agents work files without the Management layer; agency membership wins", () => {
    expect(resolveCreditOpsRole({ agencyRole: "agency_agent", orgRole: "org_admin" })).toBe("full-agent");
    expect(resolveCreditOpsRole({ agencyRole: "agency_team_lead", orgRole: null })).toBe("full-agent");
    expect(resolveFundingOpsRole({ agencyRole: "agency_manager", orgRole: null })).toBe("admin");
  });
});

import { resolveOpsAccess } from "./ops-role-resolver";
import { defaultRoleAccess } from "./role-access-defaults";

describe("resolved access (configurable layer)", () => {
  it("uses the organization's configured row over the default", () => {
    const configured = { departments: ["Support"], views: ["dashboard", "support-queue"], canLogWork: true, canEditProgress: false, canAccessManagement: false };
    expect(resolveOpsAccess({ agencyRole: null, orgRole: "credit_processor", product: "creditOps", configured })).toEqual(configured);
    expect(resolveOpsAccess({ agencyRole: null, orgRole: "credit_processor", product: "creditOps", configured: null }).departments).toEqual(["Dispute"]);
  });

  it("defaults mirror the database: QA reads, processor disputes, admin full", () => {
    expect(defaultRoleAccess("credit_qa", "creditOps").canLogWork).toBe(false);
    expect(defaultRoleAccess("credit_qa", "creditOps").departments).toHaveLength(5);
    expect(defaultRoleAccess("org_admin", "creditOps").canAccessManagement).toBe(true);
    expect(defaultRoleAccess("funding_underwriter", "fundingOps").departments).toEqual(["Readiness Review", "Lender Matching"]);
    expect(defaultRoleAccess("funding_processor", "creditOps").departments).toEqual([]);
  });

  it("BES staff are never shaped by an organization's configuration", () => {
    const configured = { departments: [], views: [], canLogWork: false, canEditProgress: false, canAccessManagement: false };
    expect(resolveOpsAccess({ agencyRole: "agency_agent", orgRole: "credit_qa", product: "creditOps", configured }).canLogWork).toBe(true);
    expect(resolveOpsAccess({ agencyRole: null, orgRole: null, product: "fundingOps", configured: null }).departments).toEqual([]);
  });
});
