import { describe, expect, it } from "vitest";
import { assessReadiness, matchLenders, DEFAULT_READINESS_RULES } from "./readiness-engine";

const good = { timeInBusinessMonths: 24, monthlyRevenue: 40_000, creditScore: 690, existingMonthlyDebt: 5_000, documentsReceived: ["bank_statements", "id", "voided_check"] };

describe("funding readiness (deterministic)", () => {
  it("ready when every factor passes", () => {
    const r = assessReadiness(good);
    expect(r.level).toBe("ready");
    expect(r.factors.every((f) => f.status === "pass")).toBe(true);
  });
  it("needs work with one failure; not ready with two; unknowns never count as pass", () => {
    expect(assessReadiness({ ...good, creditScore: 560 }).level).toBe("needs_work");
    expect(assessReadiness({ ...good, creditScore: 560, monthlyRevenue: 2_000 }).level).toBe("not_ready");
    const r = assessReadiness({ ...good, creditScore: null });
    expect(r.level).toBe("needs_work");
    expect(r.factors.find((f) => f.key === "credit_score")?.status).toBe("unknown");
  });
  it("names the missing documents and honours organization rules", () => {
    const r = assessReadiness({ ...good, documentsReceived: ["id"] });
    expect(r.missingDocuments).toEqual(["bank_statements", "voided_check"]);
    const strict = assessReadiness(good, { ...DEFAULT_READINESS_RULES, minCreditScore: 700 });
    expect(strict.factors.find((f) => f.key === "credit_score")?.status).toBe("fail");
  });
});

describe("lender matching (stored policy criteria only — a potential match, never an approval)", () => {
  const now = new Date("2026-09-05T00:00:00Z");
  const verified = "2026-08-20T00:00:00Z"; // 16 days ago: current under the 90-day default
  const lenders = [
    { id: "a", name: "Alpha Capital", program: "Term", policyVersion: "2026.08", lastVerifiedAt: verified, minAmount: 10_000, maxAmount: 250_000, minCreditScore: 650, minTimeInBusinessMonths: 12, minMonthlyRevenue: 20_000, industriesExcluded: ["cannabis"], active: true },
    { id: "b", name: "Beta Funding", program: null, policyVersion: "2026.07", lastVerifiedAt: verified, minAmount: null, maxAmount: 50_000, minCreditScore: 550, minTimeInBusinessMonths: 3, minMonthlyRevenue: null, industriesExcluded: [], active: true },
    { id: "c", name: "Closed Lender", program: null, policyVersion: null, lastVerifiedAt: null, minAmount: null, maxAmount: null, minCreditScore: null, minTimeInBusinessMonths: null, minMonthlyRevenue: null, industriesExcluded: [], active: false },
  ];
  const opts = { policyReviewDays: 90, now };
  it("ranks potential matches first and lists exactly which stored criteria failed", () => {
    const out = matchLenders({ requestedAmount: 100_000, creditScore: 600, timeInBusinessMonths: 24, monthlyRevenue: 30_000, industry: "retail" }, lenders, opts);
    // Neither matches (Alpha: credit score; Beta: amount above max); ties resolve by name.
    expect(out.map((m) => m.lender.id)).toEqual(["a", "b"]);
    expect(out.every((m) => m.outcome === "not_matched")).toBe(true);
    expect(out.find((m) => m.lender.id === "a")?.failed).toEqual(["credit score"]);
    expect(out.find((m) => m.lender.id === "b")?.failed).toEqual(["amount"]);
    const matched = matchLenders({ requestedAmount: 100_000, creditScore: 700, timeInBusinessMonths: 24, monthlyRevenue: 30_000, industry: "retail" }, lenders, opts);
    expect(matched[0].lender.id).toBe("a");
    expect(matched[0].outcome).toBe("potential_match");
    expect(matched[0].lender.policyVersion).toBe("2026.08");
    expect(out.find((m) => m.lender.id === "c")).toBeUndefined();
  });
  it("unanswered inputs are reported as unconfirmed, never assumed", () => {
    const out = matchLenders({ requestedAmount: 20_000, creditScore: null, timeInBusinessMonths: 24, monthlyRevenue: 30_000, industry: null }, lenders, opts);
    const alpha = out.find((m) => m.lender.id === "a")!;
    expect(alpha.unconfirmed).toEqual(expect.arrayContaining(["credit score", "industry"]));
    expect(alpha.outcome).toBe("potential_match");
  });
  it("a policy nobody has verified within the review window cannot produce a match", () => {
    const stale = lenders.map((l) => (l.id === "a" ? { ...l, lastVerifiedAt: "2026-01-01T00:00:00Z" } : l));
    const out = matchLenders({ requestedAmount: 100_000, creditScore: 700, timeInBusinessMonths: 24, monthlyRevenue: 30_000, industry: "retail" }, stale, opts);
    expect(out.find((m) => m.lender.id === "a")?.outcome).toBe("policy_verification_required");
    // A failed criterion is still decisive: stale or not, the answer is "no".
    expect(out.find((m) => m.lender.id === "b")?.outcome).toBe("not_matched");
    // Verification-required sorts after real potential matches and before non-matches.
    const fresh = matchLenders({ requestedAmount: 40_000, creditScore: 700, timeInBusinessMonths: 24, monthlyRevenue: 30_000, industry: "retail" }, stale, opts);
    expect(fresh.map((m) => m.outcome)).toEqual(["potential_match", "policy_verification_required"]);
  });
});
