import { describe, expect, it } from "vitest";
import {
  AGENCY_ROUTES, accessTo, atLeast, routeAllows, routeFor, visibleRoutes,
  type AccessContext, type AgencyRole,
} from "./navigation";

const ctx = (role: AgencyRole | null, permissions: string[] = []): AccessContext => ({
  role, can: (p) => permissions.includes(p),
});
const allow = (role: AgencyRole | null, path: string, perms: string[] = []) =>
  routeAllows(path, ctx(role, perms));

const STAFF_MENU = [
  "/app", "/app/my-work", "/app/team-workspace", "/app/my-time",
  "/app/eod", "/app/calendar", "/app/announcements", "/app/education", "/app/files",
];

const MANAGEMENT = [
  "/app/subaccounts", "/app/billing", "/app/compliance", "/app/settings",
  "/app/support", "/app/people", "/app/teams", "/app/workforce",
  "/app/creditops", "/app/fundingops", "/app/bes-crm", "/app/talentops",
  "/app/bes-partners", "/app/reporting",
];

describe("a regular staff member", () => {
  it("sees their own work, their day, and what the company told them", () => {
    const shown = visibleRoutes(ctx("agency_agent")).map((r) => r.spec.path);
    expect([...shown].sort()).toEqual([...STAFF_MENU].sort());
  });

  it("is not shown any management area", () => {
    const shown = visibleRoutes(ctx("agency_agent")).map((r) => r.spec.path);
    for (const path of MANAGEMENT) expect(shown).not.toContain(path);
  });

  /* THE ONE THAT MATTERS. Hiding a link is not security — the URL still
     exists, and a person who types it must be refused. */
  it("is REFUSED every management route it types directly", () => {
    for (const path of MANAGEMENT) {
      expect(allow("agency_agent", path)).toBe(false);
    }
  });

  it("can open everything in its own menu", () => {
    for (const path of STAFF_MENU) expect(allow("agency_agent", path)).toBe(true);
  });
});

describe("a team lead", () => {
  it("adds the team's exceptions and the team's EOD, and nothing else", () => {
    const lead = visibleRoutes(ctx("agency_team_lead")).map((r) => r.spec.path);
    const agent = visibleRoutes(ctx("agency_agent")).map((r) => r.spec.path);
    expect([...lead.filter((p) => !agent.includes(p))].sort()).toEqual(["/app/attention", "/app/team-eod"]);
  });

  it("still cannot reach People, Billing or Settings", () => {
    for (const path of ["/app/people", "/app/billing", "/app/settings"]) {
      expect(allow("agency_team_lead", path)).toBe(false);
    }
  });
});

describe("a manager", () => {
  it("manages people and operations", () => {
    for (const path of ["/app/people", "/app/teams", "/app/workforce", "/app/creditops", "/app/bes-partners"]) {
      expect(allow("agency_manager", path)).toBe(true);
    }
  });

  /* A manager is not an admin. Being senior does not hand over the books. */
  it("does NOT get Billing, Compliance, Settings or Organizations", () => {
    for (const path of ["/app/billing", "/app/compliance", "/app/settings", "/app/subaccounts"]) {
      expect(allow("agency_manager", path)).toBe(false);
    }
  });

  it("needs the named permission as well as the role, where one is set", () => {
    expect(allow("agency_manager", "/app/reporting")).toBe(false);
    expect(allow("agency_manager", "/app/reporting", ["reports.view"])).toBe(true);
  });
});

describe("admins and the owner", () => {
  it("an admin reaches every ready route", () => {
    for (const spec of AGENCY_ROUTES.filter((r) => r.readiness === "ready" && !r.permission)) {
      expect(allow("agency_admin", spec.path)).toBe(true);
    }
  });

  it("the owner reaches every ready route too", () => {
    for (const spec of AGENCY_ROUTES.filter((r) => r.readiness === "ready" && !r.permission)) {
      expect(allow("agency_owner", spec.path)).toBe(true);
    }
  });
});

describe("things that are not ready", () => {
  it("are hidden from staff entirely", () => {
    expect(accessTo(routeFor("/app/notifications")!, ctx("agency_agent"))).toBe("hide");
    expect(accessTo(routeFor("/app/notifications")!, ctx("agency_manager"))).toBe("hide");
  });

  it("are shown to an admin as locked, so they know it exists and is unfinished", () => {
    expect(accessTo(routeFor("/app/notifications")!, ctx("agency_admin"))).toBe("locked");
    expect(routeFor("/app/notifications")!.lockedReason).toBeTruthy();
  });

  /* Locked means locked. A page that cannot work does not work for the owner
     either, so the door stays shut for everybody. */
  it("do not open for anyone, including the owner", () => {
    for (const role of ["agency_agent", "agency_team_lead", "agency_manager", "agency_admin", "agency_owner"] as AgencyRole[]) {
      expect(allow(role, "/app/notifications")).toBe(false);
    }
  });
});

