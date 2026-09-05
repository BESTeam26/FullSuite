/**
 * AI credit arithmetic for the interface (previews, statements). The charge
 * that is actually recorded is computed by `ai_record_usage()` in the database
 * (0070) with the same formula; this mirrors it for display, as
 * `effectivePermission()` mirrors `member_can()`. Provider cost
 * comes from the pricing policy in force for the model (USD per million
 * tokens), BES's markup multiplies it, and credits are priced by the policy's
 * credits-per-USD. Rounded up to the cent so a call is never under-charged.
 * Customers see credits; tokens and provider cost stay internal.
 */
export interface PricingPolicy { model: string; inputCostPerMillion: number; outputCostPerMillion: number; cachedCostPerMillion: number; markupMultiplier: number; creditsPerUsd: number }
export interface TokenUsage { inputTokens: number; outputTokens: number; cachedTokens: number }
export interface Charge { providerCostCents: number; creditsCharged: number }

export function computeCharge(policy: PricingPolicy, usage: TokenUsage): Charge {
  const usd = (usage.inputTokens * policy.inputCostPerMillion + usage.outputTokens * policy.outputCostPerMillion + usage.cachedTokens * policy.cachedCostPerMillion) / 1_000_000;
  const providerCostCents = Math.round(usd * 100 * 10_000) / 10_000;
  const creditsCharged = Math.ceil(usd * policy.markupMultiplier * policy.creditsPerUsd * 100) / 100;
  return { providerCostCents, creditsCharged };
}

/** Balance after a charge, and whether the auto-recharge threshold was crossed by it. */
export function afterCharge(balance: number, charge: Charge, threshold: number | null): { balance: number; crossedThreshold: boolean } {
  const next = Math.round((balance - charge.creditsCharged) * 100) / 100;
  return { balance: next, crossedThreshold: threshold !== null && balance > threshold && next <= threshold };
}

/** Credits a pack buys under a policy: pack USD × credits per USD. */
export const creditsForPack = (packUsd: number, creditsPerUsd: number) => Math.round(packUsd * creditsPerUsd * 100) / 100;
