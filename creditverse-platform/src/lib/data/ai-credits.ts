/**
 * BES AI Credits (0070): balance, ledger, usage by feature, auto-recharge
 * settings; BES grants credits through grant_ai_credits(). Customers see
 * credits; tokens and provider cost are returned only to BES staff by policy
 * and the interface never shows them to an organization.
 */
import { requireSupabase } from "@/lib/supabase/client";

export interface AiFeature { key: string; label: string; product: string | null; active: boolean }
export interface AiLedgerEntry { id: string; deltaCredits: number; kind: string; reference: string | null; createdAt: string }
export interface AiUsageEvent { id: string; featureKey: string; model: string; inputTokens: number; outputTokens: number; cachedTokens: number; providerCostCents: number; creditsCharged: number; createdAt: string; userId: string | null }
export interface AiRechargeSettings { enabled: boolean; threshold: number; packUsd: number }
export interface AiCreditsSummary { balance: number; features: AiFeature[]; ledger: AiLedgerEntry[]; usage: AiUsageEvent[]; recharge: AiRechargeSettings | null }

export async function fetchAiCredits(organizationId: string, sinceIso: string): Promise<AiCreditsSummary> {
  const sb = requireSupabase();
  const [balance, features, ledger, usage, recharge] = await Promise.all([
    sb.rpc("ai_credit_balance", { p_org: organizationId }),
    sb.from("ai_features").select("key, label, product, active").eq("active", true).order("sort"),
    sb.from("ai_credit_ledger").select("id, delta_credits, kind, reference, created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(200),
    sb.from("ai_usage_events").select("id, feature_key, model, input_tokens, output_tokens, cached_tokens, provider_cost_cents, credits_charged, created_at, user_id").eq("organization_id", organizationId).gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(2000),
    sb.from("ai_recharge_settings").select("enabled, threshold, pack_usd").eq("organization_id", organizationId).maybeSingle(),
  ]);
  for (const r of [balance, features, ledger, usage, recharge]) if (r.error) throw r.error;
  return {
    balance: Number(balance.data ?? 0),
    features: (features.data ?? []).map((f) => ({ key: f.key, label: f.label, product: f.product, active: f.active })),
    ledger: (ledger.data ?? []).map((l) => ({ id: l.id, deltaCredits: Number(l.delta_credits), kind: l.kind, reference: l.reference, createdAt: l.created_at })),
    usage: (usage.data ?? []).map((u) => ({ id: u.id, featureKey: u.feature_key, model: u.model, inputTokens: u.input_tokens, outputTokens: u.output_tokens, cachedTokens: u.cached_tokens, providerCostCents: Number(u.provider_cost_cents), creditsCharged: Number(u.credits_charged), createdAt: u.created_at, userId: u.user_id })),
    recharge: recharge.data ? { enabled: recharge.data.enabled, threshold: Number(recharge.data.threshold), packUsd: recharge.data.pack_usd } : null,
  };
}
export async function saveRechargeSettings(organizationId: string, s: AiRechargeSettings, actorId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("ai_recharge_settings").upsert({ organization_id: organizationId, enabled: s.enabled, threshold: s.threshold, pack_usd: s.packUsd, updated_by: actorId, updated_at: new Date().toISOString() }, { onConflict: "organization_id" });
  if (error) throw error;
}
/** BES only (the function refuses anyone else): purchase, refund or adjustment, audited. */
export async function grantAiCredits(organizationId: string, credits: number, kind: "purchase" | "refund" | "adjustment", reference: string | null): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("grant_ai_credits", { p_org: organizationId, p_credits: credits, p_kind: kind, p_reference: reference ?? undefined });
  if (error) throw error;
}
