/**
 * The next client this person should work, for Complete & Next Client.
 *
 * Dee's mockup ends the Complete Work panel with "Complete & Next Client →".
 * The point of that button is that an agent working a queue never goes back
 * to the list: finish, land on the next file, finish, land on the next.
 *
 * ── "NEXT" MEANS MOST URGENT, NOT NEXT IN A LIST ──────────────────────────
 *
 * Read from `creditops_my_work`, which is the same view My Work uses and
 * applies `creditops_status_is_actionable` — the SAME predicate the automatic
 * assignment engine counts workload with. So the file this hands somebody is
 * one the engine agrees is theirs and agrees is workable; a second definition
 * in TypeScript would drift, and the drift would show as an agent being sent
 * to a file that is waiting on a bureau.
 *
 * Ordered by due date, soonest first, with the undated last. Dee's SLA rules
 * are the queue's order everywhere else, and a button that jumps somewhere
 * else would quietly undo them.
 */
import { useQuery } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";

export interface NextClient {
  clientId: string;
  clientName: string;
  department: string;
  dueAt: string | null;
}

export const myQueueKey = (userId: string) => ["creditops", "my-queue", userId];

export function useMyQueue() {
  const auth = useAuth();
  const userId = auth.user?.id ?? "";
  return useQuery({
    queryKey: myQueueKey(userId),
    enabled: auth.mode === "live" && auth.status === "signed-in" && !!userId,
    staleTime: 15_000,
    queryFn: async (): Promise<NextClient[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb
        .from("creditops_my_work")
        .select("client_id, client_name, department, due_at")
        .eq("assignee_id", userId)
        /* Nulls last: an undated file is not more urgent than a dated one. */
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(100);
      if (error) throw error;
      return ((data ?? []) as Record<string, string | null>[]).map((r) => ({
        clientId: r.client_id as string,
        clientName: (r.client_name as string) ?? "",
        department: (r.department as string) ?? "",
        dueAt: r.due_at,
      }));
    },
  });
}

/**
 * The most urgent file that is not the one already open.
 *
 * A client can hold two department rows at once (Dee's queue doctrine), so
 * this filters by CLIENT rather than by row — otherwise "next" would hand
 * somebody the file they have just finished, in its other department.
 */
export function pickNext(queue: readonly NextClient[], currentClientId: string): NextClient | null {
  return queue.find((r) => r.clientId !== currentClientId) ?? null;
}
