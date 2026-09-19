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
