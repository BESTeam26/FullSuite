/**
 * People & Teams → Time Off: requests waiting on a decision.
 *
 * A request is decided by a lead of the requester's team, or by management —
 * never by the person who made it (the database refuses). The decision goes
 * back to them with the decider's name on it.
 */
import { LeaveQueue } from "@/components/agency/people/AttendanceAndLeave";

export function TeamTimeOff() {
  return (
    <div className="space-y-3">
      <LeaveQueue />
      <p className="rounded-xl border border-border bg-card px-4 py-3 text-[11px] text-muted-foreground">
        A request is decided by a lead of the requester&apos;s team, or by management — never
        by the person who made it. The decision is sent back to them with your name on it.
      </p>
    </div>
  );
}
