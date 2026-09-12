/**
 * A Global CreditOps department queue: the department's OWN open work.
 *
 * Dee, 2026-09-12, and it is the permanent rule:
 *
 *   STATUS TRIGGERS ROUTING
 *   ROUTING CREATES OR TRANSITIONS DEPARTMENT WORK
 *   DEPARTMENT WORK DETERMINES QUEUE MEMBERSHIP
 *
 * Every queue used to be `clients.filter(predicate)` over the client's overall
 * CREDIT STATUS, in React. Complaints' predicate was `() => true`, so it
 * listed every client BES had — including files whose statuses were `In
 * Dispute` and `Onboarding`. Bureau Calling's was the same.
 *
 * Membership now comes from one open `client_department_statuses` row for this
 * department and the queue never interprets the credit status again. A client
 * who is `In Dispute` with an open `FTC Needed` complaints row appears in
 * Complaints because the complaints work exists; the same client with no
 * complaints row does not, whatever the status says.
 */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { requireSupabase } from "@/lib/supabase/client";
import type { Enums } from "@/lib/supabase/database.types";

export type QueueDepartment = Enums<"fulfillment_department">;

export interface DepartmentQueueRow {
  clientId: string;
  department: QueueDepartment;
  /** THIS department's work status — what the Queue Status column shows. */
  workStatus: string;
  /** The client's overall stage, shown as its own column, never conflated. */
  creditStatus: string;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  round: string;
  partnerName: string | null;
  partnerScopeId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  dueAt: string | null;
  blockedReason: string | null;
  updatedAt: string;
  actionable: boolean;
  waiting: boolean;
}

export function useDepartmentQueue(department: QueueDepartment | null) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const q = useQuery({
    queryKey: ["creditops", "queue", department],
    enabled: live && !!department,
    staleTime: 15_000,
    queryFn: async (): Promise<DepartmentQueueRow[]> => {
      const sb = requireSupabase();
      const { data, error } = await sb
        .from("creditops_department_queue")
        .select("*")
        .eq("department", department as QueueDepartment)
        .order("due_at", { nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        clientId: r.client_id as string,
        department: r.department as QueueDepartment,
        workStatus: r.work_status as string,
        creditStatus: r.credit_status as string,
        clientName: r.client_name as string,
        clientEmail: (r.client_email as string) ?? null,
        clientPhone: (r.client_phone as string) ?? null,
        round: (r.round as string) ?? "",
        partnerName: (r.partner_name as string) ?? null,
        partnerScopeId: (r.partner_scope_id as string) ?? null,
        assigneeId: (r.assignee_id as string) ?? null,
        assigneeName: (r.assignee_name as string) ?? null,
        dueAt: (r.due_at as string) ?? null,
        blockedReason: (r.blocked_reason as string) ?? null,
        updatedAt: r.updated_at as string,
        actionable: r.actionable as boolean,
        waiting: r.waiting as boolean,
      }));
    },
  });
  return {
    rows: q.data ?? [],
    isLoading: live && q.isLoading,
    error: q.error ? (q.error as Error).message : null,
    live,
  };
}
