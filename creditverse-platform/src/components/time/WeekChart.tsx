/**
 * The week as seven bars.
 *
 * Every day is drawn even at zero, so the chart does not rearrange itself as
 * the week fills. Days that have not happened are flat and unlabelled rather
 * than absent — "no hours on Sunday yet" and "no hours on Sunday" look
 * identical otherwise.
 */
import { formatDuration } from "@/lib/time-domain";
import { cn } from "@/lib/utils";
import type { DayBar } from "@/lib/time/my-time-view";

export function WeekChart({ bars, today }: { bars: DayBar[]; today: string }) {
  /* Scaled against the busiest day, with a floor so a single short day does
     not render as a full-height bar and read as a full shift. */
  const peak = Math.max(...bars.map((b) => b.minutes), 8 * 60);

  return (
    <div className="flex items-end justify-between gap-2" role="img"
      aria-label={bars.map((b) => `${b.label} ${b.minutes > 0 ? formatDuration(b.minutes) : "nothing"}`).join(", ")}>
      {bars.map((b) => (
        <div key={b.date} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
            {b.minutes > 0 ? formatDuration(b.minutes) : b.future ? "" : "—"}
          </span>
          <div className="flex h-24 w-full items-end">
            <div
              className={cn("w-full rounded-t-md transition-[height]",
                b.minutes === 0 ? "bg-muted"
                  : b.date === today ? "bg-emerald-600"
                  : "bg-emerald-500/70")}
              style={{ height: `${Math.max((b.minutes / peak) * 100, b.minutes > 0 ? 6 : 3)}%` }}
            />
          </div>
          <span className={cn("text-[11px]",
            b.date === today ? "font-bold text-foreground" : "text-muted-foreground")}>
            {b.label}
          </span>
        </div>
      ))}
    </div>
  );
}
