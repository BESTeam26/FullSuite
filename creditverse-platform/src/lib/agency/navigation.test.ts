import { describe, expect, it } from "vitest";
import {
  AGENCY_ROUTES, accessTo, isAdminRole, managesAgency, routeAllows, routeFor, visibleRoutes,
  type AccessContext, type AgencyRole, type AgencyRouteSpec,
} from "./navigation";

/**
 * The two-role model (0234): ADMIN or USER, plus facts — a capability grant,
 * leading a team. Rank is retired, and these tests hold navigation to the
 * facts rather than to a ladder.
 */
const ctx = (
  role: AgencyRole | null,
  permissions: string[] = [],
  leadsTeam = false,
): AccessContext => ({
  role, can: (p) => permissions.includes(p), leadsTeam,
});
const allow = (c: AccessContext, path: string) => routeAllows(path, c);

const USER = ctx("agency_user");
const LEAD = ctx("agency_user", [], true);
const OPS = ctx("agency_user", ["ops.manage"]);
const ADMIN = ctx("agency_admin");

const STAFF_MENU = [
  "/app", "/app/my-work", "/app/team-workspace", "/app/my-time",
  "/app/eod", "/app/calendar", "/app/announcements", "/app/education", "/app/files",
  /* The Topbar bell links here unconditionally, so this route being openable
     by every staff member is a requirement, not a preference. */
  "/app/notifications",
];

const LEAD_EXTRAS = ["/app/attention", "/app/team-eod"];

const MANAGEMENT = [
  "/app/people", "/app/teams",
  "/app/bes-partners",
];

/* §59: entering an operational module is its own named capability — never
   ops.manage, never a profile, never a rank. */
const MODULES: Record<string, string> = {
  "/app/creditops": "creditops.clients.view",
  "/app/fundingops": "fundingops.files.view",
  "/app/bes-crm": "crm.projects.view",
  "/app/talentops": "talentops.view",
};
const MODULE_PATHS = Object.keys(MODULES);

const ADMIN_ONLY = [
  "/app/subaccounts", "/app/billing", "/app/compliance", "/app/settings", "/app/support",
];

describe("an Agency User with no grants", () => {
  it("sees their own work, their day, and what the company told them", () => {
    const shown = visibleRoutes(USER).map((r) => r.spec.path);
    expect([...shown].sort()).toEqual([...STAFF_MENU].sort());
  });

  it("is not shown any management area or module", () => {
    const shown = visibleRoutes(USER).map((r) => r.spec.path);
    for (const path of [...MANAGEMENT, ...MODULE_PATHS, ...ADMIN_ONLY, ...LEAD_EXTRAS]) {
      expect(shown).not.toContain(path);
    }
  });

  /* THE ONE THAT MATTERS. Hiding a link is not security — the URL must refuse. */
  it("is refused at the door of every hidden route, not merely unshown", () => {
    for (const path of [...MANAGEMENT, ...MODULE_PATHS, ...ADMIN_ONLY, ...LEAD_EXTRAS]) {
      expect(allow(USER, path), path).toBe(false);
    }
  });
});

describe("module access is the module key, never authority (§59)", () => {
  it("a CreditOps agent enters CreditOps — and only CreditOps", () => {
    const agent = ctx("agency_user", ["creditops.clients.view"]);
    expect(allow(agent, "/app/creditops")).toBe(true);
    expect(allow(agent, "/app/bes-crm")).toBe(false);
    expect(allow(agent, "/app/fundingops")).toBe(false);
    expect(allow(agent, "/app/talentops")).toBe(false);
    for (const path of [...MANAGEMENT, ...ADMIN_ONLY]) {
      expect(allow(agent, path), path).toBe(false);
    }
  });

  it("a BES CRM specialist enters BES CRM without any management authority", () => {
    const laz = ctx("agency_user", ["crm.projects.view"]);
    expect(allow(laz, "/app/bes-crm")).toBe(true);
    expect(allow(laz, "/app/creditops")).toBe(false);
  });

  it("ops.manage alone is NOT a doorway into any module", () => {
    for (const path of MODULE_PATHS) expect(allow(OPS, path), path).toBe(false);
  });

  it("each module answers to its own key — a cross-functional agent holds both", () => {
    const both = ctx("agency_user", ["creditops.clients.view", "crm.projects.view"]);
    expect(allow(both, "/app/creditops")).toBe(true);
    expect(allow(both, "/app/bes-crm")).toBe(true);
    expect(allow(both, "/app/fundingops")).toBe(false);
  });
});

