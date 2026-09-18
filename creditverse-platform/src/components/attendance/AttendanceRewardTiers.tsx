/**
 * The ladder, with what each rung pays.
 *
 * Dee: "The points determine the achievement, and the achievement determines
 * the reward." So the reward is never separated from the band — a band on its
 * own is a label, and a label changes nobody's morning.
 */
import {
  STANDING_ACTION, STANDING_BADGE, STANDING_BANDS, STANDING_LABEL,
  type Standing,
} from "@/lib/attendance/attendance-score";
import { cn } from "@/lib/utils";

const ROW: Record<Standing, string> = {
  champion: "border-amber-500/40 bg-amber-500/10",
  excellent: "border-emerald-500/30 bg-emerald-500/5",
  good: "border-emerald-500/20 bg-emerald-500/5",
  coaching: "border-amber-500/30 bg-amber-500/5",
  improvement: "border-amber-500/40 bg-amber-500/10",
  review: "border-destructive/25 bg-status-danger-tint",
};

export function AttendanceRewardTiers({ current }: { current: Standing }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-bold text-foreground">Attendance reward tiers</h2>
      <ul className="mt-3 space-y-1.5">
        {STANDING_BANDS.map((b) => {
          const mine = b.standing === current;
          return (
            <li key={b.standing}
              className={cn("flex items-start gap-2.5 rounded-xl border px-3 py-2",
                ROW[b.standing], mine && "ring-2 ring-primary/40")}>
              <span aria-hidden className="text-base leading-none">{STANDING_BADGE[b.standing]}</span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="text-xs font-bold text-foreground">
                    {STANDING_LABEL[b.standing]}
                  </span>
                  <span className="shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground">
                    {b.from === b.to ? b.from : `${b.from} – ${b.to}`}
                  </span>
                </span>
                <span className="block text-[11px] leading-snug text-muted-foreground">
                  {STANDING_ACTION[b.standing]}
                </span>
              </span>
              {mine && (
                <span className="shrink-0 self-center rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-foreground">
                  You
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
