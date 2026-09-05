import { describe, expect, it } from "vitest";
import { effectivePermission, type MemberPermission, type RolePermission } from "./team-permissions";

const ORG = "org-1";
const rolePerms: RolePermission[] = [
  { organizationId: null, role: "credit_processor", key: "creditops.letters.build", allowed: true },
  { organizationId: null, role: "credit_processor", key: "creditops.letters.approve", allowed: false },
  { organizationId: ORG, role: "credit_processor", key: "creditops.letters.approve", allowed: true },
];
const override = (key: string, allowed: boolean): MemberPermission => ({ membershipId: "m1", key, allowed, setAt: "2026-09-05T00:00:00Z", reason: null });

describe("effectivePermission (mirrors member_can)", () => {
  it("admins and managers are always allowed, by role", () => {
    expect(effectivePermission("billing.manage", "org_admin", ORG, rolePerms, [])).toEqual({ allowed: true, source: "admin" });
    expect(effectivePermission("billing.manage", "org_manager", ORG, rolePerms, [])).toEqual({ allowed: true, source: "admin" });
  });
  it("a member override beats the organization's role row, which beats the platform default", () => {
    expect(effectivePermission("creditops.letters.approve", "credit_processor", ORG, rolePerms, [override("creditops.letters.approve", false)])).toEqual({ allowed: false, source: "override" });
    expect(effectivePermission("creditops.letters.approve", "credit_processor", ORG, rolePerms, [])).toEqual({ allowed: true, source: "organization" });
    expect(effectivePermission("creditops.letters.approve", "credit_processor", "other-org", rolePerms, [])).toEqual({ allowed: false, source: "default" });
    expect(effectivePermission("creditops.letters.build", "credit_processor", ORG, rolePerms, [])).toEqual({ allowed: true, source: "default" });
  });
  it("an unknown key or role with no row anywhere is denied", () => {
    expect(effectivePermission("nonsense.key", "credit_processor", ORG, rolePerms, [])).toEqual({ allowed: false, source: "deny" });
    expect(effectivePermission("creditops.letters.build", "funding_sales", ORG, rolePerms, [])).toEqual({ allowed: false, source: "deny" });
  });
});
