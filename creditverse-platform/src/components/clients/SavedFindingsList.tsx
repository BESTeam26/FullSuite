/**
 * Findings a person saved to the client record, each with its disposition —
 * the human decision the engine never makes. Setting a disposition records
 * who decided, when and why; nothing here creates a dispute.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { OpsSelect } from "@/components/ui/ops-select";
import { errorMessage } from "@/lib/data/error-message";
import { FINDING_DISPOSITION_LABEL, setFindingDisposition, type FindingDisposition, type SavedFinding } from "@/lib/data/report-findings";
import { useClientFindings, useInvalidateFindings } from "@/lib/data/use-report-findings";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

const OPTIONS = (Object.entries(FINDING_DISPOSITION_LABEL) as [FindingDisposition, string][]).map(([value, label]) => ({ value, label }));
const TONE: Record<string, string> = { confirmed: "border-red-500/30 bg-red-500/10 text-red-700", dismissed: "border-border bg-muted text-muted-foreground", needs_evidence: "border-amber-500/40 bg-amber-500/10 text-amber-800", escalated: "border-purple-500/30 bg-purple-500/10 text-purple-700" };

export function SavedFindingsList({ clientId, canReview, actorId }: { clientId: string; canReview: boolean; actorId: string | null }) {
  const saved = useClientFindings(clientId);
  const invalidate = useInvalidateFindings();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const rows = saved.data ?? [];
  if (!saved.isLoading && rows.length === 0) return null;

  const decide = async (f: SavedFinding, disposition: FindingDisposition) => {
    if (!actorId) return;
    setBusy(f.id); setError(null);
    try { await setFindingDisposition(f.id, disposition, reasons[f.id]?.trim() || null, actorId); invalidate(clientId); } catch (e) { setError(errorMessage(e, "Could not record the decision.")); } finally { setBusy(null); }
  };
  const open = rows.filter((r) => r.humanDisposition === null);

  return (
    <div className="mt-3 rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Saved findings · {rows.length}{open.length > 0 && <span className="ml-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">{open.length} awaiting a decision</span>}</p>
        {saved.isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      <ul className="mt-2 divide-y divide-border/60">
        {rows.map((f) => (
          <li key={f.id} className="py-2 text-xs">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-foreground">{f.observation}</p>
                <p className="text-[10px] text-muted-foreground">Rule {f.ruleId} v{f.ruleVersion} · account {f.accountRef} · saved {formatDate(f.createdAt)}{f.reviewedAt && ` · decided ${formatDate(f.reviewedAt)}`}{f.reviewerReason && ` · "${f.reviewerReason}"`}</p>
              </div>
              {f.humanDisposition ? (
                <span className={cn("inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold", TONE[f.humanDisposition])}>{FINDING_DISPOSITION_LABEL[f.humanDisposition].split(" — ")[0]}</span>
              ) : canReview && actorId ? (
                <div className="flex w-full flex-col gap-1 sm:w-80">
                  <input value={reasons[f.id] ?? ""} onChange={(e) => setReasons((r) => ({ ...r, [f.id]: e.target.value }))} placeholder="Reason (what evidence, or why dismissed)" className="w-full rounded-lg border border-border bg-card px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  <div className="flex items-center gap-2">
                    <OpsSelect value="" onValueChange={(v) => void decide(f, v as FindingDisposition)} options={OPTIONS} placeholder="Record a decision…" aria-label="Finding disposition" />
                    {busy === f.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  </div>
                </div>
              ) : <span className="text-[10px] text-muted-foreground">Awaiting a decision</span>}
            </div>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-2 text-xs text-status-danger">{error}</p>}
    </div>
  );
}
