/**
 * Selection has to be explainable six months later, so these fix the rules
 * rather than the wording: specificity wins, an organization's own wording
 * beats the BES default, and a claim about the consumer is never made unless
 * the consumer signed it.
 */
import { describe, expect, it } from "vitest";
import { selectReason, suggestedTier } from "./reason-selector";
import type { DisputeReason } from "./reason-catalogue";

const reason = (over: Partial<DisputeReason> & { id: string }): DisputeReason => ({
  organizationId: null, isActive: true, subject: "Charge-Off", tier: "firm",
  requires: [], requiresAttestation: [], fromRound: 1, claimTier: "observed_discrepancy",
  citations: [], weight: 100, body: "…", label: over.id, ...over,
});

const base = {
  subject: "Charge-Off" as const,
  detected: ["charge_off_with_balance", "dates_inconsistent", "balance_inconsistent"] as never[],
  round: 2,
  tier: "firm" as const,
  attested: [] as never[],
};

describe("selectReason", () => {
  it("prefers the reason that names the most detected problems", () => {
    const vague = reason({ id: "vague", requires: [] });
    const sharp = reason({ id: "sharp", requires: ["charge_off_with_balance", "dates_inconsistent"] });
    const r = selectReason({ ...base, catalogue: [vague, sharp] });
    expect(r.chosen?.id).toBe("sharp");
    expect(r.candidates.map((c) => c.id)).toEqual(["sharp", "vague"]);
  });

  it("ignores a reason whose conditions were not detected", () => {
    const wrong = reason({ id: "wrong", requires: ["attested_identity_theft"] });
    const r = selectReason({ ...base, catalogue: [wrong] });
    expect(r.chosen).toBeNull();
    /* Not applicable is not the same as withheld — it simply does not fit. */
    expect(r.withheld).toHaveLength(0);
  });

  it("REFUSES a claim about the consumer that the consumer has not signed", () => {
    const breach = reason({
      id: "breach", requires: ["charge_off_with_balance"],
      requiresAttestation: ["attested_breach_impact"], claimTier: "consumer_asserted_fact",
    });
    const r = selectReason({ ...base, catalogue: [breach] });
    expect(r.chosen).toBeNull();
    expect(r.withheld[0].because).toContain("attested_breach_impact");
  });

  it("allows it once they have", () => {
    const breach = reason({
      id: "breach", requires: ["charge_off_with_balance"],
      requiresAttestation: ["attested_breach_impact"],
    });
    const r = selectReason({ ...base, attested: ["attested_breach_impact"] as never[], catalogue: [breach] });
    expect(r.chosen?.id).toBe("breach");
  });

  it("holds a later-round reason back, and says so", () => {
    const late = reason({ id: "round4", fromRound: 4 });
    const r = selectReason({ ...base, round: 2, catalogue: [late] });
    expect(r.chosen).toBeNull();
    expect(r.withheld[0].because).toContain("round 4");
  });

  it("keeps the tiers apart", () => {
    const soft = reason({ id: "soft", tier: "initial" });
    const hard = reason({ id: "hard", tier: "aggressive" });
    expect(selectReason({ ...base, tier: "initial", catalogue: [soft, hard] }).chosen?.id).toBe("soft");
    expect(selectReason({ ...base, tier: "aggressive", catalogue: [soft, hard] }).chosen?.id).toBe("hard");
  });

  it("lets an organization's own wording beat the BES default", () => {
    const bes = reason({ id: "a-bes", organizationId: null, weight: 500 });
    const own = reason({ id: "z-own", organizationId: "org-1", weight: 100 });
    expect(selectReason({ ...base, catalogue: [bes, own] }).chosen?.id).toBe("z-own");
  });

  it("is stable when everything else ties", () => {
    const a = reason({ id: "aaa" });
    const b = reason({ id: "bbb" });
    expect(selectReason({ ...base, catalogue: [b, a] }).chosen?.id).toBe("aaa");
    expect(selectReason({ ...base, catalogue: [a, b] }).chosen?.id).toBe("aaa");
  });

  it("skips a retired reason", () => {
    expect(selectReason({ ...base, catalogue: [reason({ id: "old", isActive: false })] }).chosen).toBeNull();
  });
});

describe("suggestedTier", () => {
  it("escalates with the round so round 5 does not sound like round 1", () => {
    expect(suggestedTier(1)).toBe("initial");
    expect(suggestedTier(2)).toBe("firm");
    expect(suggestedTier(3)).toBe("firm");
    expect(suggestedTier(4)).toBe("aggressive");
    expect(suggestedTier(9)).toBe("aggressive");
  });
});
