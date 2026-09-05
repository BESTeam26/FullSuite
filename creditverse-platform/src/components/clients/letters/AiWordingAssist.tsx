/**
 * "Suggest wording" for a draft letter — the first AI-assisted action behind
 * the gateway. The model may only rephrase what the letter already says, in
 * the consumer's plain voice; it adds no facts and draws no legal
 * conclusions. The suggestion is checked deterministically for prohibited
 * phrases before it can be applied, the person applies it or not, and the QA
 * gate still decides approval. Not connected / no credits are shown plainly.
 */
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAgency } from "@/lib/agency-context";
import { requestAiDraft, type AiDraftResult } from "@/lib/data/ai-gateway";
import { PROHIBITED_PHRASES, prohibitedPhrase } from "@/lib/dispute/letter-merge";

const SYSTEM = [
  "You help a consumer improve the wording of a credit-report dispute letter they will sign.",
  "Rephrase for clarity and a calm, factual, first-person voice. Keep every fact, account reference, date and enclosure exactly as given.",
  "Do not add facts, do not cite laws or regulations, do not assert violations, do not threaten, do not promise outcomes.",
  `Never use these phrases: ${PROHIBITED_PHRASES.join("; ")}.`,
  "Return only the revised letter body, no preamble.",
].join(" ");

export function AiWordingAssist({ body, onApply, disabled }: { body: string; onApply: (next: string) => void; disabled?: boolean }) {
  const { activeOrganization } = useAgency();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiDraftResult | null>(null);
  if (!activeOrganization) return null;
  const suggestion = result?.status === "ok" ? result.text.trim() : "";
  const blocked = suggestion ? prohibitedPhrase(suggestion) : null;

  const ask = async () => {
    setBusy(true); setResult(null);
    try { setResult(await requestAiDraft({ organizationId: activeOrganization.id, feature: "letters.assist", product: "creditOps", system: SYSTEM, prompt: body, maxTokens: 1500 })); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><Sparkles className="h-3.5 w-3.5 text-status-accent" /> Wording help (AI)</p>
        <Button size="sm" variant="outline" disabled={disabled || busy || !body.trim()} onClick={() => void ask()}>{busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />} Suggest wording</Button>
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">Rephrases what the letter already says, in the consumer's voice. It adds no facts and cites no law; you decide what to keep, and approval still passes the QA gate. Uses BES AI Credits.</p>
      {result && result.status !== "ok" && <p role="status" className="mt-2 text-xs text-foreground">{result.message}</p>}
      {result?.status === "ok" && (
        <div className="mt-2 space-y-2">
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed text-foreground">{suggestion}</pre>
          {blocked ? <p role="alert" className="text-xs text-status-danger">The suggestion contains a prohibited phrase ("{blocked}") and cannot be applied.</p> : (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => onApply(suggestion)} disabled={disabled}>Use this wording</Button>
              <span className="text-[10px] text-muted-foreground">{result.creditsCharged !== null ? `${result.creditsCharged} credits · balance ${result.balance ?? "—"}` : ""}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
