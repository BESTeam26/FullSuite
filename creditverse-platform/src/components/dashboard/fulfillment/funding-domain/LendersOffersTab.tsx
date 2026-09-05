/**
 * Lenders & Offers: potential matches evaluated against the stored policy
 * version in force today (never a probability, never an approval), the
 * submissions made from them (deals), and the lender's decisions — recorded
 * through `record_lender_decision`, which also moves the deal status by a
 * fixed mapping.
 */
import { useMemo, useState } from "react";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { Loader2, Send } from "lucide-react";
import { OpsSelect } from "@/components/ui/ops-select";
import { errorMessage } from "@/lib/data/error-message";
import { recordLenderDecision, submitToLender, type FundingFileDomain } from "@/lib/data/funding-domain";
import { useInvalidateFundingFile, useLenderCatalogue } from "@/lib/data/use-funding-domain";
import { DECISION_LABELS, type LenderDecisionKind } from "@/lib/funding/document-vocabulary";
import { toLenderCriteria } from "@/lib/funding/lender-catalogue";
import { buildFitSnapshot, matchLenders, PROGRAM_FIT_LABEL, type LenderMatch, type MatchOutcome } from "@/lib/funding/readiness-engine";
import { cn } from "@/lib/utils";

interface Props {
  fileId: string;
  clientId: string;
  domain: FundingFileDomain;
  canEdit: boolean;
}

const OUTCOME_TONE: Record<MatchOutcome, string> = {
  apparent_fit: "border-emerald-500/40 bg-emerald-500/10 text-status-success",
  conditional_fit: "border-emerald-500/30 bg-emerald-500/5 text-emerald-800",
  needs_review: "border-amber-500/40 bg-amber-500/10 text-amber-800",
  insufficient_information: "border-border bg-muted text-muted-foreground",
  policy_unavailable: "border-amber-500/40 bg-amber-500/10 text-amber-800",
  apparent_mismatch: "border-red-500/30 bg-red-500/10 text-red-700",
};
const SUBMITTABLE: MatchOutcome[] = ["apparent_fit", "conditional_fit"];
const DECISIONS: LenderDecisionKind[] = ["pending", "approved", "conditional", "declined", "withdrawn", "expired"];

