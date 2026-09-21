/**
 * "All BES workforce times are shown in Eastern Time (ET)."
 *
 * Dee, 2026-09-21, locking the canonical zone: every workforce record is
 * judged in America/New_York, wherever the person is. Half the team is in
 * Manila, so the screen has to say whose clock it is speaking — and offer
 * theirs beside it, never instead of it.
 */
import { Clock } from "lucide-react";
import { BES_TZ_LABEL, besTime, deviceTimeBeside } from "@/lib/time/business-timezone";

export function EasternTimeNote({ now = new Date() }: { now?: Date }) {
  const local = deviceTimeBeside(now);
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
      <Clock className="h-3 w-3 shrink-0" aria-hidden />
      <span>All BES workforce times are shown in <strong className="font-semibold text-foreground">{BES_TZ_LABEL}</strong> — {besTime(now)}.</span>
      {local && (
        /* Secondary on purpose: the device's clock is presentation, never the
           clock anything is judged against. */
        <span>Your local time: {local.time} {local.label}.</span>
      )}
    </p>
  );
}
