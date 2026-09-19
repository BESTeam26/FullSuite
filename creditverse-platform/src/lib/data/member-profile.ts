/**
 * Editing a team member's profile — theirs, or one you manage.
 *
 * Dee, 2026-09-19: "i dont see a way to edit agent profile too, like upload
 * image profile." The writers are database functions (set_member_profile,
 * set_member_avatar) gated by may_manage_profile_of: the person themselves,
 * or management within its scope. Photos go to the private avatars bucket in
 * the person's own folder; the bucket applies the same predicate.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";
import { avatarProblem } from "@/lib/data/account";

export interface MemberProfileEdits {
  fullName: string;
  preferredName: string;
  title: string;
  phone: string;
  tagline: string;
}

export function memberProfileProblem(e: MemberProfileEdits): string | null {
  if (!e.fullName.trim()) return "A full name is needed.";
  if (e.phone.trim() && !/^[\d\s()+.-]{7,40}$/.test(e.phone.trim())) return "That phone number does not look right.";
  if (e.tagline.trim().length > 200) return "Keep the quote under 200 characters.";
  return null;
}

export async function updateMemberProfile(userId: string, e: MemberProfileEdits): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("set_member_profile", {
    p_user: userId, p_full_name: e.fullName.trim(), p_preferred_name: e.preferredName.trim() || null,
    p_title: e.title.trim() || null, p_phone: e.phone.trim() || null, p_tagline: e.tagline.trim() || null,
  });
  if (error) throw error;
}

export async function uploadMemberAvatar(userId: string, file: File, previousPath: string | null): Promise<string> {
  const problem = avatarProblem(file);
  if (problem) throw new Error(problem);
  const sb = requireSupabase();
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error: up } = await sb.storage.from("avatars").upload(path, file, { contentType: file.type, upsert: false });
  if (up) throw up;
  const { error } = await sb.rpc("set_member_avatar", { p_user: userId, p_path: path });
  if (error) throw error;
  if (previousPath) await sb.storage.from("avatars").remove([previousPath]);
  return path;
}

export async function removeMemberAvatar(userId: string, path: string | null): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("set_member_avatar", { p_user: userId, p_path: null });
  if (error) throw error;
  if (path) await sb.storage.from("avatars").remove([path]);
}

/** Invalidates the roster and the person's own profile so every screen agrees. */
export function useMemberProfileActions(userId: string) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["agency", "members"] });
    void qc.invalidateQueries({ queryKey: ["account"] });
    void qc.invalidateQueries({ queryKey: ["agency", "workforce"] });
  };
  return {
    save: useMutation({ mutationFn: (e: MemberProfileEdits) => updateMemberProfile(userId, e), onSuccess: refresh }),
    upload: useMutation({ mutationFn: (v: { file: File; previousPath: string | null }) => uploadMemberAvatar(userId, v.file, v.previousPath), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (path: string | null) => removeMemberAvatar(userId, path), onSuccess: refresh }),
  };
}
