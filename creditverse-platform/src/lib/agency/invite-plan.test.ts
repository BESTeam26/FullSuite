import { describe, expect, it } from "vitest";
import { invitePlan } from "@/lib/agency/invite-plan";

const plan = (over: Partial<Parameters<typeof invitePlan>[0]> = {}) =>
  invitePlan({ responsibility: "agent", service: "creditops", departmentName: "Complaints & Mailing", teamName: "Complaints & Mailing Team", ...over });

describe("what an invitation will produce", () => {
  it("an agent gets their division's module door and their department's queue", () => {
    const p = plan();
    expect(p.role).toBe("agency_user");
    expect(p.profile).toBe("agent");
    expect(p.seat).toBeNull();
    expect(p.moduleKeys).toContain("creditops.clients.view");
    expect(p.includes[0]).toBe("Complaints & Mailing queue");
    expect(p.excludes).toContain("Other departments' queues");
  });

  it("a team lead leads the team, and that is a fact of the team, not a seat", () => {
    const p = plan({ responsibility: "team_lead" });
    expect(p.leadsTeam).toBe(true);
    expect(p.seat).toBeNull();
    expect(p.profile).toBe("team_lead");
  });

  it("a department manager is placed by seat, not by team membership", () => {
    const p = plan({ responsibility: "department_manager" });
    expect(p.seat).toBe("department_manager");
    expect(p.leadsTeam).toBe(false);
    expect(p.includes[0]).toBe("The whole Complaints & Mailing department");
  });

  it("a division manager reaches the division without a partner assignment", () => {
    const p = plan({ responsibility: "division_manager" });
    expect(p.seat).toBe("division_manager");
    expect(p.includes[0]).toBe("The whole CreditOps division");
    expect(p.excludes).toContain("Other divisions");
  });

  it("chief operations reaches every division and still no money", () => {
    const p = plan({ responsibility: "chief_operations" });
    expect(p.seat).toBe("chief_operations");
    expect(p.includes[0]).toBe("Every service division's operations");
    expect(p.excludes).toContain("Payroll and compensation");
    expect(p.excludes).toContain("Company finance");
  });

  it("NO responsibility grants payroll, compensation or finance — including admin", () => {
    for (const r of ["agent", "team_lead", "department_manager", "division_manager", "chief_operations", "agency_admin"] as const) {
      const p = plan({ responsibility: r });
      expect(p.excludes, r).toContain("Payroll and compensation");
      expect(p.excludes, r).toContain("Company finance");
      expect(p.moduleKeys.some((k) => k.startsWith("payroll") || k.startsWith("compensation") || k.startsWith("finance")), r).toBe(false);
    }
  });

  it("an administrator is let in by role, so no module key is attached", () => {
    const p = plan({ responsibility: "agency_admin" });
    expect(p.role).toBe("agency_admin");
    expect(p.profile).toBeNull();
    expect(p.moduleKeys).toEqual([]);
  });

  it("says plainly when no module door is chosen yet", () => {
    expect(plan({ service: null }).excludes).toContain("Any operational module until one is granted");
  });
});
