import { describe, expect, it } from "vitest";
import { buildIdentityInput, formatKnownAddress } from "./identity-input";
import { runSection } from "./run-section";
import { SECTION_A_RULES } from "./section-a-identity";
import type { RawReportItem } from "@/lib/credit-classification";

const personal = (subtype: string, name: string): RawReportItem => ({
  id: `${subtype}-${name}`,
  name,
  kind: "Personal",
  subtype,
  status: "",
  bureaus: ["EQ"],
});

const account: RawReportItem = {
  id: "acct-1",
  name: "Capital One",
  kind: "Account",
  status: "Open",
  bureaus: ["EQ"],
};

describe("building Section A input from a real report", () => {
  it("takes the reported side from the report and the verified side from the client", () => {
    const { input } = buildIdentityInput(
      [personal("Name", "JON SMITH"), account],
      { fullName: "Jonathan Smith" },
    );
    expect(input.reportedName).toBe("JON SMITH");
    expect(input.verifiedName).toBe("Jonathan Smith");
  });

  it("ignores anything that is not a Personal item", () => {
    const { input } = buildIdentityInput([account], { fullName: "Jonathan Smith" });
    expect(input.reportedName).toBeUndefined();
  });

  it("falls back to any address item when there is no one labelled exactly Address", () => {
    const { input } = buildIdentityInput([personal("Previous address", "9 Old Rd, Tampa, FL")], {});
    expect(input.reportedAddress).toBe("9 Old Rd, Tampa, FL");
  });

  it("never invents an attestation", () => {
    const { input } = buildIdentityInput([personal("Name", "X")], { fullName: "X" });
    expect(input.attestedNotDeceased).toBeUndefined();
    expect(input.attestedNotMine).toBeUndefined();
  });

  it("passes an attestation through only when it was actually signed", () => {
    const { input } = buildIdentityInput([], {}, { notDeceased: true });
    expect(input.attestedNotDeceased).toBe(true);
  });

  it("says which facts are deliberately absent, so an UNKNOWN reads as a decision", () => {
    const { deliberatelyAbsent } = buildIdentityInput([], {});
    expect(deliberatelyAbsent.some((d) => /SSN/i.test(d.field))).toBe(true);
    for (const d of deliberatelyAbsent) expect(d.because.length).toBeGreaterThan(20);
  });

  it("formats a known address, and returns null rather than an empty string", () => {
    expect(formatKnownAddress({ addressLine1: "1 Main St", city: "Tampa", state: "FL", postalCode: "33601" }))
      .toBe("1 Main St Tampa, FL 33601");
    expect(formatKnownAddress({})).toBeNull();
  });
});

describe("what the built input actually produces", () => {
  it("leaves the SSN rules UNKNOWN, because no SSN is stored anywhere", () => {
    const { input } = buildIdentityInput([personal("Name", "Jonathan Smith")], { fullName: "Jonathan Smith" });
    const result = runSection(SECTION_A_RULES, input);
    /* A4 is the SSN-mismatch rule; catalogue ids are A1, A2, A4… not words. */
    expect(result.unknown.map((f) => f.ruleId)).toContain("A4");
    expect(result.confirmed.map((f) => f.ruleId)).not.toContain("A4");
    expect(result.unknown.find((f) => f.ruleId === "A4")?.missing).toBeTruthy();
  });

  it("does not flag an abbreviated name as a defect", () => {
    const { input } = buildIdentityInput([personal("Name", "J SMITH")], { fullName: "Jonathan Smith" });
    const result = runSection(SECTION_A_RULES, input);
    /* A2 is the wrong-name rule. An abbreviation is not an inaccuracy. */
    expect(result.confirmed.map((f) => f.ruleId)).not.toContain("A2");
  });
});
