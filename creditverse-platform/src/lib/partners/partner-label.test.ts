import { describe, expect, it } from "vitest";
import { partnerLabel, partnerNameParts } from "./partner-label";

describe("how a Partner is written", () => {
  it("puts the business first and the person second", () => {
    /* Dee's own examples, 2026-09-13. The company leads because it is the
       canonical Partner and the sort key. */
    expect(partnerLabel({ business: "Prime Capital Group", contact: "Parker Cathcart" }))
      .toBe("Prime Capital Group · Parker Cathcart");
    expect(partnerLabel({ business: "BizHub Financial", contact: "Jesse Roldan" }))
      .toBe("BizHub Financial · Jesse Roldan");
    expect(partnerLabel({ business: "It'sNetworkTime", contact: "Jesse Roldan" }))
      .toBe("It'sNetworkTime · Jesse Roldan");
  });

  it("keeps one person's several businesses apart and alphabetical", () => {
    /* The reason the company leads: sorting on a person-first label would file
       BizHub next to It'sNetworkTime under J, and neither under its own name. */
    const rows = [
      { business: "It'sNetworkTime", contact: "Jesse Roldan" },
      { business: "BizHub Financial", contact: "Jesse Roldan" },
    ].map(partnerLabel).sort();
    expect(rows).toEqual([
      "BizHub Financial · Jesse Roldan",
      "It'sNetworkTime · Jesse Roldan",
    ]);
  });

  it("says the company alone when nobody is recorded yet", () => {
    expect(partnerLabel({ business: "Jensen", contact: null })).toBe("Jensen");
    expect(partnerLabel({ business: "Jensen", contact: "   " })).toBe("Jensen");
    expect(partnerLabel({ business: "Jensen" })).toBe("Jensen");
  });

  it("does not repeat a name that is already the company", () => {
    /* Most imported partners carry the company in the legacy contact field,
       so without this every one of them would read "Jensen · Jensen". */
    expect(partnerLabel({ business: "Jensen", contact: "Jensen" })).toBe("Jensen");
    expect(partnerLabel({ business: "K&A Consulting Group", contact: "K & A consulting group" }))
      .toBe("K&A Consulting Group");
  });

  it("falls back to the person when the business is missing", () => {
    /* A record half-entered still has to render as something a human can read. */
    expect(partnerLabel({ business: null, contact: "Selena Alexander" })).toBe("Selena Alexander");
    expect(partnerLabel({ business: "", contact: "" })).toBe("");
  });

  it("tidies stray whitespace rather than rendering it", () => {
    expect(partnerLabel({ business: "  Prime  Capital  Group ", contact: " Parker Cathcart " }))
      .toBe("Prime Capital Group · Parker Cathcart");
  });

  it("splits into the same two halves the label shows", () => {
    expect(partnerNameParts({ business: "BizHub Financial", contact: "Jesse Roldan" }))
      .toEqual({ company: "BizHub Financial", person: "Jesse Roldan" });
    expect(partnerNameParts({ business: "Jensen", contact: "Jensen" }))
      .toEqual({ company: "Jensen", person: null });
    expect(partnerNameParts({ business: null, contact: "Selena Alexander" }))
      .toEqual({ company: "Selena Alexander", person: null });
  });
});
