import { describe, expect, it } from "vitest";
import { orgDivisionLabel } from "./division-label";

describe("naming an organizational division", () => {
  it("names the five that exist", () => {
    expect(["creditops", "fundingops", "bes_crm", "talentops", "sales_marketing"].map(orgDivisionLabel))
      .toEqual(["CreditOps", "FundingOps", "BES CRM", "TalentOps", "Sales & Marketing"]);
  });

  it("does not confuse the org division with the TIMER division", () => {
    /* The timer's map spells it `bes-crm`; the org's is `bes_crm`. Reusing one
       for the other fell through to the raw key and put "bes_crm" on screen
       as a heading. */
    expect(orgDivisionLabel("bes_crm")).toBe("BES CRM");
  });

  it("reads a division added in the database as words, not as a key", () => {
    expect(orgDivisionLabel("client_success")).toBe("Client Success");
  });

  it("says nothing for a team with no division", () => {
    expect(orgDivisionLabel(null)).toBeNull();
    expect(orgDivisionLabel("")).toBeNull();
  });
});
