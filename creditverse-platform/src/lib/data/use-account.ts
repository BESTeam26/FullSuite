/**
 * The signed-in person's own profile and avatar.
 *
 * The row itself is already loaded once per session by the auth context
 * (`select *` on `profiles`), so this hook reads that rather than asking for
 * it again — one source of truth, one request (rule 14). It adds the
 * mutations and refreshes the cached identity after each one.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  removeOwnAvatar,
  signAvatarUrls,
  updateOwnProfile,
  uploadOwnAvatar,
  type OwnProfile,
  type ProfileEdits,
} from "@/lib/data/account";

export const avatarUrlKey = (paths: string[]) => ["account", "avatar-urls", paths.join(",")] as const;

export function useOwnProfile() {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  const userId = auth.user?.id ?? "";
  const qc = useQueryClient();
  const row = auth.profile;
  const profile: OwnProfile | null = row
    ? {
        id: row.id,
        email: String(row.email),
        fullName: row.full_name,
        preferredName: row.preferred_name,
        title: row.title,
        phone: row.phone,
        birthMonth: row.birth_month,
        birthDay: row.birth_day,
        birthdayVisible: row.birthday_visible,
        avatarPath: row.avatar_path,
      }
    : null;
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["account", "avatar-urls"] });
    await auth.refreshMemberships();
  };
  return {
    live,
    userId,
    profile,
    isLoading: live && !!userId && !row,
    error: null as string | null,
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
