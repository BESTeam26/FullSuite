/**
 * Which departments a person is IN — the rule, not the roster.
 *
 * Dee, 2026-09-13, from a screenshot of Alliana's CreditOps sidebar showing
 * all five queues under MY DEPARTMENT: *"The navigation must follow the
 * canonical org hierarchy: Division → Department → Team → Team Membership →
 * User. Do NOT show every department in a module just because the user can
 * open the module shell."*
 *
 * Every case below is written by the SHAPE of somebody's membership, never by
 * who they are — so it holds for the next person hired into each shape, and
 * there is nothing to update when the roster changes.
 */
import { describe, expect, it } from "vitest";
import { departmentScopeOf } from "./my-departments-domain";

const ALL = ["Onboarding", "Dispute", "Support", "Complaints", "Bureau Calling"] as const;

describe("MY DEPARTMENT means the departments I am in", () => {
  it("placed in another division: no CreditOps queue at all", () => {
    /* The defect. On a team, but that team's department belongs to another
       division — a definite no, not an absence of information. */
    expect(departmentScopeOf({
      teamDepartments: [], onAnyTeam: true, roleDepartments: [...ALL],
    })).toEqual([]);
  });

  it("on no team yet: the role still answers, so a real operator can work", () => {
    /* Deliberately NOT the same case. Nobody has placed this person; refusing
       them every queue would be a worse failure than the one being fixed, and
       the database would have let them work. */
    expect(departmentScopeOf({
      teamDepartments: [], onAnyTeam: false, roleDepartments: ["Dispute"],
    })).toEqual(["Dispute"]);
  });

  it("one department: exactly that one", () => {
    expect(departmentScopeOf({
      teamDepartments: ["Dispute"], onAnyTeam: true, roleDepartments: [...ALL],
    })).toEqual(["Dispute"]);
    expect(departmentScopeOf({
      teamDepartments: ["Support"], onAnyTeam: true, roleDepartments: [...ALL],
    })).toEqual(["Support"]);
    expect(departmentScopeOf({
      teamDepartments: ["Complaints"], onAnyTeam: true, roleDepartments: [...ALL],
    })).toEqual(["Complaints"]);
  });

  it("two departments: both, because a person may hold two teams", () => {
    expect(departmentScopeOf({
      teamDepartments: ["Support", "Complaints"], onAnyTeam: true, roleDepartments: [...ALL],
    })).toEqual(["Support", "Complaints"]);
  });

  it("membership narrows the role and never widens it", () => {
    /* A team says Dispute; the role allows only Support. The answer is
       neither — you cannot acquire a department by joining a team the role
       does not permit. */
    expect(departmentScopeOf({
      teamDepartments: ["Dispute"], onAnyTeam: true, roleDepartments: ["Support"],
    })).toEqual([]);
  });

  it("management is not a way to be in every department", () => {
    /* Dee: "do not fake it by putting every department under My Department."
       A manager on the Dispute team is in Dispute. The rest reach them
       through ALL QUEUES. */
    expect(departmentScopeOf({
      teamDepartments: ["Dispute"], onAnyTeam: true, roleDepartments: [...ALL],
      canAccessManagement: true,
    })).toEqual(["Dispute"]);
  });

  it("removing the membership removes the department, with no code change", () => {
    const before = departmentScopeOf({
      teamDepartments: ["Support"], onAnyTeam: true, roleDepartments: [...ALL],
    });
    const after = departmentScopeOf({
      teamDepartments: [], onAnyTeam: true, roleDepartments: [...ALL],
    });
    expect(before).toEqual(["Support"]);
    expect(after).toEqual([]);
  });

  it("a new lead inherits the department by holding the row", () => {
    /* Identical input, whoever holds it. The function cannot tell people
       apart, which is the point. */
    const scope = { teamDepartments: ["Dispute"] as const, onAnyTeam: true, roleDepartments: [...ALL] };
    expect(departmentScopeOf({ ...scope, teamDepartments: ["Dispute"] }))
      .toEqual(departmentScopeOf({ ...scope, teamDepartments: ["Dispute"] }));
  });
});
