/**
 * Earned paid time — a ledger, not a balance.
 *
 * Dee, 2026-09-19: "Don't store simply leave_balance = 3. Store credits." So
 * the panel shows the credits: where each came from, when it dies, and what
 * happened to the spent ones. A single number would hide the only two things
 * that matter about a reward — that it was earned, and that it expires.
 */
import { Cake, Gift, Trophy } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import type { RewardWallet } from "@/lib/leave/reward-wallet";

const ICON = { birthday: Cake, attendance: Trophy } as const;

export function RewardWalletPanel({ wallet, today }: { wallet: RewardWallet; today: string }) {
  const soon = (d: string) => {
    const days = Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
    return days <= 14;
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Gift className="h-4 w-4 text-muted-foreground" aria-hidden /> My rewards
        </h2>
        <span className="text-xs font-bold tabular-nums text-foreground">
          {wallet.totalDays} paid {wallet.totalDays === 1 ? "day" : "days"}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        Earned paid time. Reward Days do not roll over and have no cash value.
      </p>

      {wallet.available.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          Nothing earned yet. A perfect quarter earns a paid Reward Day, and your birthday
          month brings one automatically.
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {wallet.available.map((c) => {
            const Icon = ICON[c.kind];
            return (
              <li key={c.id}
                className={cn("flex items-start gap-2.5 rounded-xl border px-3 py-2",
                  soon(c.expiresOn)
                    ? "border-amber-500/40 bg-amber-500/10"
                    : "border-border bg-muted/30")}>
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-foreground">{c.label}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {c.days} paid {c.days === 1 ? "day" : "days"}
                    {/* Dee's employee UI: "Earned Q3 2026 · Expires Dec 29". */}
                    {c.sourceQuarter && ` · earned ${c.sourceQuarter.replace("-Q", " Q")}`}
                    {" · "}expires {formatDate(c.expiresOn)}
                    {c.extendedFrom && ` (extended from ${formatDate(c.extendedFrom)})`}
                  </span>
                </span>
                {soon(c.expiresOn) && (
                  <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                    Use it soon
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {(wallet.used.length > 0 || wallet.expired.length > 0) && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[11px] font-semibold text-muted-foreground hover:text-foreground">
            Past rewards ({wallet.used.length + wallet.expired.length})
          </summary>
          <ul className="mt-1.5 space-y-1">
            {wallet.used.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="truncate">
                  {c.label}
                  {c.election === "work_premium" && " · worked for 2× instead"}
                </span>
                <span className="shrink-0">Used {c.consumedAt ? formatDate(c.consumedAt) : ""}</span>
              </li>
            ))}
            {wallet.expired.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="truncate">{c.label}</span>
                <span className="shrink-0">Expired {formatDate(c.expiresOn)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
