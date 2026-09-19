/**
 * What actually happened, newest first.
 *
 * Every scheduled day, not only the bad ones: a run of clean days is the
 * evidence that a streak is real, and a list of nothing but violations reads
 * as a charge sheet.
 */
import { CalendarCheck, Clock, MinusCircle, XCircle, AlertOctagon, Plane } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import { LABELS, type ActivityRow, type Classification } from "@/lib/attendance/attendance-score";
import { cn } from "@/lib/utils";

const ICON: Partial<Record<Classification, typeof Clock>> = {
  late: Clock, half_day: MinusCircle, absent: XCircle, ncns: AlertOctagon,
  approved_leave: Plane, on_time: CalendarCheck, grace: CalendarCheck,
};

const TITLE: Partial<Record<Classification, string>> = { on_time: "Perfect day", grace: "Perfect day" };

export function AttendanceActivity({ rows, limit = 8 }: { rows: ActivityRow[]; limit?: number }) {
  const shown = rows.slice(0, limit);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-bold text-foreground">Recent attendance activity</h2>
      {shown.length === 0 ? (
        <p className="py-6 text-xs text-muted-foreground">Nothing recorded this quarter yet.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Details</th>
                <th className="py-2 text-right">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {shown.map((r) => {
                const Icon = ICON[r.classification] ?? CalendarCheck;
                const clean = r.points === 0;
                return (
                  <tr key={r.day}>
                    <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{formatDate(r.day)}</td>
                    <td className="py-2 pr-3">
                      <span className="flex items-center gap-1.5 font-semibold text-foreground">
                        <Icon className={cn("h-3.5 w-3.5 shrink-0",
                          clean ? "text-status-success" : "text-amber-600")} aria-hidden />
                        {TITLE[r.classification] ?? LABELS[r.classification]}
                      </span>
                      {/* Dee: "Do not hide where the decision came from." */}
                      {r.source === "corrected" && (
                        <span className="mt-0.5 inline-block rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-800">
                          Corrected
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {r.detail}
                      {/* Dee: "Do not make deductions disappear mysteriously."
                          The original stands in the line above it. */}
                      {r.correction && (
                        <span className="block text-[11px]">
                          Was {LABELS[r.originalClassification ?? "none"].toLowerCase()}
                          {" · "}{r.correction.by} — “{r.correction.reason}”
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
                        r.points < 0 ? "bg-amber-500/10 text-amber-900" : "text-muted-foreground")}>
                        {r.points.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
