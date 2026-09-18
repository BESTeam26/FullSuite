/**
 * The quarter at a glance: what happened, how many, and what it cost.
 *
 * Dee's mockup shows the COUNT and the POINTS together. That pairing is the
 * point — "2 lates" is a fact, "2 lates, −0.50" is the fact and its
 * consequence, which is what somebody is actually deciding about.
 */
import { AlertOctagon, CalendarCheck, Clock, MinusCircle, XCircle } from "lucide-react";
import { POINTS, PERFECT_MONTH_BONUS, type QuarterScore } from "@/lib/attendance/attendance-score";
import { cn } from "@/lib/utils";

const signed = (n: number) => (n === 0 ? "0.00" : `${n > 0 ? "+" : ""}${n.toFixed(2)}`);

export function AttendanceBreakdown({ score }: { score: QuarterScore }) {
  const perfectMonths = score.ledger.filter((l) => l.kind === "perfect_month").length;

  const cells = [
    { icon: Clock, label: "Lates", n: score.counts.late, points: score.counts.late * POINTS.late, tone: "text-amber-600" },
    { icon: MinusCircle, label: "Half days", n: score.counts.half_day, points: score.counts.half_day * POINTS.half_day, tone: "text-amber-700" },
    { icon: XCircle, label: "Absences", n: score.counts.absent, points: score.counts.absent * POINTS.absent, tone: "text-status-danger" },
    { icon: AlertOctagon, label: "NCNS", n: score.counts.ncns, points: score.counts.ncns * POINTS.ncns, tone: "text-status-danger" },
    { icon: CalendarCheck, label: "Perfect months", n: perfectMonths, points: perfectMonths * PERFECT_MONTH_BONUS, tone: "text-status-success" },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-bold text-foreground">Attendance breakdown</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {cells.map((c) => (
          <div key={c.label} className="rounded-xl border border-border px-2 py-3 text-center">
            <c.icon className={cn("mx-auto h-4 w-4", c.n > 0 ? c.tone : "text-muted-foreground")} aria-hidden />
            <p className="mt-1 text-xl font-extrabold tabular-nums text-foreground">{c.n}</p>
            <p className="text-[11px] text-muted-foreground">{c.label}</p>
            <p className={cn("mt-1 rounded-md px-1 py-0.5 text-[11px] font-bold tabular-nums",
              c.points > 0 ? "bg-emerald-500/10 text-emerald-800"
                : c.points < 0 ? "bg-amber-500/10 text-amber-900"
                : "text-muted-foreground")}>
              {signed(c.points)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