describe("the menu and the door cannot disagree", () => {
  it("every path a role is shown is a path that role may open", () => {
    for (const role of ["agency_agent", "agency_team_lead", "agency_manager", "agency_admin", "agency_owner"] as AgencyRole[]) {
      for (const { spec, access } of visibleRoutes(ctx(role, ["reports.view"]))) {
        if (access === "allow") {
          expect(routeAllows(spec.path, ctx(role, ["reports.view"]))).toBe(true);
        } else {
          /* Shown as locked, and therefore NOT openable. */
          expect(routeAllows(spec.path, ctx(role, ["reports.view"]))).toBe(false);
        }
      }
    }
  });

  it("refuses everything when there is no agency role at all", () => {
    for (const spec of AGENCY_ROUTES) expect(allow(null, spec.path)).toBe(false);
    expect(visibleRoutes(ctx(null))).toEqual([]);
  });

  it("does not govern paths it does not define", () => {
    /* An organization route is not this module's to allow or refuse. */
    expect(allow("agency_agent", "/app/some-organization-page")).toBe(true);
    expect(routeFor("/app/some-organization-page")).toBeUndefined();
  });

  it("has no duplicate paths or keys", () => {
    expect(new Set(AGENCY_ROUTES.map((r) => r.path)).size).toBe(AGENCY_ROUTES.length);
    expect(new Set(AGENCY_ROUTES.map((r) => r.key)).size).toBe(AGENCY_ROUTES.length);
  });
});

describe("role ordering", () => {
  it("ranks the way the org chart does", () => {
    expect(atLeast("agency_owner", "agency_admin")).toBe(true);
    expect(atLeast("agency_manager", "agency_admin")).toBe(false);
    expect(atLeast("agency_agent", "agency_agent")).toBe(true);
    expect(atLeast(null, "agency_agent")).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * The exhaustive pass.
 *
 * Every test above names its routes in a hand-written list, which is how a
 * list goes stale: a route added later appears in neither STAFF_MENU nor
 * MANAGEMENT and is silently untested. (That is not hypothetical — a
 * hand-written list of nine credit statuses omitted the four the database had
 * just gained, and no screen could move a client out of Onboarding.)
 *
 * These walk AGENCY_ROUTES × every role, so a new route is covered the
 * moment it is added and a new role the moment it exists.
 * ------------------------------------------------------------------ */
const ROLES: (AgencyRole | null)[] = [
  null, "agency_agent", "agency_team_lead", "agency_manager", "agency_admin", "agency_owner",
];
/* Permission-gated routes need the permission granted to prove the ROLE rule;
   granting everything isolates rank from capability. */
const ALL_PERMISSIONS = AGENCY_ROUTES.map((r) => r.permission).filter((p): p is string => !!p);

describe("the menu and the door can never disagree", () => {
  it("opens every route it shows, except the ones it marks as not ready", () => {
    for (const role of ROLES) {
      const c = ctx(role, ALL_PERMISSIONS);
      for (const { spec, access } of visibleRoutes(c)) {
        expect(routeAllows(spec.path, c), `${role} · ${spec.path} (${access})`)
          .toBe(access === "allow");
      }
    }
  });

  it("refuses every route it does not show", () => {
    for (const role of ROLES) {
      const c = ctx(role, ALL_PERMISSIONS);
      const shown = new Set(visibleRoutes(c).map((r) => r.spec.path));
      for (const spec of AGENCY_ROUTES) {
        if (shown.has(spec.path)) continue;
        expect(routeAllows(spec.path, c), `${role} · ${spec.path}`).toBe(false);
      }
    }
  });

  it("never opens an unfinished page, not even for the owner", () => {
    for (const spec of AGENCY_ROUTES.filter((r) => r.readiness === "locked_not_ready")) {
      for (const role of ROLES) {
        expect(routeAllows(spec.path, ctx(role, ALL_PERMISSIONS)), `${role} · ${spec.path}`).toBe(false);
      }
    }
  });

  it("gives a signed-out person nothing at all", () => {
    expect(visibleRoutes(ctx(null, ALL_PERMISSIONS))).toEqual([]);
    for (const spec of AGENCY_ROUTES) expect(routeAllows(spec.path, ctx(null, ALL_PERMISSIONS))).toBe(false);
  });

  it("is monotonic in rank: a higher role never loses a route a lower one has", () => {
    const ladder: AgencyRole[] = [
      "agency_agent", "agency_team_lead", "agency_manager", "agency_admin", "agency_owner",
    ];
    for (let i = 1; i < ladder.length; i += 1) {
      const lower = new Set(
        visibleRoutes(ctx(ladder[i - 1], ALL_PERMISSIONS))
          .filter((r) => r.access === "allow").map((r) => r.spec.path),
      );
      const higher = new Set(
        visibleRoutes(ctx(ladder[i], ALL_PERMISSIONS))
          .filter((r) => r.access === "allow").map((r) => r.spec.path),
      );
      for (const path of lower) {
        expect(higher.has(path), `${ladder[i]} lost ${path} that ${ladder[i - 1]} has`).toBe(true);
      }
    }
  });

  it("withholds a permission-gated route from somebody who holds no permissions", () => {
    /* Rank alone must not be enough where a permission is required — the
       Role + Permission half of rule 3. */
    const gated = AGENCY_ROUTES.filter((r) => r.permission && r.readiness !== "locked_not_ready");
    expect(gated.length).toBeGreaterThan(0);
    for (const spec of gated) {
      expect(routeAllows(spec.path, ctx("agency_owner", [])), spec.path).toBe(false);
      expect(routeAllows(spec.path, ctx("agency_owner", [spec.permission!])), spec.path).toBe(true);
    }
  });

  it("every route in the table is reachable by SOMEBODY, or is marked not ready", () => {
    /* A route no role can ever open is dead code wearing a menu entry. */
    for (const spec of AGENCY_ROUTES) {
      if (spec.readiness === "locked_not_ready") continue;
      const reachable = ROLES.some((role) => routeAllows(spec.path, ctx(role, ALL_PERMISSIONS)));
      expect(reachable, `nobody can open ${spec.path}`).toBe(true);
    }
  });
});
