/**
 * What a team lead sees.
 *
 * Dee, 2026-09-18: "For Team Leads, I would show Score + violations +
 * patterns, not a complicated analytics dashboard."
 *
 * So exactly that: the number, the counts, and how close a pattern is to
 * needing a conversation. The alert is the point — the POINTS never deepen
 * with repetition, so the only way repetition becomes visible is here.
 */
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LATES_FOR_COACHING, QUARTER_MAX_POINTS, STANDING_LABEL, type QuarterScore,
} from "@/lib/attendance/attendance-score";

export function AttendanceSummary({ score }: { score: QuarterScore }) {
  const rows: { label: string; value: number }[] = [
    { label: "Lates", value: score.counts.late },
    { label: "Half days", value: score.counts.half_day },
    { label: "Absences", value: score.counts.absent },
    { label: "NCNS", value: score.counts.ncns },
    { label: "Approved leave", value: score.counts.approved_leave },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm font-extrabold tabular-nums text-foreground">
        {score.score.toFixed(2).replace(/\.00$/, "")} / {QUARTER_MAX_POINTS}
        <span className="ml-2 text-xs font-semibold text-muted-foreground">
          {STANDING_LABEL[score.standing]}
        </span>
      </p>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-2 sm:block">
            <dt className="text-[11px] text-muted-foreground">{r.label}</dt>
            <dd className={cn("text-sm font-bold tabular-nums",
              r.value > 0 && r.label !== "Approved leave" ? "text-foreground" : "text-muted-foreground")}>
              {r.value}
            </dd>
          </div>
        ))}
      </dl>

      {score.alerts.map((a) => (
        <p key={a.kind} role="status"
          className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px]",
            a.kind === "management"
              ? "border-destructive/30 bg-status-danger-tint text-status-danger"
              : "border-amber-500/40 bg-amber-500/10 text-amber-900")}>
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span><strong>{a.title}.</strong> {a.detail}</span>
        </p>
      ))}

      {score.alerts.length === 0 && score.latesInWindow > 0 && (
        /* "2 of 3" — the point of separating points from patterns is that
           somebody can see a conversation coming before it arrives. */
        <p className="text-[11px] text-muted-foreground">
          ⚠ {score.latesInWindow} of {LATES_FOR_COACHING} lates toward a coaching alert.
        </p>
      )}
    </div>
  );
}
