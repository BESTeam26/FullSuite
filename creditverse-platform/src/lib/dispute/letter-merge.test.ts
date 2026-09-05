import { describe, expect, it } from "vitest";
import { approvalReadiness, citationProblems, mergeTemplate, placeholdersIn, prohibitedPhrase } from "./letter-merge";

const tpl = "Furnisher: {{furnisher_name}}\nAccount: {{account_masked}}\nMy report states {{reported_value}}. {{ consumer_name }}";

describe("letter merge", () => {
  it("lists placeholders once, case-insensitively, ignoring spaces", () => {
    expect(placeholdersIn(tpl)).toEqual(["furnisher_name", "account_masked", "reported_value", "consumer_name"]);
  });
  it("fills every placeholder or names the missing ones — never an empty string", () => {
    const ok = mergeTemplate(tpl, { furnisher_name: "Chase", account_masked: "****1234", reported_value: "$4,225", consumer_name: "E. Ellis" });
    expect(ok).toEqual({ ok: true, body: "Furnisher: Chase\nAccount: ****1234\nMy report states $4,225. E. Ellis" });
    const bad = mergeTemplate(tpl, { furnisher_name: "Chase", reported_value: " " });
    expect(bad).toEqual({ ok: false, missing: ["account_masked", "reported_value", "consumer_name"] });
  });
  it("finds the phrases the doctrine forbids", () => {
    expect(prohibitedPhrase("This is a Metro 2 Violation.")).toBe("metro 2 violation");
    expect(prohibitedPhrase("Please reinvestigate and correct or delete as appropriate.")).toBeNull();
  });
  it("citations must fit the recipient and the dispute origin", () => {
    expect(citationProblems("Under 1681e(b) you must…", "furnisher", "cro_prepared")).toHaveLength(1);
    expect(citationProblems("Under 12 C.F.R. 1022.43…", "furnisher", "cro_prepared")).toHaveLength(1);
    expect(citationProblems("Under 12 C.F.R. 1022.43…", "furnisher", "consumer_prepared")).toHaveLength(0);
    expect(citationProblems("FDCPA 1692e(8)…", "cra", "cro_prepared")).toHaveLength(1);
    expect(citationProblems("15 U.S.C. 1681i reinvestigation", "cra", "cro_prepared")).toHaveLength(0);
  });
  it("approval readiness mirrors the database gate", () => {
    const body = "I am disputing the accuracy of the balance reported for this account. Enclosed is the statement showing the correct value.";
    expect(approvalReadiness({ body, recipient: "cra", origin: "cro_prepared", attested: true })).toEqual({ ready: true, reasons: [] });
    const r = approvalReadiness({ body: "short {{x}}", recipient: "furnisher", origin: "cro_prepared", attested: false });
    expect(r.ready).toBe(false);
    expect(r.reasons.length).toBeGreaterThanOrEqual(3);
  });
});
