/**
 * The employee's own attendance score.
 *
 * Dee, 2026-09-18: "the employee-facing version should be extremely
 * understandable." So it is the ledger, in Dee's own shape — what you started
 * with, every line that moved it, and what you can still earn:
 *
 *   Attendance Score: 16.5 / 20 · Good Standing
 *   Started Quarter: 15
 *   +1.00 Perfect Attendance · August
 *   -0.25 Late · Sep 8
 *   Next opportunity: Complete September with perfect attendance → +1
 *
 * No chart, no analytics. Somebody should be able to check it in four seconds
 * and know whether they need to do anything.
 */
import { CalendarCheck, TrendingDown, TrendingUp } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import {
  QUARTER_MAX_POINTS, STANDING_ACTION, STANDING_LABEL,
  type QuarterScore, type Standing,
} from "@/lib/attendance/attendance-score";

const TONE: Record<Standing, string> = {
  excellent: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800",
  good: "border-emerald-500/30 bg-emerald-500/5 text-emerald-800",
  coaching: "border-amber-500/40 bg-amber-500/10 text-amber-900",
  improvement_required: "border-amber-500/50 bg-amber-500/15 text-amber-900",
  management_review: "border-destructive/30 bg-status-danger-tint text-status-danger",
};

const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}`;

export function AttendanceScoreCard({ score }: { score: QuarterScore }) {
  const moves = score.ledger.filter((l) => l.kind !== "opening");

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Attendance score · {score.quarter.replace("-", " ")}
          </p>
          <p className="mt-0.5 text-3xl font-extrabold tabular-nums tracking-tight text-foreground">
            {score.score.toFixed(2).replace(/\.00$/, "")}
            <span className="ml-1 text-base font-bold text-muted-foreground">/ {QUARTER_MAX_POINTS}</span>
          </p>
        </div>
        <span className={cn("rounded-full border px-2.5 py-1 text-xs font-bold", TONE[score.standing])}>
          {STANDING_LABEL[score.standing]}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{STANDING_ACTION[score.standing]}</p>

      <ul className="mt-4 space-y-1.5">
        <li className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">Started the quarter</span>
          <span className="font-semibold tabular-nums text-foreground">15</span>
        </li>
        {moves.map((l, i) => (
          <li key={`${l.kind}-${l.day}-${i}`} className="flex items-start justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-start gap-1.5">
              {l.points >= 0
                ? <TrendingUp className="mt-0.5 h-3 w-3 shrink-0 text-status-success" aria-hidden />
                : <TrendingDown className="mt-0.5 h-3 w-3 shrink-0 text-status-warning" aria-hidden />}
              <span className="min-w-0">
                <span className="block text-foreground">
                  {l.label}{l.day && l.kind === "incident" ? ` · ${formatDate(l.day)}` : ""}
                </span>
                {l.detail && <span className="block text-[11px] text-muted-foreground">{l.detail}</span>}
              </span>
            </span>
            <span className={cn("shrink-0 font-semibold tabular-nums",
              l.points >= 0 ? "text-status-success" : "text-foreground")}>
              {signed(l.points)}
            </span>
          </li>
        ))}
        {moves.length === 0 && (
          <li className="py-2 text-xs text-muted-foreground">
            Nothing has moved your score this quarter.
          </li>
        )}
      </ul>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
        <span className="text-xs font-bold text-foreground">Total</span>
        <span className="text-sm font-extrabold tabular-nums text-foreground">
          {score.score.toFixed(2).replace(/\.00$/, "")} / {QUARTER_MAX_POINTS}
        </span>
      </div>

      {score.nextOpportunity && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-border bg-muted/50 px-3 py-2 text-[11px] text-foreground">
          <CalendarCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span><strong>Next opportunity:</strong> {score.nextOpportunity}</span>
        </p>
      )}
    </div>
  );
}
