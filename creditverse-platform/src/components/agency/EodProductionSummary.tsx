/**
 * What the day's production actually was — in words a manager does not have to
 * decode.
 *
 * "1 Total Units Completed" made everybody translate "unit" into something
 * real. It says two things now, because there are two facts:
 *
 *     1 File Worked
 *     9 Actions Completed
 *
 * One file is one production unit however many actions it held. The actions
 * are what happened inside it. Adding them together would make an agent who
 * worked one deep file look like an agent who worked nine shallow ones, and
 * showing only the unit count loses what was done.
 */
import { useState } from "react";
import { ChevronRight, CheckCircle2, FileText } from "lucide-react";
import type { EodActivity } from "@/lib/data/eod-day";
import { cn } from "@/lib/utils";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function EodProductionSummary({ activity }: { activity: EodActivity }) {
  const [openFile, setOpenFile] = useState<string | null>(null);

  if (activity.filesWorked === 0 && activity.actionsCompleted === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No production recorded today. Completing a file adds it here automatically.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* The two headline numbers, side by side and never summed. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-2xl font-black text-foreground">{activity.filesWorked}</p>
          <p className="text-sm font-semibold text-foreground">
            {activity.filesWorked === 1 ? "File Worked" : "Files Worked"}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            One file is one production unit.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-2xl font-black text-foreground">{activity.actionsCompleted}</p>
          <p className="text-sm font-semibold text-foreground">
            {activity.actionsCompleted === 1 ? "Action Completed" : "Actions Completed"}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            What was done inside those files.
          </p>
        </div>
      </div>

      {/* Per department, in the same two terms. */}
      {activity.byDepartment.length > 0 && (
        <ul className="space-y-1">
          {activity.byDepartment.map((d) => (
            <li key={d.department} className="flex items-baseline gap-2 text-sm">
              <span className="font-semibold text-foreground">{d.department}:</span>
              <span className="text-muted-foreground">
                {plural(d.files, "file")} • {plural(d.actions, "action")}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* How often each action was ticked across the day. */}
      {activity.actionBreakdown.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Action breakdown
          </p>
          <ul className="space-y-0.5">
            {activity.actionBreakdown.map((a) => (
              <li key={a.action} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-foreground">{a.action}</span>
                <span className="font-semibold tabular-nums text-muted-foreground">{a.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The transparency the checkboxes were designed for. */}
      {activity.files.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Work behind these totals
          </p>
          <ul className="divide-y divide-border/50 rounded-lg border border-border">
            {activity.files.map((f) => {
              const open = openFile === f.id;
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenFile(open ? null : f.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  >
                    <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{f.subject}</span>
                      {/* Say what the name IS. "Bryan Rodriguez · Onboarding"
                          reads as a teammate doing onboarding; it is the
                          CLIENT whose file was worked, and a manager scanning
                          a team EOD must not mistake clients for staff. */}
                      <span className="block text-[11px] text-muted-foreground">
                        Client file{f.department ? ` · ${f.department}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {plural(f.action_count, "action")}
                    </span>
                  </button>
                  {open && (
                    <div className="border-t border-border/50 bg-muted/30 px-3 py-2 pl-9">
                      {f.actions.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No actions were recorded on this file.</p>
                      ) : (
                        <ul className="space-y-0.5">
                          {f.actions.map((a) => (
                            <li key={a} className="flex items-center gap-1.5 text-sm text-foreground">
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-status-success" /> {a}
                            </li>
                          ))}
                        </ul>
                      )}
                      {f.resulting_status && (
                        <p className="mt-1.5 text-xs text-muted-foreground">Moved to <span className="font-medium text-foreground">{f.resulting_status}</span></p>
                      )}
                      {f.notes && <p className="mt-1 text-xs italic text-muted-foreground">{f.notes}</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
