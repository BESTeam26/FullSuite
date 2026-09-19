/**
 * The attendance policy, read from the database.
 *
 * Dee, 2026-09-18: "Do not hardcode these into frontend components if they are
 * configurable business policy." The engine takes a policy and defaults to the
 * seeded values, so this hook is what makes an EDIT take effect — without it
 * the row would exist and change nothing.
 *
 * One row, cached for five minutes: the policy changes a few times a year, and
 * every score on every screen depends on it (rule 14).
 */
import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { DEFAULT_POLICY, type AttendancePolicy } from "./attendance-score";
import { mapPolicy } from "./attendance-policy-map";
export { mapPolicy };

export async function fetchAttendancePolicy(): Promise<AttendancePolicy> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("attendance_policy").select("*").maybeSingle();
  if (error) throw error;
  return mapPolicy(data as unknown as Record<string, unknown> | null);
}

/**
 * Always returns a usable policy.
 *
 * While the row is loading, or if it cannot be read, this is the seeded
 * default — the same numbers the database was created with. A score that
 * refuses to render because a settings row is slow would be worse than one
 * computed from the values that row was seeded with.
 */
export function useAttendancePolicy(): AttendancePolicy {
  const auth = useAuth();
  const q = useQuery({
    queryKey: ["attendance", "policy"],
    queryFn: fetchAttendancePolicy,
    enabled: auth.mode === "live" && auth.status === "signed-in",
    staleTime: 300_000,
  });
  return q.data ?? DEFAULT_POLICY;
}
