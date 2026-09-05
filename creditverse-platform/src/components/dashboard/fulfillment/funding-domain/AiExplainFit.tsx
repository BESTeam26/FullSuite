/**
 * "Explain this fit (AI)" — the model puts a Program Fit result into plain
 * words for the person working the file. It receives only what the engine
 * already decided (each criterion's result and reason) and may not change or
 * re-rank anything: the outcome vocabulary stays the engine's, the lender
 * decides credit. Not connected / no credits come from the gateway.
 */
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useAgency } from "@/lib/agency-context";
import { requestAiDraft, type AiDraftResult } from "@/lib/data/ai-gateway";
import { PROGRAM_FIT_LABEL, type LenderMatch } from "@/lib/funding/readiness-engine";

const SYSTEM = [
  "You explain a deterministic Program Fit result to a funding processor in two or three plain sentences.",
  "Use only the criteria results given. Do not estimate approval odds, do not rank lenders, do not call the result an approval or a pre-approval, and do not invent lender policy.",
  "If information is missing, say what to collect. Return only the explanation.",
].join(" ");

export function AiExplainFit({ match }: { match: LenderMatch }) {
  const { activeOrganization } = useAgency();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiDraftResult | null>(null);
  if (!activeOrganization) return null;
  const prompt = `Program: ${match.lender.name} (policy ${match.lender.policyVersion ?? "unknown"}). Outcome: ${PROGRAM_FIT_LABEL[match.outcome]}.\n` +
    match.criteria.map((c) => `- ${c.label}: ${c.result} (${c.strength}) — ${c.reason}`).join("\n");
  const ask = async () => {
    setBusy(true); setResult(null);
    try { setResult(await requestAiDraft({ organizationId: activeOrganization.id, feature: "funding.analysis", product: "fundingOps", system: SYSTEM, prompt, maxTokens: 400 })); }
    finally { setBusy(false); }
  };
  return (
    <div className="mt-2">
      <button type="button" disabled={busy} onClick={() => void ask()} className="inline-flex items-center gap-1 text-[11px] font-semibold text-status-accent hover:underline disabled:opacity-60">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Explain this fit (AI)
      </button>
      {result && result.status !== "ok" && <p role="status" className="mt-1 text-[11px] text-muted-foreground">{result.message}</p>}
      {result?.status === "ok" && <p className="mt-1 rounded-lg border border-border bg-muted/30 p-2 text-[11px] text-foreground">{result.text.trim()}<span className="block pt-1 text-[10px] text-muted-foreground">An explanation of the engine's result, not a decision. {result.creditsCharged !== null ? `${result.creditsCharged} credits.` : ""}</span></p>}
    </div>
  );
}
