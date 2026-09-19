/**
 * The reward ledger.
 *
 * Read-only from the browser: granting, electing and extending each go through
 * a named function with its own rule, because an insert policy would let
 * somebody mint themselves a paid day.
 */
import { requireSupabase } from "@/lib/supabase/client";

export interface RewardCredit {
  id: string;
  userId: string;
  kind: "birthday" | "attendance";
  label: string;
  days: number;
  issuedOn: string;
  expiresOn: string;
  election: "paid_day" | "work_premium" | null;
  consumedAt: string | null;
  consumedFor: string | null;
  extendedFrom: string | null;
  extendReason: string | null;
  /** "2026-Q3" for an attendance reward. */
  sourceQuarter: string | null;
  issuedAutomatically: boolean;
  /** Evidence frozen at the grant — never recomputed from. */
  finalScore: number | null;
  needsReview: boolean;
  reviewReason: string | null;
}

const map = (r: Record<string, unknown>): RewardCredit => ({
  id: r.id as string,
  userId: r.user_id as string,
  kind: r.kind as RewardCredit["kind"],
  label: (r.label as string) ?? "Reward",
  days: Number(r.days ?? 1),
  issuedOn: r.issued_on as string,
  expiresOn: r.expires_on as string,
  election: (r.election as RewardCredit["election"]) ?? null,
  consumedAt: (r.consumed_at as string) ?? null,
  consumedFor: (r.consumed_for as string) ?? null,
  extendedFrom: (r.extended_from as string) ?? null,
  extendReason: (r.extend_reason as string) ?? null,
  sourceQuarter: (r.source_quarter as string) ?? null,
  issuedAutomatically: r.issued_automatically === true,
  finalScore: r.final_score === null || r.final_score === undefined ? null : Number(r.final_score),
  needsReview: r.needs_review === true,
  reviewReason: (r.review_reason as string) ?? null,
});

/** Every credit the caller may see — RLS narrows to self / their team / all. */
export async function fetchRewardCredits(userId?: string): Promise<RewardCredit[]> {
  const sb = requireSupabase();
  let query = sb.from("reward_credits").select("*").order("expires_on");
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((r) => map(r as unknown as Record<string, unknown>));
}

/**
 * Issue the Attendance Champion reward for a quarter.
 *
 * ── WHY A HUMAN PRESSES THIS ──────────────────────────────────────────────
 *
 * The score is derived in TypeScript — the policy, the corrections, the
 * streaks, all of it. Awarding automatically would mean reimplementing that
 * engine in SQL, and two implementations of a rule with money attached is
 * exactly the second truth rule 2 exists to prevent: the day they disagreed,
 * somebody would be paid or not paid by whichever one ran.
 *
 * So the app computes eligibility from the ONE engine and offers the action;
 * a manager confirms it. The database still refuses a second reward for the
 * same quarter, so a double-press cannot double-pay.
 */
export async function grantAttendanceReward(
  userId: string, quarter: string, note?: string,
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("grant_attendance_reward" as never, {
    p_user: userId, p_quarter: quarter, p_note: note ?? null,
  } as never);
  if (error) throw error;
}

export async function electBirthdayReward(
  creditId: string, election: "paid_day" | "work_premium", leaveRequestId?: string,
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("elect_birthday_reward" as never, {
    p_credit: creditId, p_election: election,
    p_leave_request: leaveRequestId ?? null,
  } as never);
  if (error) throw error;
}
