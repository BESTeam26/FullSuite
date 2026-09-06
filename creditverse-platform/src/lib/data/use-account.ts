/**
 * The signed-in person's own profile and avatar. One query for the row, one
 * for the signed avatar URL (the bucket is private), and mutations that
 * refresh both plus the auth context's cached identity.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  fetchOwnProfile,
  removeOwnAvatar,
  signAvatarUrls,
  updateOwnProfile,
  uploadOwnAvatar,
  type ProfileEdits,
} from "@/lib/data/account";

export const ownProfileKey = (userId: string) => ["account", "profile", userId] as const;
export const avatarUrlKey = (paths: string[]) => ["account", "avatar-urls", paths.join(",")] as const;

export function useOwnProfile() {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const userId = auth.user?.id ?? "";
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ownProfileKey(userId),
    queryFn: () => fetchOwnProfile(userId),
    enabled: live && !!userId,
    staleTime: 60_000,
  });
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ownProfileKey(userId) });
    await qc.invalidateQueries({ queryKey: ["account", "avatar-urls"] });
    await auth.refreshMemberships();
  };
  return {
    live,
    userId,
    profile: q.data ?? null,
    isLoading: live && !!userId && q.isLoading,
    error: (q.error as Error | null)?.message ?? null,
    save: useMutation({ mutationFn: (edits: ProfileEdits) => updateOwnProfile(userId, edits), onSuccess: refresh }),
    uploadAvatar: useMutation({ mutationFn: (file: File) => uploadOwnAvatar(userId, file), onSuccess: refresh }),
    removeAvatar: useMutation({ mutationFn: (path: string | null) => removeOwnAvatar(userId, path), onSuccess: refresh }),
  };
}

/**
 * Signed URLs for a set of avatar paths, in one request. Signatures last an
 * hour; the query is cached for less, so a displayed avatar never expires
 * on screen.
 */
export function useAvatarUrls(paths: (string | null | undefined)[]) {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const clean = [...new Set(paths.filter((p): p is string => !!p))].sort();
  return useQuery({
    queryKey: avatarUrlKey(clean),
    queryFn: () => signAvatarUrls(clean),
    enabled: live && clean.length > 0,
    staleTime: 45 * 60_000,
  });
}
