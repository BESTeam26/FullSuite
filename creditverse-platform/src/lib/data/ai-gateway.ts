/**
 * The browser's only way to reach a model: the `ai-gateway` Edge Function.
 * The function checks the session, entitlement and credit balance, holds the
 * provider key, meters the call and debits credits. This module sends the
 * request and shapes the answer — including the two states the interface must
 * show honestly: not connected (no provider key yet) and no credits.
 */
import { requireSupabase } from "@/lib/supabase/client";

export type AiFeatureKey = "credit.analysis" | "letters.assist" | "funding.analysis" | "funding.doc_intel" | "ops.assistant";
export interface AiDraftRequest { organizationId: string; feature: AiFeatureKey; product?: "creditOps" | "fundingOps"; system?: string; prompt: string; maxTokens?: number }
export type AiDraftResult =
  | { status: "ok"; text: string; creditsCharged: number | null; balance: number | null }
  | { status: "not_connected" | "no_credits" | "error"; message: string };

export async function requestAiDraft(input: AiDraftRequest): Promise<AiDraftResult> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke("ai-gateway", { body: input });
  if (error) {
    // supabase-js wraps non-2xx responses; read the function's own message when it sent one.
    const ctx = (error as { context?: Response }).context;
    if (ctx) {
      try {
        const body = (await ctx.json()) as { error?: string; code?: string };
        if (body.code === "not_connected") return { status: "not_connected", message: body.error ?? "AI is not connected yet." };
        if (body.code === "no_credits") return { status: "no_credits", message: body.error ?? "No AI credits." };
        return { status: "error", message: body.error ?? error.message };
      } catch { /* fall through */ }
    }
    return { status: "error", message: error.message };
  }
  const d = data as { text?: string; creditsCharged?: number | null; balance?: number | null };
  return { status: "ok", text: d.text ?? "", creditsCharged: d.creditsCharged ?? null, balance: d.balance ?? null };
}
