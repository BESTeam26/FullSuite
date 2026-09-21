/**
 * Where this file is right now — the strip at the top of a credit case.
 *
 * It replaces a five-step progress tracker that was a hardcoded constant:
 * every client, on every screen, was shown "Import ✓ · Choose disputes ✓ ·
 * Build letters (current)" — including a client whose own banner said no
 * credit report had been imported. A tracker that is the same for everybody
 * is not a tracker; it is decoration that people plan around (rule 12).
 *
 * ── THREE STATES, NEVER COLLAPSED INTO ONE ────────────────────────────────
 *
 * Dee's CreditOps queue doctrine (§23) is the whole design here:
 *
 *   actionable internally   BES has work to do now
 *   waiting externally      BES is waiting on a bureau or the client
 *   completed               the work is finished
 *
 * `Round 8 Sent` is waiting, NOT completed. `For Client Confirmation` is
 * waiting, NOT completed. So the strip reads them apart, using the same
 * `department-domain` predicates the queues use — one rule, not a second
 * opinion rendered in a component (rule 9).
 *
 * Two departments may both be live at once, and that is correct: a file can
 * be with Dispute awaiting results while Support works a monitoring issue.
 */
import { AlertCircle, CheckCircle2, CircleDot, Clock3 } from "lucide-react";
import {
  departmentWorkState, isValidDepartmentStatus,
  type DepartmentStatusRow, type DepartmentWorkState,
} from "@/lib/fulfillment/department-domain";
import type { CreditOpsDepartment } from "@/lib/fulfillment/creditops-access";
import { formatTimeAgo } from "@/lib/format-date";
import { cn } from "@/lib/utils";

type Kind = DepartmentWorkState;

const KIND_LABEL: Record<Kind, string> = {
  actionable: "Work to do now",
  waiting: "Waiting on someone outside BES",
  done: "Finished",
};

const KIND_TONE: Record<Kind, string> = {
  actionable: "border-emerald-500/40 bg-emerald-500/5",
  waiting: "border-amber-500/40 bg-amber-500/5",
  done: "border-border bg-muted/30",
};

const KIND_ICON: Record<Kind, typeof CircleDot> = {
  actionable: CircleDot,
  waiting: Clock3,
  done: CheckCircle2,
};

const KIND_ICON_TONE: Record<Kind, string> = {
  actionable: "text-status-success",
  waiting: "text-status-warning",
  done: "text-muted-foreground",
};

/** Actionable first, then waiting, then what is finished. */
const ORDER: Record<Kind, number> = { actionable: 0, waiting: 1, done: 2 };

export function WhereThisFileIs({ rows, loading }: {
  rows: readonly DepartmentStatusRow[];
  loading?: boolean;
}) {
  const sorted = [...rows].sort(
    (a, b) => ORDER[departmentWorkState(a)] - ORDER[departmentWorkState(b)] || a.department.localeCompare(b.department),
  );
  const live = sorted.filter((r) => departmentWorkState(r) !== "done");

  return (
    <section aria-label="Where this file is"
      className="mb-6 rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-foreground">Where this file is</h2>
        <p className="text-xs text-muted-foreground">
          {loading ? "Loading…"
            : live.length === 0
              ? "No department has open work on it."
              : `${live.length} department${live.length === 1 ? "" : "s"} still holding it`}
        </p>
      </div>

      {!loading && sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          This file has never been placed with a department, so nobody is working it.
          Set a department status to put it in a queue.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {sorted.map((r) => {
            const kind = departmentWorkState(r);
            const Icon = KIND_ICON[kind];
            /* The status vocabulary is the Status Guide's. One that is not in
               it still shows — hiding a real row would be worse — but it is
               marked, because a status nothing recognises cannot route work. */
            const known = isValidDepartmentStatus(r.department as CreditOpsDepartment, r.status);
            return (
              <li key={r.department}
                className={cn("rounded-xl border p-3", KIND_TONE[kind])}>
                <div className="flex items-start gap-2">
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", KIND_ICON_TONE[kind])} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-bold text-foreground">{r.department}</span>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {KIND_LABEL[kind]}
                      </span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-foreground">
                      {r.status}
                      {!known && (
                        <span title="This status is not in the CreditOps Status Guide, so no queue can route on it."
                          className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 text-[10px] font-semibold text-amber-900">
                          <AlertCircle className="h-3 w-3" aria-hidden /> unrecognised
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {r.assignee && r.assignee !== "Unassigned" ? r.assignee : "Nobody assigned"}
                      {" · "}updated {formatTimeAgo(r.updatedAt)}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
