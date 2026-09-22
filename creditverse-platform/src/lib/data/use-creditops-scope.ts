/**
 * Which CreditOps queues this person may CHANGE — the database's own answer.
 *
 * Dee, 2026-09-22: *"Actions such as change status, reassign, update
 * queue/work state, correct workflow must be controlled by explicit CreditOps
 * capabilities."* `creditops_work_scope()` is where that lives, and the
 * writers refuse on it, so the screen asks the same function rather than
 * re-deriving the rule in React. A second copy would drift, and the copy that
 * drifts is always the one people see.
 *
 * One bounded call per session, cached. It answers for the caller only.
 */
import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import type { CreditOpsDepartment } from "@/lib/fulfillment/creditops-access";

export function useCreditOpsWorkScope() {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const q = useQuery({
    queryKey: ["creditops", "work-scope"],
    queryFn: async (): Promise<CreditOpsDepartment[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb.rpc("creditops_work_scope" as never);
      if (error) throw error;
      /* The function returns a set of scalars, which PostgREST gives back as
         a bare array of strings. */
      return ((data ?? []) as string[]).map((d) => d as CreditOpsDepartment);
    },
    enabled: live,
    staleTime: 5 * 60_000,
  });
  return {
    /* Until it has loaded, nobody may change anything. Default to deny is the
       right failure here: an offer that the database then refuses reads as a
       broken button (rule 1). */
    departments: q.data ?? [],
    isLoading: live && q.isLoading,
    ready: !live || q.isSuccess,
  };
}