export function LendersOffersTab({ fileId, clientId, domain, canEdit }: Props) {
  const catalogue = useLenderCatalogue();
  const invalidate = useInvalidateFundingFile();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const app = domain.application;

  const today = new Date().toISOString().slice(0, 10);
  const programIndex = useMemo(() => {
    const m = new Map<string, { lenderId: string; lenderName: string; programName: string }>();
    for (const l of catalogue.data ?? []) for (const p of l.programs) m.set(p.id, { lenderId: l.id, lenderName: l.name, programName: p.name });
    return m;
  }, [catalogue.data]);
  const matches: LenderMatch[] = useMemo(() => {
    if (!catalogue.data) return [];
    return matchLenders(
      { requestedAmount: app?.requestedAmount ?? null, creditScore: app?.creditScoreStated ?? null, timeInBusinessMonths: app?.timeInBusinessMonths ?? null, monthlyRevenue: app?.monthlyRevenue ?? null, industry: null },
      toLenderCriteria(catalogue.data, today),
    );
  }, [catalogue.data, app, today]);

  const run = async (key: string, fn: () => Promise<void>, fallback: string) => {
    setBusy(key); setError(null);
    try { await fn(); invalidate(fileId); } catch (e) { setError(errorMessage(e, fallback)); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Potential matches</p>
          {catalogue.isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        {!app && <p className="mt-1 text-xs text-muted-foreground">Record an application first — matching reads its amount, credit score, time in business and revenue.</p>}
        {app && catalogue.data && matches.length === 0 && <p className="mt-1 text-xs text-muted-foreground">No lender program with a policy in force today is in your catalogue yet.</p>}
        <ul className="mt-2 space-y-2">
          {matches.map((m) => {
            const ref = programIndex.get(m.lender.id);
            return (
              <li key={m.lender.id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground">{m.lender.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Policy {m.lender.policyVersion ?? "—"} · {m.lender.lastVerifiedAt ? `verified ${formatDate(m.lender.lastVerifiedAt)}` : "never verified"}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {m.matched.map((c) => <Chip key={`m-${c}`} tone="ok">Meets · {c}</Chip>)}
                      {m.needsReview.map((c) => <Chip key={`r-${c}`} tone="review">Needs review · {c}</Chip>)}
                      {m.failed.map((c) => <Chip key={`f-${c}`} tone="bad">Does not meet · {c}</Chip>)}
                      {m.unconfirmed.map((c) => <Chip key={`u-${c}`} tone="unknown">Missing information · {c}</Chip>)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold", OUTCOME_TONE[m.outcome])}>{PROGRAM_FIT_LABEL[m.outcome]}</span>
                    {canEdit && ref && SUBMITTABLE.includes(m.outcome) && app?.requestedAmount && (
                      <button type="button" disabled={busy !== null}
                        onClick={() => void run(`submit:${m.lender.id}`, () => submitToLender({ fileId, clientId, lenderId: ref.lenderId, lenderName: ref.lenderName, programId: m.lender.id, programName: ref.programName, amount: app.requestedAmount!, policyVersionId: m.lender.policyVersionId ?? null, fitSnapshot: buildFitSnapshot(m) }), "Could not record the submission.")}
                        className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary/10 disabled:opacity-60">
                        {busy === `submit:${m.lender.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Submit
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[10px] text-muted-foreground">Program Fit compares the application with the criteria stored for that program's policy version, in operational order — no ranking. Apparent or Conditional Fit is not a pre-approval; the lender decides.</p>
      </div>

      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Submissions &amp; decisions</p>
        {domain.deals.length === 0 ? <p className="mt-1 text-xs text-muted-foreground">No submissions yet.</p> : (
          <ul className="mt-2 space-y-2">
            {domain.deals.map((d) => (
              <li key={d.id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-foreground">{d.lender}{d.program && <span className="ml-1 text-muted-foreground">· {d.program}</span>}</p>
                    <p className="text-[10px] text-muted-foreground">${d.amount.toLocaleString()} · {d.status}{d.submittedAt && ` · submitted ${formatDate(d.submittedAt)}`}</p>
                  </div>
                  {canEdit && (
                    <OpsSelect value="" onValueChange={(v) => { if (!v) return; const note = window.prompt("Note (optional)") ?? null; void run(`decide:${d.id}`, () => recordLenderDecision({ dealId: d.id, decision: v as LenderDecisionKind, terms: {}, conditions: null, note }), "Could not record the decision."); }}
                      options={[{ value: "", label: "Record lender decision…" }, ...DECISIONS.map((k) => ({ value: k, label: DECISION_LABELS[k] }))]} disabled={busy !== null} aria-label={`Decision for ${d.lender}`} />
                  )}
                </div>
                {d.decisions.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t border-border/50 pt-2">
                    {d.decisions.map((x) => (
                      <li key={x.id} className="text-[11px] text-foreground">
                        <span className="font-semibold">{DECISION_LABELS[x.decision]}</span> · {formatDateTime(x.decidedAt)} · via {x.source.replace(/_/g, " ")}{x.note && ` — ${x.note}`}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-status-danger">{error}</p>}
    </div>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone: "ok" | "bad" | "review" | "unknown" }) {
  return (
    <span className={cn("inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold",
      tone === "ok" ? "border-emerald-500/30 bg-emerald-500/10 text-status-success"
      : tone === "bad" ? "border-red-500/30 bg-red-500/10 text-red-700"
      : tone === "review" ? "border-amber-500/40 bg-amber-500/10 text-amber-800"
      : "border-border bg-muted text-muted-foreground")}>
      {children}
    </span>
  );
}
