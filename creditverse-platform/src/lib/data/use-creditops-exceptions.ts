/**
 * CreditOps exceptions the engine cannot resolve by itself.
 *
 * Three kinds, and each needs a different person to do a different thing:
 *
 *   assignment_required  an auto-distributed department had nobody eligible —
 *                        usually an unstaffed team. A lead adds members, or
 *                        assigns the file by hand.
 *   inactive_assignee    somebody deactivated still holds actionable work. It
 *                        is deliberately NOT redistributed automatically
 *                        (Dee, §11); a lead reassigns it, audited.
 *   overdue              actionable work past its deadline. Waiting files are
 *                        not here — a round in the post is not late.
 *
 * Support's unassigned files are absent by construction: there, waiting for
 * the Team Lead IS the process, and showing them as failures would train
 * everybody to ignore the list.
 */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { requireSupabase } from "@/lib/supabase/client";

export type CreditOpsExceptionKind = "assignment_required" | "inactive_assignee" | "overdue";

export interface CreditOpsException {
  kind: CreditOpsExceptionKind;
  clientId: string;
  clientName: string;
  department: string;
  status: string;
  dueAt: string | null;
  updatedAt: string;
}

export function useCreditOpsExceptions() {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const q = useQuery({
    queryKey: ["creditops", "exceptions"],
    enabled: live,
    staleTime: 30_000,
    queryFn: async (): Promise<CreditOpsException[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb
        .from("creditops_exceptions")
        .select("kind, client_id, client_name, department, status, due_at, updated_at")
        .order("due_at", { nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        kind: r.kind as CreditOpsExceptionKind,
        clientId: r.client_id as string,
        clientName: r.client_name as string,
        department: r.department as string,
        status: r.status as string,
        dueAt: (r.due_at as string) ?? null,
        updatedAt: r.updated_at as string,
      }));
    },
  });
  return {
    items: q.data ?? [],
    isLoading: live && q.isLoading,
    error: q.error ? (q.error as Error).message : null,
    live,
  };
}
