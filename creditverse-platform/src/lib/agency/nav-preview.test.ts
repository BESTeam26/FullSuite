import { describe, expect, it } from "vitest";
import { visibleRoutes, type AccessContext } from "@/lib/agency/navigation";

/**
 * What each preset's WORKSPACE contains — Dee's §25–§27: "The normal employee
 * should never see Dee's full menu and simply hit Access Denied everywhere."
 *
 * These assert the shape of the menu, not a snapshot of its exact contents: a
 * new personal route (another everyone-route) should not fail them, while a
 * module or a management area leaking into an agent's workspace must.
 */
const ctx = (permissions: string[], leadsTeam = false): AccessContext => ({
  role: "agency_user", can: (p) => permissions.includes(p), leadsTeam,
});
const labels = (c: AccessContext) => visibleRoutes(c).map((r) => r.spec.label);

const MODULES = ["CreditOps", "FundingOps", "BES CRM", "TalentOps"];
/* No "HR & People": it dissolved into People when the hub was built, and
   naming a route that no longer exists is how a test starts asserting the
   past. */
const MANAGEMENT = ["People", "Teams", "Reports", "BES Partners"];
const ADMIN_ONLY = ["Finance", "Agency Settings", "Organizations", "Organization billing", "Compliance & Legal"];
const PERSONAL = ["Home", "My Work", "My Time", "End of Day", "Notifications"];

describe("an Agent with no module", () => {
  const menu = labels(ctx([]));

  it("gets a working personal workspace", () => {
    for (const item of PERSONAL) expect(menu).toContain(item);
  });

  it("sees no module, no management area and nothing administrative", () => {
    for (const item of [...MODULES, ...MANAGEMENT, ...ADMIN_ONLY]) {
      expect(menu, item).not.toContain(item);
    }
  });
});

describe("an Agent granted one module", () => {
  const menu = labels(ctx(["creditops.clients.view", "partners.view"]));

  it("gets that module", () => expect(menu).toContain("CreditOps"));

  it("and no other module, and still no management", () => {
    for (const item of ["FundingOps", "BES CRM", "TalentOps", ...MANAGEMENT, ...ADMIN_ONLY]) {
      expect(menu, item).not.toContain(item);
    }
  });
});

describe("a Team Lead who actually leads a team", () => {
  const menu = labels(ctx(["creditops.clients.view", "partners.view", "reports.view"], true));

  it("gets the team surfaces the fact earns", () => {
    expect(menu).toContain("Attention Center");
    expect(menu).toContain("Team EOD");
  });

  it("but no agency-wide administration", () => {
    for (const item of ["People", "Teams", ...ADMIN_ONLY]) expect(menu, item).not.toContain(item);
  });

  /* The profile is a permission preset; leading a team is a FACT. Without the
     fact there is no team scope, and the menu must say so by omission. */
  it("without the fact, the team surfaces are not there", () => {
    const noTeam = labels(ctx(["creditops.clients.view", "partners.view", "reports.view"], false));
    expect(noTeam).not.toContain("Team EOD");
    expect(noTeam).not.toContain("Attention Center");
  });
});

describe("a Manager", () => {
  const menu = labels(ctx(["ops.manage", "team.manage", "reports.view", "partners.view", "crm.projects.view"]));

  it("runs their scope", () => {
    for (const item of ["People", "Teams", "Reports", "BES Partners", "BES CRM"]) {
      expect(menu, item).toContain(item);
    }
  });

  it("with no money and no settings, and no module they were not granted", () => {
    for (const item of [...ADMIN_ONLY, "CreditOps", "FundingOps", "TalentOps"]) {
      expect(menu, item).not.toContain(item);
    }
  });
});

describe("an Agency Admin", () => {
  const menu = labels({ role: "agency_admin", can: () => true, leadsTeam: false });

  it("reaches the whole platform", () => {
    for (const item of [...PERSONAL, ...MODULES, ...MANAGEMENT, ...ADMIN_ONLY]) {
      expect(menu, item).toContain(item);
    }
  });
});
