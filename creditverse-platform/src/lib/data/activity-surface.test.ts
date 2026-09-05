import { describe, expect, it } from "vitest";
import { allowedVisibilities, defaultVisibility, mayPostAs } from "./activity";

describe("comment visibility by surface", () => {
  it("agency surface: BES writes BES-internal first; organization writes its own team first", () => {
    expect(allowedVisibilities("bes", true, "agency")).toEqual(["bes_internal", "shared_with_partner", "client_visible"]);
    expect(defaultVisibility("bes", true, "agency")).toBe("bes_internal");
    expect(allowedVisibilities("organization", false, "agency")).toEqual(["organization_internal", "client_visible"]);
  });

  it("organization surface: never a BES-internal voice", () => {
    expect(allowedVisibilities("bes", true, "organization")).toEqual(["shared_with_partner", "client_visible"]);
    expect(allowedVisibilities("bes", false, "organization")).toEqual(["client_visible"]);
    expect(mayPostAs("bes", true, "bes_internal", "organization")).toBe(false);
  });

  it("organization surface with BES fulfilment: shared by default — one record, both sides see it", () => {
    expect(defaultVisibility("organization", true, "organization")).toBe("shared_with_partner");
    expect(defaultVisibility("organization", false, "organization")).toBe("organization_internal");
    expect(defaultVisibility("bes", true, "organization")).toBe("shared_with_partner");
  });

  it("client-visible is never a default", () => {
    for (const a of ["bes", "organization"] as const) for (const e of [true, false]) for (const s of ["agency", "organization"] as const) {
      const d = defaultVisibility(a, e, s);
      if (allowedVisibilities(a, e, s).length > 1) expect(d).not.toBe("client_visible");
    }
  });
});
