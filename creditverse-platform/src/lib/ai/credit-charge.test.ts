import { describe, expect, it } from "vitest";
import { afterCharge, computeCharge, creditsForPack } from "./credit-charge";

const policy = { model: "claude-sonnet-5", inputCostPerMillion: 3, outputCostPerMillion: 15, cachedCostPerMillion: 0.3, markupMultiplier: 2, creditsPerUsd: 100 };

describe("AI credit charge", () => {
  it("prices tokens from the policy, applies BES markup, rounds credits up to the cent", () => {
    const c = computeCharge(policy, { inputTokens: 10_000, outputTokens: 2_000, cachedTokens: 0 });
    expect(c.providerCostCents).toBe(6);            // $0.03 + $0.03 = $0.06
    expect(c.creditsCharged).toBe(12);              // $0.06 × 2 × 100 credits/USD
    expect(computeCharge(policy, { inputTokens: 1, outputTokens: 0, cachedTokens: 0 }).creditsCharged).toBe(0.01);
  });
  it("cached tokens cost their own rate", () => {
    expect(computeCharge(policy, { inputTokens: 0, outputTokens: 0, cachedTokens: 1_000_000 }).providerCostCents).toBe(30);
  });
  it("reports when a charge crosses the recharge threshold, and never mis-rounds the balance", () => {
    expect(afterCharge(505, { providerCostCents: 0, creditsCharged: 10 }, 500)).toEqual({ balance: 495, crossedThreshold: true });
    expect(afterCharge(495, { providerCostCents: 0, creditsCharged: 10 }, 500)).toEqual({ balance: 485, crossedThreshold: false });
    expect(afterCharge(100, { providerCostCents: 0, creditsCharged: 0.1 }, null).balance).toBe(99.9);
  });
  it("a pack buys pack × credits per USD", () => {
    expect(creditsForPack(25, 100)).toBe(2500);
  });
});
