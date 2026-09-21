/**
 * My Work on a phone: one card per thing to do, one tap to open it.
 *
 * Dee's production spec, 2026-09-21 — mobile-first, no desktop table squeezed
 * onto a phone, only personally assigned actionable work, waiting work kept
 * apart, large touch targets, plain due language. The desktop table is
 * unchanged and still renders from `md` up; this is what a phone gets
 * instead.
 *
 * What the list contains is decided in `lib/work/my-work-view.ts`, so the
 * phone and the table can never disagree about what "mine" means.
 */
import { Link } from "react-router-dom";
import { ChevronRight, CircleAlert, Clock, PauseCircle } from "lucide-react";
import { StatusPill } from "@/components/dashboard/DivisionLayout";
import {
  dueLabel, dueTone, GROUP_LABEL, groupMyWork, workHref, type MyWorkGroupKey,
} from "@/lib/work/my-work-view";
import type { WorkItem } from "@/lib/bes-domain";
import { cn } from "@/lib/utils";

const GROUP_TONE: Record<MyWorkGroupKey, string> = {
  overdue: "text-status-danger",
  today: "text-amber-800",
  soon: "text-foreground",
  later: "text-muted-foreground",
  waiting: "text-muted-foreground",
};

const DUE_TONE: Record<string, string> = {
  overdue: "text-status-danger font-semibold",
  today: "text-amber-800 font-semibold",
  soon: "text-foreground",
  later: "text-muted-foreground",
  none: "text-muted-foreground",
};

export function MyWorkCards({
  items, divisionOf, viewMode = "agency",
}: {
  items: readonly WorkItem[];
  /** The division label the page already derives; passed in rather than re-derived. */
  divisionOf: (item: WorkItem) => string;
  viewMode?: "agency" | "organization";
}) {
  const groups = groupMyWork(items);

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.key} aria-label={GROUP_LABEL[group.key]}>
          <h3 className={cn("mb-1.5 flex items-center gap-1.5 px-0.5 text-[11px] font-bold uppercase tracking-wider", GROUP_TONE[group.key])}>
            {group.key === "overdue" && <CircleAlert className="h-3.5 w-3.5" aria-hidden />}
            {group.key === "today" && <Clock className="h-3.5 w-3.5" aria-hidden />}
            {group.key === "waiting" && <PauseCircle className="h-3.5 w-3.5" aria-hidden />}
            {group.label}
            <span className="font-semibold tabular-nums opacity-70">{group.items.length}</span>
          </h3>

          <ul className="space-y-1.5">
            {group.items.map((w) => {
              const href = workHref(w, viewMode);
              const tone = dueTone(w.dueAt);
              /* The whole card is the target — 64px tall, the full width of
                 the screen. A phone is operated with a thumb. */
              const body = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-snug text-foreground">{w.title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                      <StatusPill status={w.stage} />
                      <span className="text-muted-foreground">{divisionOf(w)}</span>
                      <span className={DUE_TONE[tone]}>{dueLabel(w.dueAt)}</span>
                    </span>
                  </span>
                  {href && <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
                </>
              );
              const shell = "flex min-h-[64px] w-full items-start gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left";
              return (
                <li key={w.id}>
                  {href ? (
                    <Link to={href}
                      className={cn(shell, "transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2")}>
                      {body}
                    </Link>
                  ) : (
                    /* No record to open: a card, not a link that leads nowhere. */
                    <div className={shell}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
