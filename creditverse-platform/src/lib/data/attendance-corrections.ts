/**
 * Corrections laid over derived attendance.
 *
 * The attendance record itself is derived and cannot be edited — a correction
 * is its own append-only fact placed on top, so the original deduction and its
 * reversal both survive (Dee's rule: "Corrections don't delete history").
 */
import { requireSupabase } from "@/lib/supabase/client";
import type { Classification } from "@/lib/attendance/attendance-score";

export interface AttendanceCorrection {
  id: string;
  userId: string;
  workDate: string;
  classification: Classification;
  reason: string;
  decidedBy: string;
  decidedByName: string | null;
  decidedAt: string;
}

const SELECT =
  "id, user_id, work_date, classification, reason, decided_by, decided_at, " +
  "profiles!attendance_corrections_decided_by_fkey(full_name, email)";

const map = (r: Record<string, unknown>): AttendanceCorrection => {
  const p = r.profiles as { full_name: string | null; email: string } | null;
  return {
    id: r.id as string,
    userId: r.user_id as string,
    workDate: r.work_date as string,
    classification: r.classification as Classification,
    reason: (r.reason as string) ?? "",
    decidedBy: r.decided_by as string,
    decidedByName: p ? (p.full_name?.trim() || p.email) : null,
    decidedAt: r.decided_at as string,
  };
};

/**
 * Every correction for these people in a date range.
 *
 * Newest LAST, because the engine takes the latest correction for a day as the
 * one that stands, and a stable order makes that deterministic.
 */
export async function fetchAttendanceCorrections(
  fromDate: string, toDate: string,
): Promise<AttendanceCorrection[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("attendance_corrections").select(SELECT)
    .gte("work_date", fromDate).lte("work_date", toDate)
    .order("decided_at")
    .limit(1000);
  if (error) throw error;
  return (data ?? []).map((r) => map(r as unknown as Record<string, unknown>));
}

/** Record one. The database refuses your own, and demands a reason. */
export async function recordAttendanceCorrection(input: {
  userId: string; workDate: string; classification: Classification; reason: string;
}): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("record_attendance_correction" as never, {
    p_user: input.userId, p_date: input.workDate,
    p_classification: input.classification, p_reason: input.reason,
  } as never);
  if (error) throw error;
}
