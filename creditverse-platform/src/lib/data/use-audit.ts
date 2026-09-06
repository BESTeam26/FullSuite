import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchAuditLog } from "@/lib/data/audit";

export function useAuditLog(organizationId?: string | null, limit = 200) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  return useQuery({ queryKey: ["audit-log", organizationId ?? "all", limit], queryFn: () => fetchAuditLog(limit, organizationId), enabled: live, staleTime: 30_000 });
}
