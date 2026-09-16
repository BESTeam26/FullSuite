/**
 * A Team Lead's decision on somebody's report.
 *
 * Dee, 2026-09-16: *"Actions: Mark Reviewed, Needs Follow-up, Add TL Note. Do
 * not make the employee wait for TL approval before the submission itself
 * counts as submitted. Review is a separate state."*
 *
 * So nothing here can touch whether the report is SUBMITTED. These move it
 * along the review axis only, and the wording is careful about that: a report
 * awaiting review is not an incomplete report, it is a complete report nobody
 * has read yet.
 *
 * The note is optional on Reviewed and effectively required on Needs
 * follow-up, because "I have a question" without the question is a round trip
 * somebody has to chase.
 */
import { useState } from "react";
import { CheckCircle2, Loader2, MessageCircleQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format-date";
import { useReviewEod } from "@/lib/data/use-eod-day";

export function EodReviewActions({
  eodId, employeeId, employeeName, date, state, reviewedAt, reviewerName, reviewNote,
}: {
  eodId: string;
  employeeId: string;
  employeeName: string;
  date: string;
  state: string;
  reviewedAt: string | null;
  reviewerName: string | null;
  reviewNote: string | null;
}) {
  const review = useReviewEod(date);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busy = review.isPending;

  const decide = (decision: "reviewed" | "needs_clarification") => {
    setError(null);
    review.mutate(
      { eodId, employeeId, decision, note: note.trim() || null },
      { onError: (e) => setError((e as Error).message) },
    );
  };

  /* Already reviewed: show WHO and WHEN rather than the buttons again. The
     decision is a record, and offering to make it twice invites two. */
  if (reviewedAt) {
    return (
      <div className="border-t border-border/50 bg-muted/20 px-4 py-2.5">
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-status-success" />
          <span className="font-semibold">
            {state === "needs_clarification" ? "Follow-up requested" : "Reviewed"}
          </span>
          <span className="text-muted-foreground">
            {reviewerName ? `by ${reviewerName}` : ""} · {formatDateTime(reviewedAt)}
          </span>
        </p>
        {reviewNote && (
          <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{reviewNote}</p>
        )}
      </div>
    );
  }

  return (
    <div className="border-t border-border/50 bg-muted/20 px-4 py-2.5">
      <label htmlFor={`tl-note-${eodId}`} className="text-[11px] font-semibold text-muted-foreground">
        Note for {employeeName} (optional)
      </label>
      <Textarea
        id={`tl-note-${eodId}`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Anything you want to say back about this day."
        className="mt-1 text-sm"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy} onClick={() => decide("reviewed")}>
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
          Mark reviewed
        </Button>
        <Button size="sm" variant="outline" disabled={busy || !note.trim()}
          onClick={() => decide("needs_clarification")}>
          <MessageCircleQuestion className="mr-1.5 h-3.5 w-3.5" /> Needs follow-up
        </Button>
        {!note.trim() && (
          /* Said rather than left to be discovered by a disabled button. */
          <span className="text-[11px] text-muted-foreground">
            Add a note to ask for follow-up.
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-[11px] text-status-danger">{error}</p>
      )}
    </div>
  );
}
