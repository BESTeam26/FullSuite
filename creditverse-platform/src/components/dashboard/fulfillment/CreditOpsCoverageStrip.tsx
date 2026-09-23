import { cn } from "@/lib/utils";
import {
  COVERAGE_STATES,
  summariseCoverage,
  type CoverageRow,
  type CoverageState,
} from "@/lib/data/use-creditops-coverage";

/**
 * Is every client being taken care of, and where is it going wrong?
 *
 * Dee's coverage design, 2026-09-23. Four failure states, counted apart
 * because they need different actions — nobody holds it (assign or staff),
 * the owner is away (reassign), somebody holds it and it is late (follow up).
 * A single "problem files" number would hide which of the three you have.
 *
 * Every card filters the list beneath it. The count and the rows come from one
 * answer, so a card reading 13 shows thirteen rows.
 */
export function CreditOpsCoverageStrip({
  rows,
  loading,
  active,
  onPick,
  unstaffed,
}: {
  rows: readonly CoverageRow[];
  loading: boolean;
  active: CoverageState | null;
  onPick: (state: CoverageState | null) => void;
  /** Departments with no agent at all — NOT departments with nothing assigned. */
  unstaffed: readonly string[];
}) {
  const { total, queues } = summariseCoverage(rows);

  if (loading) {
    return (
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5" aria-busy="true" aria-label="Loading coverage">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card px-3 py-2">
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            <div className="mt-1.5 h-6 w-10 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  /* Nothing actionable at all is a fact worth stating plainly rather than five
     zeroes, which read like a screen that failed to load. */
  if (total.active === 0) {
    return (
      <p className="mb-3 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        No actionable CreditOps work right now — nothing is waiting on anybody.
      </p>
    );
  }

  const tone: Record<CoverageState, string> = {
    unassigned: "text-status-danger",
    owner_away: "text-status-warning",
    overdue: "text-status-danger",
    on_track: "text-status-success",
  };

  return (
    <section aria-label="CreditOps coverage" className="mb-3 space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {/* Active work is the denominator, not a state — it does not filter. */}
        <div className="rounded-lg border border-border bg-card px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Active work</p>
          <p className="mt-0.5 text-lg font-bold text-foreground">{total.active}</p>
        </div>

        {COVERAGE_STATES.map((s) => {
          const n = total[s.id];
          const on = active === s.id;
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={on}
              /* A zero is not worth clicking — filtering to nothing looks like
                 a broken screen. It still shows, because "0 unassigned" is the
                 reassuring half of this strip. */
              disabled={n === 0}
              title={n === 0 ? `${s.label}: none` : s.hint}
              onClick={() => onPick(on ? null : s.id)}
              className={cn(
                "rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "border-primary bg-primary/10" : "border-border bg-card",
                n === 0 ? "cursor-default opacity-60" : "hover:border-primary/50 hover:bg-muted/50",
              )}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{s.label}</p>
              <p className={cn("mt-0.5 text-lg font-bold", n === 0 ? "text-muted-foreground" : tone[s.id])}>{n}</p>
            </button>
          );
        })}
      </div>

      {/* Per queue, worst first. */}
      <div className="flex flex-wrap gap-2">
        {queues.map((q) => {
          const clean = q.unassigned === 0 && q.owner_away === 0 && q.overdue === 0;
          return (
            <div
              key={q.department}
              className="min-w-[10rem] flex-1 rounded-lg border border-border bg-card px-3 py-2"
            >
              <p className="text-xs font-bold text-foreground">{q.department}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {q.active} active
                {clean ? (
                  <span className="text-status-success"> · all on track</span>
                ) : (
                  <>
                    {q.unassigned > 0 && <span className="text-status-danger"> · {q.unassigned} unassigned</span>}
                    {q.owner_away > 0 && <span className="text-status-warning"> · {q.owner_away} owner away</span>}
                    {q.overdue > 0 && <span className="text-status-danger"> · {q.overdue} overdue</span>}
                  </>
                )}
              </p>
              {/* Asked of the ROSTER, not of the files. This first read
                  "every file here is unassigned", which labelled Complaints —
                  three agents, one file waiting for the hourly sweep — as
                  having no staff. That is worse than no label: it points at
                  the wrong fix. Bureau Calling is the real case, and Dee has
                  said it is the fourth department and not active yet, so it is
                  stated here once rather than alerted daily. */}
              {unstaffed.includes(q.department) && (
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-status-warning">
                  No active staff
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