describe("leading a team is a fact, not a rank", () => {
  it("opens the team surfaces", () => {
    for (const path of LEAD_EXTRAS) expect(allow(LEAD, path), path).toBe(true);
  });

  it("opens nothing else beyond the staff menu", () => {
    for (const path of [...MANAGEMENT, ...ADMIN_ONLY]) {
      expect(allow(LEAD, path), path).toBe(false);
    }
  });
});

describe("the ops.manage grant — what the manager rank became", () => {
  it("opens the management areas and the team surfaces — modules stay on their own keys", () => {
    for (const path of [...MANAGEMENT, ...LEAD_EXTRAS]) {
      expect(allow(OPS, path), path).toBe(true);
    }
  });

  it("does not open admin-only areas", () => {
    for (const path of ADMIN_ONLY) expect(allow(OPS, path), path).toBe(false);
  });

  it("does not skip an extra named permission on a route", () => {
    // Reports carries reports.view on top of the gate.
    expect(allow(OPS, "/app/reporting")).toBe(false);
    expect(allow(ctx("agency_user", ["ops.manage", "reports.view"]), "/app/reporting")).toBe(true);
  });
});

describe("an Agency Admin", () => {
  it("reaches every ready route that has no extra permission", () => {
    for (const spec of AGENCY_ROUTES) {
      if (spec.readiness !== "ready" || spec.permission) continue;
      expect(allow(ADMIN, spec.path), spec.path).toBe(true);
    }
  });

  it("still needs a named permission where a route carries one", () => {
    const withPermission = AGENCY_ROUTES.filter((s) => s.permission && s.readiness === "ready");
    expect(withPermission.length).toBeGreaterThan(0);
    for (const spec of withPermission) {
      expect(allow(ADMIN, spec.path), spec.path).toBe(false);
      expect(allow(ctx("agency_admin", [spec.permission!]), spec.path), spec.path).toBe(true);
    }
  });
});

describe("unfinished routes", () => {
  /* Synthetic, so the rule is tested rather than whichever example happens to
     be unfinished this release. */
  const unfinished: AgencyRouteSpec = {
    key: "example", label: "Example", path: "/app/example-unfinished",
    readiness: "locked_not_ready", access: "user",
    lockedReason: "Not finished.",
  };

  it("are hidden from users entirely, even ops.manage holders", () => {
    expect(accessTo(unfinished, USER)).toBe("hide");
    expect(accessTo(unfinished, OPS)).toBe("hide");
  });

  it("are shown to an admin as locked, so they know it exists and is unfinished", () => {
    expect(accessTo(unfinished, ADMIN)).toBe("locked");
  });

  it("open for nobody — a page that cannot work does not work for an admin either", () => {
    expect(accessTo(unfinished, ADMIN)).not.toBe("allow");
  });

  it("every locked route in the real table carries a reason", () => {
    for (const spec of AGENCY_ROUTES) {
      if (spec.readiness === "locked_not_ready") {
        expect(spec.lockedReason, spec.key).toBeTruthy();
      }
    }
  });
});

describe("nobody signed in", () => {
  it("is denied everywhere", () => {
    for (const spec of AGENCY_ROUTES) {
      expect(accessTo(spec, ctx(null))).toBe("deny");
    }
  });
});

describe("legacy role values fail toward what they encoded", () => {
  it("an old agency_owner session behaves as an admin", () => {
    expect(isAdminRole("agency_owner")).toBe(true);
    // The route table answers through accessTo, which normalizes.
    expect(allow(ctx("agency_owner" as AgencyRole), "/app/settings")).toBe(true);
  });

  it("old rank values behave as users — never wider", () => {
    for (const legacy of ["agency_manager", "agency_team_lead", "agency_agent"]) {
      expect(isAdminRole(legacy)).toBe(false);
      expect(allow(ctx(legacy as AgencyRole), "/app/settings"), legacy).toBe(false);
    }
  });
});

describe("managesAgency", () => {
  it("is the admin role or the explicit grant — the same rule as is_manager_of in the database", () => {
    expect(managesAgency(ADMIN)).toBe(true);
    expect(managesAgency(OPS)).toBe(true);
    expect(managesAgency(USER)).toBe(false);
    expect(managesAgency(LEAD)).toBe(false);
  });
});

describe("the route table itself", () => {
  it("registers every path exactly once", () => {
    const paths = AGENCY_ROUTES.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("routeFor finds a spec the same way routeAllows does", () => {
    expect(routeFor("/app/settings")?.access).toBe("admin");
    expect(routeFor("/not-an-agency-route")).toBeUndefined();
    // A path outside the table is not governed here.
    expect(routeAllows("/not-an-agency-route", USER)).toBe(true);
  });
});
