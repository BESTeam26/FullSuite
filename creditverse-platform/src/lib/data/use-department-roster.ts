/**
 * The people a CreditOps department may be assigned work in.
 *
 * Reads `creditops_department_roster`, which returns each member with their
 * CURRENT actionable load — counted by the same predicate the automatic
 * assignment engine uses. That shared definition is the point: a Team Lead
 * choosing who to give a case to sees the same "who is busy" the engine saw
 * when it decided who to give the last one to.
 *
 * Cached per department. The roster changes when somebody joins or leaves a
 * team, which is rare; the load inside it changes as work moves, which is why
 * the stale time is short rather than absent.
 */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { requireSupabase } from "@/lib/supabase/client";
import type { CreditOpsDepartment } from "@/lib/fulfillment/creditops-access";

export interface DepartmentMember {
  id: string;
  name: string;
  email: string;
  isLead: boolean;
  /** Files this person can act on right now, across every department. */
  activeFiles: number;
}

async function fetchDepartmentRoster(department: CreditOpsDepartment): Promise<DepartmentMember[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("creditops_department_roster", {
    p_department: department as never,
  });
  if (error) throw error;
  return ((data ?? []) as { user_id: string; full_name: string | null; email: string; is_lead: boolean; active_files: number }[])
    .map((r) => ({
      id: r.user_id,
      name: r.full_name?.trim() || r.email,
      email: r.email,
      isLead: r.is_lead,
      activeFiles: r.active_files,
    }));
}

export function useDepartmentRoster(department: CreditOpsDepartment | undefined): DepartmentMember[] {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const q = useQuery({
    queryKey: ["creditops", "department-roster", department],
    queryFn: () => fetchDepartmentRoster(department as CreditOpsDepartment),
    enabled: live && !!department,
    staleTime: 30_000,
  });
  return q.data ?? [];
}
