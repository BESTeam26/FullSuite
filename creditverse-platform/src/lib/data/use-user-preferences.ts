/**
 * The signed-in person's preferences (their own row; RLS is self-row only).
 * One query key shared by every consumer; invalidated by the organization
 * switch alongside the other global keys.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchUserPreferences, updateDashboardCards } from "@/lib/data/organizations";
import type { HomeCardKey } from "@/lib/dashboard/home-cards";

export const userPreferencesKey = (userId: string) => ["user-preferences", userId];

export function useUserPreferences() {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const userId = auth.user?.id ?? "";
  const q = useQuery({
    queryKey: userPreferencesKey(userId),
    queryFn: () => fetchUserPreferences(userId),
    enabled: live && !!userId,
    staleTime: 60_000,
  });
  return {
    preferences: q.data ?? null,
    isLoading: live && !!userId && q.isLoading,
    error: q.error ? (q.error as Error).message : null,
    live,
  };
}

/** Save the Home layout — the whole ordered list, one column, no read first. */
export function useSaveDashboardCards() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const userId = auth.user?.id ?? "";
  return useMutation({
    mutationFn: (cards: HomeCardKey[] | null) => updateDashboardCards(userId, cards),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: userPreferencesKey(userId) });
    },
  });
}
