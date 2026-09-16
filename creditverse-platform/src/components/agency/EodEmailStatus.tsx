/**
 * "EOD submitted · Email delivery failed".
 *
 * Dee asked for that exact shape, and the point of it is the middle dot: the
 * submission and the email are two facts, and one failing does not touch the
 * other. So this line never says anything about whether the report was
 * submitted — the badge above it already does — only about the email.
 *
 * Absent entirely while the email is pending and unremarkable. A row of green
 * "email sent" confirmations on every report is noise; people need telling when
 * something did NOT happen.
 */
import { AlertTriangle, Loader2, MailX, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format-date";
import { useEodEmailStatus, useRetryEodEmail } from "@/lib/data/use-eod-email-status";

export function EodEmailStatus({ eodId }: { eodId: string | null }) {
  const status = useEodEmailStatus(eodId);
  const retry = useRetryEodEmail(eodId);

  const s = status.data;
  if (!s) return null;

  /* Sent is stated once, quietly, because "did my report reach my lead" is a
     reasonable thing to want answered. */
  if (s.state === "sent") {
    return (
      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <MailCheck className="h-3.5 w-3.5 shrink-0 text-status-success" />
        Emailed to {s.recipient ?? "your team lead"}
        {s.sentAt && <> · {formatDateTime(s.sentAt)}</>}
      </p>
    );
  }

  if (s.state === "unavailable") {
    return (
      <p className="mt-1.5 flex flex-wrap items-start gap-1.5 text-[11px] text-amber-700">
        <MailX className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {/* Not an error, and not the person's fault. Somebody has to set a lead. */}
        <span>
          Your report was submitted. Nobody was emailed, because your team has no
          lead set yet.
        </span>
      </p>
    );
  }

  if (s.state === "failed") {
    return (
      <div className="mt-1.5 rounded-lg border border-amber-500/40 bg-amber-500/5 px-2.5 py-2">
        <p className="flex flex-wrap items-start gap-1.5 text-[11px] font-semibold text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          EOD submitted · Email delivery failed
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Your report is saved and counted. Only the email to{" "}
          {s.recipient ?? "your team lead"} did not go
          {s.attempts > 0 && <> ({s.attempts} attempt{s.attempts === 1 ? "" : "s"})</>}.
        </p>
        {/* The provider's words, only for somebody who can do something about them. */}
        {s.lastError && (
          <p className="mt-0.5 break-words text-[10px] text-muted-foreground">{s.lastError}</p>
        )}
        {s.mayRetry && (
          <Button size="sm" variant="outline" className="mt-1.5 h-7 text-xs"
            disabled={retry.isPending} onClick={() => retry.mutate()}>
            {retry.isPending && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
            Try sending again
          </Button>
        )}
        {!s.mayRetry && s.attempts >= 5 && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            It has been tried five times. Somebody will need to look at the address.
          </p>
        )}
        {retry.isError && (
          <p role="alert" className="mt-1 text-[11px] text-status-danger">
            {(retry.error as Error).message}
          </p>
        )}
      </div>
    );
  }

  /* Pending: silent. It is about to happen, and a spinner on every submitted
     report is a question nobody asked. */
  return null;
}
