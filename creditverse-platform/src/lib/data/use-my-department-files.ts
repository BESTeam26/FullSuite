import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchMyDepartmentFiles } from "@/lib/data/my-department-files";

/** Department files assigned to me — shown on My Work beside work items. */
export function useMyDepartmentFiles() {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in" && !!auth.user;
  const userId = auth.user?.id ?? "";
  const q = useQuery({
    queryKey: ["work", "mine", "department-files", userId],
    queryFn: () => fetchMyDepartmentFiles(userId),
    enabled: live,
    staleTime: 15_000,
  });
  return { files: q.data ?? [], isLoading: live && q.isLoading, error: q.error ? (q.error as Error).message : null, live };
}
