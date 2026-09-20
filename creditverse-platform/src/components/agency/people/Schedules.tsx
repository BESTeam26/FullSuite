/**
 * Schedules — what is EXPECTED of each person: days, shift, lunch/break
 * allowance, grace, timezone. Operational workforce information, so a team
 * lead may read and set it.
 *
 * Dee, 2026-09-19: "Schedule is operational workforce information.
 * Compensation is protected financial information." Nothing about money
 * renders here — not a rate, not a derived daily figure. That lives on the
 * Compensation tab behind payroll capability (ArrangementEditor).
 */
import { useState } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { ScheduleEditor } from "@/components/time/ScheduleEditor";
import { useWorkforce } from "@/lib/data/use-workforce";
import { useSchedules } from "@/lib/data/use-people";
import { describeSchedule } from "@/lib/time/schedule-format";

export function Schedules({ onlyUserId }: { onlyUserId?: string } = {}) {
  const wf = useWorkforce();
  const schedules = useSchedules();
  const [editing, setEditing] = useState<string | null>(null);

  const scheduleByUser = new Map((schedules.data ?? []).map((s) => [s.userId, s]));
  /* The profile reuses this exact editor for ONE person — same component,
     same writer, so a schedule has one canonical edit path (§28). */
  const people = (wf.data?.people ?? []).filter((p) => !onlyUserId || p.userId === onlyUserId);

  return (
    <ContentCard title={<span className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-muted-foreground" /> Schedule</span>}>
      {wf.isLoading ? (
        <p className="py-4 text-xs text-muted-foreground"><Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" /> Loading…</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {people.map((p) => {
            const s = scheduleByUser.get(p.userId);
            return (
              <li key={p.userId} className="py-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="min-w-0">
                    {!onlyUserId && <span className="block font-medium text-foreground">{p.name}</span>}
                    <span className="block text-foreground">{describeSchedule(s)}</span>
                  </span>
                  <Button size="sm" variant="outline" className="h-7 text-xs"
                    onClick={() => setEditing(editing === p.userId ? null : p.userId)}>
                    {editing === p.userId ? "Close" : "Edit Schedule"}
                  </Button>
                </div>
                {editing === p.userId && (
                  <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3">
                    <ScheduleEditor userId={p.userId} schedule={s} onSaved={() => setEditing(null)} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </ContentCard>
  );
}
