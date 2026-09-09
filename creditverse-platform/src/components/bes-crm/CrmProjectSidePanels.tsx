import { useState } from "react";
import { CheckCircle2, Circle, Flag, Inbox, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format-date";
import {
  useCompleteMilestone,
  useCrmClientRequirements,
  useCrmMilestones,
  useSatisfyRequirement,
} from "@/lib/data/use-crm";
import { cn } from "@/lib/utils";

/**
 * The milestone rail: the layer the old ClickUp template kept as statuses.
 *
 * Most milestones complete THEMSELVES when their work unit does — those show
 * a lock on causality rather than a checkbox, because ticking "Website Ready"
 * while the website work is open is exactly the lie the derived model exists
 * to prevent. Only an event with no unit — a presentation, a training
 * session — is anybody's to tick.
 */
export const CrmMilestonesPanel = ({
  projectId,
  isBes,
}: {
  projectId: string;
  isBes: boolean;
}) => {
  const milestones = useCrmMilestones(projectId);
  const complete = useCompleteMilestone(projectId);
  const rows = (milestones.data ?? []).filter((m) => isBes || m.clientVisible);

  if (milestones.isLoading) {
    return <div className="h-24 rounded-xl border border-border bg-card" aria-busy="true" />;
  }
  if (rows.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-3">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Flag className="h-3.5 w-3.5" /> Milestones
      </h3>
      <ul className="space-y-1.5">
        {rows.map((m) => {
          const done = m.completedAt !== null;
          const manual = m.workItemId === null;
          return (
            <li key={m.id} className="flex items-start gap-2 text-xs">
              {done ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-success" />
              ) : (
                <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1">
                <span className={cn("block text-foreground", done && "text-muted-foreground line-through")}>
                  {m.label}
                </span>
                <span className="block text-[10px] text-muted-foreground">
                  {done
                    ? `Done ${formatDate(m.completedAt)}`
                    : manual
                      ? m.scheduledAt
                        ? `Scheduled ${formatDate(m.scheduledAt)}`
                        : "Not scheduled"
                      : "Completes with its work"}
                </span>
              </span>
              {isBes && !done && manual && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 shrink-0 px-2 text-[10px]"
                  disabled={complete.isPending}
                  onClick={() => complete.mutate({ id: m.id })}
                >
                  Mark done
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {complete.error && (
        <p className="mt-1 text-[10px] text-status-danger">{(complete.error as Error).message}</p>
      )}
    </section>
  );
};

/**
 * What the client still owes. §17: waiting on the client is expected, not an
 * exception — this panel is where that waiting is visible and where delivery
 * is recorded, and the auto-start rule in the database decides what work that
 * releases.
 */
export const CrmClientRequirementsPanel = ({
  projectId,
  isBes,
}: {
  projectId: string;
  isBes: boolean;
}) => {
  const requirements = useCrmClientRequirements(projectId);
  const satisfy = useSatisfyRequirement(projectId);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [released, setReleased] = useState<string | null>(null);

  const rows = requirements.data ?? [];
  if (requirements.isLoading) {
    return <div className="h-24 rounded-xl border border-border bg-card" aria-busy="true" />;
  }
  if (rows.length === 0) return null;

  const open = rows.filter((r) => !r.satisfiedAt);

  const deliver = (id: string) => {
    satisfy.mutate(
      { id, note: note.trim() || null },
      {
        onSuccess: (unblocked) => {
          setNoteFor(null);
          setNote("");
          setReleased(
            unblocked > 0
              ? `${unblocked} piece${unblocked === 1 ? "" : "s"} of work can now start.`
              : "Recorded. Nothing was waiting on it.",
          );
        },
      },
    );
  };

  return (
    <section className="rounded-xl border border-border bg-card p-3">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Inbox className="h-3.5 w-3.5" /> Needed from the client
        {open.length > 0 && (
          <span className="rounded-full bg-amber-500/10 px-1.5 text-[10px] font-bold text-status-warning">
            {open.length}
          </span>
        )}
      </h3>
      <ul className="space-y-1.5">
        {rows.map((r) => {
          const done = r.satisfiedAt !== null;
          return (
            <li key={r.id} className="text-xs">
              <div className="flex items-start gap-2">
                {done ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-success" />
                ) : (
                  <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning" />
                )}
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-foreground", done && "text-muted-foreground line-through")}>
                    {r.label}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    {done
                      ? `Received ${formatDate(r.satisfiedAt)}${r.satisfiedNote ? ` — ${r.satisfiedNote}` : ""}`
                      : r.blocking > 0
                        ? `Holding up ${r.blocking} piece${r.blocking === 1 ? "" : "s"} of work`
                        : "Nothing waiting on it yet"}
                  </span>
                </span>
                {isBes && !done && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 shrink-0 px-2 text-[10px]"
                    onClick={() => setNoteFor(noteFor === r.id ? null : r.id)}
                  >
                    Received
                  </Button>
                )}
              </div>
              {noteFor === r.id && (
                <div className="mt-1.5 space-y-1.5 rounded-lg bg-muted/40 p-2">
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder="What arrived, and where it is."
                    className="text-xs"
                  />
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setNoteFor(null)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      disabled={satisfy.isPending}
                      onClick={() => deliver(r.id)}
                    >
                      {satisfy.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      Record delivery
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {/* What the delivery released — said in words, so the person who chased
          the client sees the effect of the chase. */}
      <div aria-live="polite">
        {released && <p className="mt-1.5 text-[10px] text-status-success">{released}</p>}
      </div>
      {satisfy.error && (
        <p className="mt-1 text-[10px] text-status-danger">{(satisfy.error as Error).message}</p>
      )}
    </section>
  );
};
