/**
 * Today, in the order it happened.
 *
 * Replaces a seven-column table of the whole week. The week is still readable
 * in full further down; what somebody checks twenty times a day is "what have
 * I logged since this morning", and a table row does not answer that at a
 * glance.
 *
 * "Request adjustment" stays the only way to change a recorded entry. An agent
 * never edits their own time — a lead approves it (timer governance).
 */
import { Coffee, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";
import { divisionLabel, formatDuration } from "@/lib/time-domain";
import type { TimelineRow } from "@/lib/time/my-time-view";
import type { ReactNode } from "react";

export function TodayTimeline({
  rows, partnerNameOf, action,
}: {
  rows: TimelineRow[];
  partnerNameOf: (id: string | null) => string | null;
  /** The adjustment control, passed in so this stays presentational. */
  action: (row: TimelineRow) => ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Nothing tracked today yet. Start a timer and it appears here.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border/60">
      {rows.map(({ entry, span, minutes, running }) => {
        const rest = entry.kind !== "work";
        const partner = partnerNameOf(entry.partnerGroupId ?? null);
        return (
          <li key={entry.id}
            className={cn("flex items-start gap-3 py-3", running && "-mx-2 rounded-xl bg-emerald-500/5 px-2")}>
            <div className="w-36 shrink-0">
              <p className={cn("text-xs font-semibold tabular-nums",
                running ? "text-status-success" : "text-foreground")}>
                {span}
              </p>
              <p className="text-[11px] tabular-nums text-muted-foreground">{formatDuration(minutes)}</p>
            </div>

            <span aria-hidden className={cn(
              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              rest ? "bg-amber-500/10 text-amber-700" : "bg-emerald-500/10 text-emerald-700")}>
              {entry.kind === "lunch" ? <UtensilsCrossed className="h-4 w-4" />
                : entry.kind === "break" ? <Coffee className="h-4 w-4" />
                : <span className="text-[11px] font-bold">{divisionLabel(entry.divisionId).slice(0, 2)}</span>}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {rest ? (entry.kind === "lunch" ? "Lunch" : "Break")
                  : (entry.taskNote?.trim() || divisionLabel(entry.divisionId))}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {rest ? "Counted as rest, not worked time"
                  : [partner, divisionLabel(entry.divisionId)].filter(Boolean).join(" · ")}
              </p>
              {entry.autoStopped && (
                /* The system stopped this at the cap; the agent may not have
                   been working the whole span, and the row says so rather than
                   passing the cap off as a shift. */
                <span className="mt-1 inline-block rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-status-warning">
                  auto-stopped at the cap
                </span>
              )}
            </div>

            <div className="shrink-0">{action({ entry, span, minutes, running })}</div>
          </li>
        );
      })}
    </ul>
  );
}
