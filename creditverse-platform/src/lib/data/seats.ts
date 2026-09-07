/**
 * Seats — the same definition the database enforces.
 *
 * There is exactly one place that decides whether a person consumes a seat:
 * `organization_seat_detail()` in migration 0127. The count on this screen,
 * the reason beside each name, and the refusal when an invitation would exceed
 * the plan all read it. Two definitions is how a screen ends up saying nine of
 * ten while the tenth invitation is refused, with nobody able to say which is
 * lying.
 *
 * A seat is a commercial count, not a permission. Nothing here decides what
 * anybody may do.
 */
import { requireSupabase } from "@/lib/supabase/client";

export interface SeatHolder {
  userId: string;
  email: string | null;
  fullName: string | null;
  role: string;
  /** Whether this person consumes a seat. */
  counts: boolean;
  /** Why not, when they do not. Shown so a number is never unexplained. */
  reason: string | null;
}

export interface SeatSummary {
  seatsUsed: number;
  pendingInvitations: number;
  seatsCommitted: number;
  /** Null when no plan is in force — a capacity nobody bought is not zero. */
  seatsIncluded: number | null;
  seatsAvailable: number | null;
  overCapacity: boolean;
  /** "subscription", "trial plan" or "no plan in force". */
  source: string;
}

export async function fetchSeatSummary(organizationId: string): Promise<SeatSummary | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("organization_seat_summary", { p_org: organizationId });
  if (error) throw error;
  const r = (data as {
    seats_used: number;
    pending_invitations: number;
    seats_committed: number;
    seats_included: number | null;
    seats_available: number | null;
    over_capacity: boolean;
    source: string;
  }[] | null)?.[0];
  if (!r) return null;
  return {
    seatsUsed: r.seats_used,
    pendingInvitations: r.pending_invitations,
    seatsCommitted: r.seats_committed,
    seatsIncluded: r.seats_included,
    seatsAvailable: r.seats_available,
    overCapacity: r.over_capacity,
    source: r.source,
  };
}

export async function fetchSeatHolders(organizationId: string): Promise<SeatHolder[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("organization_seat_detail", { p_org: organizationId });
  if (error) throw error;
  return ((data as {
    user_id: string; email: string | null; full_name: string | null;
    role: string; counts: boolean; reason: string | null;
  }[] | null) ?? []).map((r) => ({
    userId: r.user_id,
    email: r.email,
    fullName: r.full_name,
    role: r.role,
    counts: r.counts,
    reason: r.reason,
  }));
}

/**
 * Disable a member without deleting them.
 *
 * Archiving frees the seat and keeps every historical attribution — who did
 * the work then stays who did the work (rule 4). Restoring takes a seat back
 * and is refused if there is none.
 */
export async function setMemberArchived(membershipId: string, archived: boolean): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("set_member_archived", { p_membership: membershipId, p_archived: archived });
  if (error) throw error;
}
