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
  /** The partner whose file it is; null for an organization's own client. */
  partnerGroupId: string | null;
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
        .select("client_id, client_name, department, due_at, outsourcing_group_id")
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
        partnerGroupId: r.outsourcing_group_id ?? null,
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
/**
 * The next file after this one — inside the SAME partner workspace.
 *
 * Dee, 2026-10-16: "retain the view in Nainoa if I am working with Nainoa and
 * don't bring me to Tiffany, unless I specifically change the list workspace."
 * The queue is ordered by urgency across every partner; "Complete & next
 * client" used to follow it anywhere. Now it follows it only within the
 * partner of the file just finished; when that partner has nothing left the
 * sheet simply closes on a finished file, and the person chooses where to go.
 */
export function pickNext(queue: readonly NextClient[], currentClientId: string, partnerGroupId: string | null | undefined): NextClient | null {
  return queue.find((r) => r.clientId !== currentClientId && r.partnerGroupId === (partnerGroupId ?? null)) ?? null;
}
