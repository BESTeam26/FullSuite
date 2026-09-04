import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import type { Tables } from "@/lib/supabase/database.types";

export interface OrganizationTrial {
  planKey: string;
  status: Tables<"organization_trials">["status"];
  endsAt: string;
  blockedReason: string | null;
}

export async function fetchOrganizationTrial(organizationId: string): Promise<OrganizationTrial | null> {
  const { data, error } = await supabase.from("organization_trials").select("*").eq("organization_id", organizationId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { planKey: data.plan_key, status: data.status, endsAt: data.ends_at, blockedReason: data.blocked_reason } : null;
}

/** The organization's trial row, if it came through self-serve sign-up. RLS: members and BES staff. */
export function useOrganizationTrial(organizationId: string | null) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in" && !!organizationId;
  const q = useQuery({ queryKey: ["organization-trial", organizationId], queryFn: () => fetchOrganizationTrial(organizationId as string), enabled: live, staleTime: 60_000 });
  return { trial: q.data ?? null, isLoading: live && q.isLoading };
}
