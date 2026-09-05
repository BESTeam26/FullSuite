import { describe, expect, it } from "vitest";
import { assessReadiness, matchLenders, DEFAULT_READINESS_RULES, buildFitSnapshot } from "./readiness-engine";

const good = { timeInBusinessMonths: 24, monthlyRevenue: 40_000, creditScore: 690, existingMonthlyDebt: 5_000, documentsReceived: ["bank_statement", "government_id", "voided_check"] };

describe("funding readiness (deterministic)", () => {
  it("ready for placement when every factor passes", () => {
    const r = assessReadiness(good);
    expect(r.level).toBe("ready_for_placement");
    expect(r.factors.every((f) => f.status === "pass")).toBe(true);
  });
  it("one failure is conditional; two are not currently ready; an unanswered factor is a potential fit, never a pass", () => {
    expect(assessReadiness({ ...good, creditScore: 560 }).level).toBe("conditional");
    expect(assessReadiness({ ...good, creditScore: 560, monthlyRevenue: 2_000 }).level).toBe("not_currently_ready");
    const r = assessReadiness({ ...good, creditScore: null });
    expect(r.level).toBe("potential_fit");
    expect(r.factors.find((f) => f.key === "credit_score")?.status).toBe("unknown");
  });
  it("mostly unanswered is insufficient information, not a verdict", () => {
    expect(assessReadiness({ timeInBusinessMonths: null, monthlyRevenue: null, creditScore: null, existingMonthlyDebt: null, documentsReceived: [] }).level).toBe("insufficient_information");
  });
  it("names the missing documents and honours organization rules", () => {
    const r = assessReadiness({ ...good, documentsReceived: ["government_id"] });
    expect(r.missingDocuments).toEqual(["bank_statement", "voided_check"]);
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
  it("hard mismatches are 'Current Criteria Mismatch' with the exact criterion named; fits are 'Apparent Fit'", () => {
    const out = matchLenders({ requestedAmount: 100_000, creditScore: 600, timeInBusinessMonths: 24, monthlyRevenue: 30_000, industry: "retail" }, lenders, opts);
    // Neither fits (Alpha: credit score; Beta: amount above max); ties resolve by name.
    expect(out.map((m) => m.lender.id)).toEqual(["a", "b"]);
    expect(out.every((m) => m.outcome === "apparent_mismatch")).toBe(true);
    expect(out.find((m) => m.lender.id === "a")?.failed).toEqual(["Credit score"]);
    expect(out.find((m) => m.lender.id === "b")?.failed).toEqual(["Requested amount"]);
    const fit = matchLenders({ requestedAmount: 100_000, creditScore: 700, timeInBusinessMonths: 24, monthlyRevenue: 30_000, industry: "retail" }, lenders, opts);
    expect(fit[0].lender.id).toBe("a");
    expect(fit[0].outcome).toBe("apparent_fit");
    expect(fit[0].lender.policyVersion).toBe("2026.08");
    expect(fit[0].criteria.every((c) => c.result === "meets")).toBe(true);
    expect(out.find((m) => m.lender.id === "c")).toBeUndefined();
  });
  it("unanswered inputs are 'Missing Information' and make the fit 'Insufficient Information', never assumed", () => {
    const out = matchLenders({ requestedAmount: 20_000, creditScore: null, timeInBusinessMonths: 24, monthlyRevenue: 30_000, industry: null }, lenders, opts);
    const alpha = out.find((m) => m.lender.id === "a")!;
    expect(alpha.unconfirmed).toEqual(expect.arrayContaining(["Credit score", "Industry"]));
    expect(alpha.outcome).toBe("insufficient_information");
  });
  it("a preferred criterion below guidance is 'Needs Review' and the fit 'Conditional Fit' — never 'Does Not Meet'", () => {
    const soft = lenders.map((l) => (l.id === "a" ? { ...l, strengths: { credit_score: "preferred" as const } } : l));
    const out = matchLenders({ requestedAmount: 100_000, creditScore: 600, timeInBusinessMonths: 24, monthlyRevenue: 30_000, industry: "retail" }, soft, opts);
    const alpha = out.find((m) => m.lender.id === "a")!;
    expect(alpha.outcome).toBe("conditional_fit");
    expect(alpha.criteria.find((c) => c.key === "credit_score")?.result).toBe("needs_review");
    expect(alpha.failed).toEqual([]);
    // Informational criteria never affect fit; manual-review criteria make the whole fit 'Needs Review'.
    const info = matchLenders({ requestedAmount: 100_000, creditScore: 600, timeInBusinessMonths: 24, monthlyRevenue: 30_000, industry: "retail" }, lenders.map((l) => (l.id === "a" ? { ...l, strengths: { credit_score: "informational" as const } } : l)), opts);
    expect(info.find((m) => m.lender.id === "a")?.outcome).toBe("apparent_fit");
    const manual = matchLenders({ requestedAmount: 100_000, creditScore: 700, timeInBusinessMonths: 24, monthlyRevenue: 30_000, industry: "retail" }, lenders.map((l) => (l.id === "a" ? { ...l, strengths: { industry: "manual_review" as const } } : l)), opts);
    expect(manual.find((m) => m.lender.id === "a")?.outcome).toBe("needs_review");
  });
  it("a policy nobody has verified within the review window is 'Policy Unavailable'", () => {
    const stale = lenders.map((l) => (l.id === "a" ? { ...l, lastVerifiedAt: "2026-01-01T00:00:00Z" } : l));
    const out = matchLenders({ requestedAmount: 100_000, creditScore: 700, timeInBusinessMonths: 24, monthlyRevenue: 30_000, industry: "retail" }, stale, opts);
    expect(out.find((m) => m.lender.id === "a")?.outcome).toBe("policy_unavailable");
    // A hard mismatch is still decisive: stale or not, the answer is "no".
    expect(out.find((m) => m.lender.id === "b")?.outcome).toBe("apparent_mismatch");
    // Operational order, not a ranking: fits, then what needs work, then what cannot be used.
    const fresh = matchLenders({ requestedAmount: 40_000, creditScore: 700, timeInBusinessMonths: 24, monthlyRevenue: 30_000, industry: "retail" }, stale, opts);
    expect(fresh.map((m) => m.outcome)).toEqual(["apparent_fit", "policy_unavailable"]);
  });
});

describe("buildFitSnapshot", () => {
  it("freezes the outcome, the policy judged against and every criterion result at submission time", () => {
    const lender = { id: "p1", name: "Bank · Term", program: "Term", policyVersion: "v3", policyVersionId: "pv-3", lastVerifiedAt: "2026-09-01T00:00:00Z", minAmount: 10_000, maxAmount: 250_000, minCreditScore: 650, minTimeInBusinessMonths: 24, minMonthlyRevenue: 20_000, industriesExcluded: [], active: true };
    const [match] = matchLenders({ requestedAmount: 50_000, creditScore: 700, timeInBusinessMonths: 36, monthlyRevenue: 40_000, industry: null }, [lender]);
    const snap = buildFitSnapshot(match, new Date("2026-09-05T12:00:00Z"));
    expect(snap.outcome).toBe("apparent_fit");
    expect(snap.policyVersion).toBe("v3");
    expect(snap.evaluatedAt).toBe("2026-09-05T12:00:00.000Z");
    expect(snap.criteria.length).toBe(match.criteria.length);
    expect(snap.criteria.every((c) => c.result === "meets" || c.result === "not_applicable")).toBe(true);
  });
});
