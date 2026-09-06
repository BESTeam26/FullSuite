/**
 * Report date and the bureaus' stated scores — the fields every import asks
 * for once the items are known. Shared by the CSV and PDF imports.
 */
import { REPORT_BUREAUS, hasInvalidScore, type ScoreInputs } from "@/lib/credit-report/report-scores";

const inputCls = "mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground";
const labelCls = "block text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

export function ReportMetaFields({
  pulledAt,
  onPulledAt,
  scores,
  onScores,
  model,
  onModel,
}: {
  pulledAt: string;
  onPulledAt: (v: string) => void;
  scores: ScoreInputs;
  onScores: (v: ScoreInputs) => void;
  model: string;
  onModel: (v: string) => void;
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-5">
        <label className="text-xs text-foreground">
          <span className={labelCls}>Report date</span>
          <input type="date" value={pulledAt} onChange={(e) => onPulledAt(e.target.value)} className={inputCls} />
        </label>
        {REPORT_BUREAUS.map((b) => (
          <label key={b} className="text-xs text-foreground">
            <span className={labelCls}>{b} score (as stated)</span>
            <input inputMode="numeric" value={scores[b]} onChange={(e) => onScores({ ...scores, [b]: e.target.value })} placeholder="optional" className={inputCls} />
          </label>
        ))}
        <label className="text-xs text-foreground">
          <span className={labelCls}>Score model</span>
          <input value={model} onChange={(e) => onModel(e.target.value)} placeholder="e.g. FICO 8" className={inputCls} />
        </label>
      </div>
      {hasInvalidScore(scores) && (
        <p className="text-xs text-status-warning">Scores must be whole numbers between 250 and 900, exactly as the report states them.</p>
      )}
    </>
  );
}
