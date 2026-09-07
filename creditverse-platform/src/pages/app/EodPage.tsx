/**
 * End of Day — written by the system, confirmed by the person.
 *
 * The employee does not retype their day. Tasks completed, tasks moved, files
 * worked, actions ticked, time recorded, what is overdue and what is blocked
 * all come from the canonical records. They add only what the system cannot
 * know: why something stalled, what help they need, what tomorrow looks like.
 *
 * Submission is honest about itself. A person submitting is named; the system
 * submitting at the cutoff names nobody and says so. The value of an EOD is
 * that somebody stood behind it, and a report that forges that signature has
 * destroyed the only thing it was measuring.
 */
import { useEffect, useState } from "react";
import {
  AlertTriangle, CalendarClock, CheckCircle2, CircleSlash, Clock,
  Loader2, Send, Timer,
} from "lucide-react";
import { HqPageShell } from "@/pages/app/HqPages";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EodProductionSummary } from "@/components/agency/EodProductionSummary";
import { useAuth } from "@/lib/auth/auth-context";
import { useEodActivity, useEodDay, useSaveEod, todayLocal } from "@/lib/data/use-eod-day";
import { SUBMISSION_LABEL, submissionKind, type EodNotes } from "@/lib/data/eod-day";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

const NOTE_FIELDS: { key: keyof EodNotes; label: string; placeholder: string }[] = [
  { key: "additionalNotes", label: "Accomplishments not shown above", placeholder: "Anything you did that is not a task or a file — a call, a fix, helping someone." },
  { key: "blockers", label: "Blockers and issues", placeholder: "What is in your way?" },
  { key: "escalations", label: "Help needed", placeholder: "What do you need from someone else?" },
  { key: "unfinishedWork", label: "Carryover", placeholder: "What is not finished and moves to tomorrow?" },
  { key: "nextWorkdayPriority", label: "Tomorrow's priorities", placeholder: "What comes first tomorrow?" },
];

function Count({ icon: Icon, label, value, tone }: { icon: typeof Clock; label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-1.5">
        <Icon className={cn("h-3.5 w-3.5", tone ?? "text-muted-foreground")} />
        <span className="text-lg font-bold text-foreground">{value}</span>
      </div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

export const EodPage = () => {
  const { user } = useAuth();
  const date = todayLocal();
  const activity = useEodActivity(date);
  const day = useEodDay(date);
  const save = useSaveEod(date);

  const [notes, setNotes] = useState<EodNotes>({});
  const [dirty, setDirty] = useState(false);

  /* Load the person's own words once; never overwrite what they are typing. */
  useEffect(() => {
    if (!day.data || dirty) return;
    setNotes({
      unfinishedWork: day.data.unfinishedWork ?? "",
      blockers: day.data.blockers ?? "",
      escalations: day.data.escalations ?? "",
      additionalNotes: day.data.additionalNotes ?? "",
      nextWorkdayPriority: day.data.nextWorkdayPriority ?? "",
    });
  }, [day.data, dirty]);

  const a = activity.data;
  const kind = day.data ? submissionKind(day.data) : "not_submitted";
  const submitted = kind !== "not_submitted";

  return (
    <HqPageShell
      title="End of Day"
      description="Built from today's work. Add what the system cannot see, then submit."
      icon={Timer}
    >
      {/* What the submission actually is. Never blurred. */}
      <div className={cn(
        "mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3",
        kind === "submitted_by_person" ? "border-emerald-500/30 bg-emerald-500/5"
          : kind === "auto_submitted" ? "border-amber-500/40 bg-amber-500/5"
          : "border-border bg-card",
      )}>
        <div>
          <p className="text-sm font-semibold text-foreground">
            {formatDate(date)} · {SUBMISSION_LABEL[kind]}
          </p>
          {kind === "auto_submitted" && (
            <p className="text-xs text-amber-700">
              Nobody submitted this before the cutoff, so the system submitted what it had.
              It is not recorded as your submission.
            </p>
          )}
          {day.data?.submittedAt && (
            <p className="text-xs text-muted-foreground">Submitted {formatDate(day.data.submittedAt)}</p>
          )}
        </div>
        <Button
          onClick={() => { void save.mutateAsync({ notes, submit: true }).then(() => setDirty(false)); }}
          disabled={save.isPending || !user}
          variant={submitted ? "secondary" : "default"}
        >
          {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
          {submitted ? "Re-submit with my changes" : "Submit EOD"}
        </Button>
      </div>

      {activity.isLoading || !a ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Building today's report…
        </p>
      ) : (
        <div className="space-y-4">
          <ContentCard title="Today's production">
            <EodProductionSummary activity={a} />
          </ContentCard>

          <ContentCard title="Today's tasks">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Count icon={CheckCircle2} label="Completed" value={a.completed.length} tone="text-status-success" />
              <Count icon={Clock} label="Worked on" value={a.worked.length} />
              <Count icon={CalendarClock} label="In progress" value={a.inProgress.length} />
              <Count icon={AlertTriangle} label="Overdue" value={a.overdue.length} tone="text-status-danger" />
              <Count icon={CircleSlash} label="Blocked" value={a.blocked.length} tone="text-amber-600" />
              <Count icon={Timer} label="Minutes logged" value={a.minutesLogged} />
            </div>

            {a.completed.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Completed today</p>
                <ul className="space-y-0.5">
                  {a.completed.map((t) => (
                    <li key={t.id} className="flex items-center gap-1.5 text-sm text-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-status-success" /> {t.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {a.blocked.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Blocked</p>
                <ul className="space-y-0.5">
                  {a.blocked.map((t) => (
                    <li key={t.id} className="text-sm text-foreground">
                      {t.title} <span className="text-muted-foreground">— {t.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </ContentCard>

          <ContentCard title="What the system cannot see">
            <div className="space-y-3">
              {NOTE_FIELDS.map((f) => (
                <label key={f.key} className="block">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{f.label}</span>
                  <Textarea
                    rows={2}
                    className="mt-1"
                    value={(notes[f.key] as string) ?? ""}
                    onChange={(e) => { setDirty(true); setNotes((n) => ({ ...n, [f.key]: e.target.value })); }}
                    onBlur={() => { if (dirty) void save.mutateAsync({ notes, submit: false }); }}
                    placeholder={f.placeholder}
                    aria-label={f.label}
                  />
                </label>
              ))}
              <p className="text-xs text-muted-foreground">
                Saved as you go. Submitting records who submitted it and when.
              </p>
            </div>
          </ContentCard>
        </div>
      )}
    </HqPageShell>
  );
};
