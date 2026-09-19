/**
 * The people this person may manage — the database's answer, not the UI's.
 *
 * Dee, 2026-09-19: "each tab proving both UI scope and backend scope."
 * `managed_people()` is the same predicate the row policies use, so what a
 * tab lists and what its rows allow cannot drift. Team Management filters
 * EVERY tab through this set; nothing on that page decides scope for itself.
 */
import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";

export function useManagedPeople() {
  const auth = useAuth();
  return useQuery({
    queryKey: ["workforce", "managed-people"],
    queryFn: async (): Promise<Set<string>> => {
      const sb = requireSupabase();
      const { data, error } = await sb.rpc("managed_people" as never);
      if (error) throw error;
      return new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id));
    },
    enabled: auth.mode === "live" && auth.status === "signed-in",
    staleTime: 60_000,
  });
}
