import { describe, expect, it } from "vitest";
import { legacySettingsRedirect } from "./Settings";

/* Dee §58: retired Settings sections redirect to where the capability now
   lives — never a blank page, never a second editor. */
describe("retired Settings sections", () => {
  it("send person management to Team Members", () => {
    expect(legacySettingsRedirect("users")).toBe("/app/people");
  });
  it("send structure, positions and the org chart to Teams", () => {
    expect(legacySettingsRedirect("structure")).toBe("/app/teams");
    expect(legacySettingsRedirect("positions")).toBe("/app/teams?tab=positions");
    expect(legacySettingsRedirect("org-chart")).toBe("/app/teams?tab=org-chart");
  });
  it("leave every live section alone — Roles & Permissions and Organization Teams stay in Settings", () => {
    for (const live of ["permissions", "org-teams", "branding", "account", null]) {
      expect(legacySettingsRedirect(live)).toBeNull();
    }
  });
});
