/**
 * "Take the day, or work it for 2×."
 *
 * Dee, 2026-09-19: "I would NOT automatically double-pay someone merely
 * because they failed to submit birthday leave. That creates an exploitable
 * loophole." So the premium is an EXPLICIT election, recorded, and it spends
 * the reward exactly as taking the day would. One reward, one benefit.
 *
 * This card never mentions an amount. Compensation is a separate engine —
 * Dee: "Don't let the Time Off page calculate compensation itself."
 */
import { useState } from "react";
import { Cake, Loader2 } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import type { RewardCredit } from "@/lib/data/reward-credits";

export function BirthdayRewardChoice({
  credit, busy, error, onElect, onRequestDay,
}: {
  credit: RewardCredit;
  busy: boolean;
  error: string | null;
  onElect: (election: "work_premium") => void;
  onRequestDay: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-foreground">
        <Cake className="h-4 w-4 text-amber-700" aria-hidden /> Your Birthday Reward 🎉
      </p>
      <p className="mt-0.5 text-[11px] text-amber-900">
        One paid day, yours this month. Valid until {formatDate(credit.expiresOn)} — it does
        not roll over.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={onRequestDay} disabled={busy}
          className="rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
          <span className="block text-xs font-bold text-foreground">Take a paid Birthday Day</span>
          <span className="block text-[11px] text-muted-foreground">
            Pick a date and send it to your lead for approval.
          </span>
        </button>

        <button type="button" onClick={() => setConfirming(true)} disabled={busy}
          className="rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
          <span className="block text-xs font-bold text-foreground">Work and earn 2×</span>
          <span className="block text-[11px] text-muted-foreground">
            Work one eligible birthday shift at double compensation instead.
          </span>
        </button>
      </div>

      {confirming && (
        <div className="mt-3 rounded-xl border border-border bg-card p-3">
          <p className="text-xs font-bold text-foreground">Choose the 2× working premium?</p>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            This uses your Birthday Reward. You will not also be able to take a paid Birthday
            Day this year — one reward, one benefit. The premium applies to one eligible
            approved shift; Finance records the payment separately.
          </p>
          {error && <p role="alert" className="mt-1.5 text-[11px] font-semibold text-status-danger">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirming(false)}
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Cancel
            </button>
            <button type="button" disabled={busy} onClick={() => onElect("work_premium")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              Yes, work and earn 2×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
