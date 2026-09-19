/**
 * Earned paid time, and what is still spendable.
 *
 * Dee, 2026-09-19: "BES does not maintain traditional paid vacation/PTO
 * balances for contractors… BES provides paid time as an earned reward, not a
 * general leave bank."
 *
 * So there is no balance to compute — there is a LEDGER to read. A credit is
 * spendable when it has not been consumed and has not expired; everything on
 * screen is a filter over rows, never a stored total.
 */
import type { RewardCredit } from "@/lib/data/reward-credits";

export type CreditState = "available" | "used" | "expired";

export function stateOf(c: RewardCredit, today: string): CreditState {
  if (c.consumedAt) return "used";
  if (c.expiresOn < today) return "expired";
  return "available";
}

export interface RewardWallet {
  /** Spendable today, by source. */
  birthdayDays: number;
  attendanceDays: number;
  totalDays: number;
  /** The live birthday credit, if there is one — it drives the election. */
  birthday: RewardCredit | null;
  available: RewardCredit[];
  used: RewardCredit[];
  expired: RewardCredit[];
  /** The soonest expiry among spendable credits, for "use it or lose it". */
  nextExpiry: string | null;
}

export function rewardWallet(
  credits: readonly RewardCredit[],
  options: { today: string },
): RewardWallet {
  const { today } = options;
  const available: RewardCredit[] = [];
  const used: RewardCredit[] = [];
  const expired: RewardCredit[] = [];

  for (const c of credits) {
    const state = stateOf(c, today);
    if (state === "available") available.push(c);
    else if (state === "used") used.push(c);
    else expired.push(c);
  }

  /* Soonest expiry first: the one somebody should spend next is the one that
     dies first, not the one that happens to be newest. */
  available.sort((a, b) => (a.expiresOn < b.expiresOn ? -1 : 1));
  used.sort((a, b) => ((a.consumedAt ?? "") < (b.consumedAt ?? "") ? 1 : -1));
  expired.sort((a, b) => (a.expiresOn < b.expiresOn ? 1 : -1));

  const days = (kind: RewardCredit["kind"]) =>
    available.filter((c) => c.kind === kind).reduce((n, c) => n + c.days, 0);

  return {
    birthdayDays: days("birthday"),
    attendanceDays: days("attendance"),
    totalDays: available.reduce((n, c) => n + c.days, 0),
    birthday: available.find((c) => c.kind === "birthday") ?? null,
    available,
    used,
    expired,
    nextExpiry: available[0]?.expiresOn ?? null,
  };
}
