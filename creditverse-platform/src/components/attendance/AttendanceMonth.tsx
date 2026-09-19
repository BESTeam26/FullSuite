/**
 * The month as a calendar.
 *
 * A list of dates tells you what happened; a calendar tells you the SHAPE of
 * it — whether the lates cluster on Mondays, whether a bad week was one bad
 * week. Same facts, arranged so a pattern is visible without counting.
 */
import { formatDate } from "@/lib/format-date";
import { isViolation, type ActivityRow, type Classification } from "@/lib/attendance/attendance-score";
import { cn } from "@/lib/utils";

const DOTS: { key: string; label: string; className: string }[] = [
  { key: "clean", label: "On time", className: "bg-emerald-600" },
  { key: "leave", label: "Approved leave", className: "bg-blue-500" },
  { key: "violation", label: "Violation", className: "bg-status-danger" },
  { key: "none", label: "No work / off", className: "bg-muted-foreground/30" },
];

const kindOf = (c: Classification | undefined) =>
  !c ? "none" : c === "approved_leave" ? "leave" : isViolation(c) ? "violation" : "clean";

const TONE: Record<string, string> = {
  clean: "bg-emerald-500/15 text-emerald-900",
  leave: "bg-blue-500/15 text-blue-900",
  violation: "bg-status-danger-tint text-status-danger font-bold",
  none: "text-muted-foreground",
};

export function AttendanceMonth({ rows, month, label }: {
  rows: ActivityRow[]; month: string; label: string;
}) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  /* Sunday-first, matching the mockup. */
  const lead = first.getUTCDay();
  const byDay = new Map(rows.map((r) => [r.day, r.classification]));
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-bold text-foreground">This month ({label})</h2>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <span key={d} className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{d}</span>
        ))}
        {Array.from({ length: lead }, (_, i) => <span key={`lead-${i}`} aria-hidden />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const date = `${y}-${pad(m)}-${pad(i + 1)}`;
          const kind = kindOf(byDay.get(date));
          return (
            <span key={date}
              title={`${formatDate(date)} · ${DOTS.find((d) => d.key === kind)?.label}`}
              className={cn("rounded-lg py-1.5 text-xs tabular-nums", TONE[kind])}>
              {i + 1}
            </span>
          );
        })}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        {DOTS.map((d) => (
          <li key={d.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span aria-hidden className={cn("h-2 w-2 rounded-full", d.className)} /> {d.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
