/**
 * Goals & Development — a goal a person or their lead states, with a status.
 * Not a task engine (rule 17): no assignment, checklist or time; a goal that
 * becomes work becomes a work item. RLS: read and write follow
 * may_view_workforce_record (self, a lead of their team, management in scope).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";

export type GoalStatus = "not_started" | "in_progress" | "on_track" | "completed";
export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  not_started: "Not Started", in_progress: "In Progress", on_track: "On Track", completed: "Completed",
};

export interface MemberGoal {
  id: string;
  userId: string;
  title: string;
  status: GoalStatus;
  dueOn: string | null;
  createdBy: string | null;
  createdAt: string;
  completedAt: string | null;
}

export async function fetchMemberGoals(userId: string): Promise<MemberGoal[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("member_goals").select("*").eq("user_id", userId)
    .order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id, userId: r.user_id, title: r.title, status: r.status as GoalStatus, dueOn: r.due_on,
    createdBy: r.created_by, createdAt: r.created_at, completedAt: r.completed_at,
  }));
}

export const goalsKey = (userId: string) => ["people", "goals", userId] as const;

export function useMemberGoals(userId: string | null) {
  const auth = useAuth();
  return useQuery({
    queryKey: goalsKey(userId ?? ""),
    queryFn: () => fetchMemberGoals(userId!),
    enabled: auth.mode === "live" && auth.status === "signed-in" && !!userId,
    staleTime: 30_000,
  });
}

export function useGoalActions(userId: string) {
  const qc = useQueryClient();
  const auth = useAuth();
  const refresh = () => void qc.invalidateQueries({ queryKey: goalsKey(userId) });
  return {
    add: useMutation({
      mutationFn: async (input: { title: string; dueOn: string | null }) => {
        const sb = requireSupabase();
        const { error } = await sb.from("member_goals").insert({
          agency_id: auth.agencyId!, user_id: userId, title: input.title.trim(), due_on: input.dueOn,
        });
        if (error) throw error;
      },
      onSuccess: refresh,
    }),
    setStatus: useMutation({
      mutationFn: async (input: { id: string; status: GoalStatus }) => {
        const sb = requireSupabase();
        const { error } = await sb.from("member_goals").update({ status: input.status }).eq("id", input.id);
        if (error) throw error;
      },
      onSuccess: refresh,
    }),
  };
}
