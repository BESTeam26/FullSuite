/**
 * The signed-in person's own account: their profile row (self-row update
 * policy), their avatar in the private `avatars` bucket, and their password
 * through Supabase Auth. Nothing here touches another user's record.
 */
import { requireSupabase } from "@/lib/supabase/client";

export interface OwnProfile {
  id: string;
  email: string;
  fullName: string | null;
  preferredName: string | null;
  title: string | null;
  phone: string | null;
  birthMonth: number | null;
  birthDay: number | null;
  birthdayVisible: boolean;
  avatarPath: string | null;
}

export interface ProfileEdits {
  fullName: string;
  preferredName: string;
  title: string;
  phone: string;
  birthMonth: number | null;
  birthDay: number | null;
  birthdayVisible: boolean;
}

export function profileProblem(edits: ProfileEdits): string | null {
  if (!edits.fullName.trim()) return "Your full name is needed so teammates know who you are.";
  if ((edits.birthMonth === null) !== (edits.birthDay === null)) return "Choose both a month and a day, or neither.";
  if (edits.phone.trim() && !/^[\d\s()+.-]{7,40}$/.test(edits.phone.trim())) return "That phone number does not look right.";
  return null;
}

export async function updateOwnProfile(userId: string, edits: ProfileEdits): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb
    .from("profiles")
    .update({
      full_name: edits.fullName.trim(),
      preferred_name: edits.preferredName.trim() || null,
      title: edits.title.trim() || null,
      phone: edits.phone.trim() || null,
      birth_month: edits.birthMonth,
      birth_day: edits.birthDay,
      birthday_visible: edits.birthdayVisible,
    })
    .eq("id", userId);
  if (error) throw error;
}

/** Kept small: an avatar is displayed at 40 px, so a large upload helps nobody. */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function avatarProblem(file: File): string | null {
  if (!ALLOWED_AVATAR_TYPES.includes(file.type)) return "Choose a PNG, JPG or WEBP image.";
  if (file.size > MAX_AVATAR_BYTES) return "That image is larger than 2 MB. Choose a smaller one.";
  return null;
}

/** Uploads into the caller's own folder and records the path on their profile. */
export async function uploadOwnAvatar(userId: string, file: File): Promise<string> {
  const sb = requireSupabase();
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await sb.storage.from("avatars").upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;
  const { error } = await sb.from("profiles").update({ avatar_path: path }).eq("id", userId);
  if (error) throw error;
  return path;
}

export async function removeOwnAvatar(userId: string, path: string | null): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("profiles").update({ avatar_path: null }).eq("id", userId);
  if (error) throw error;
  // The object is removed after the row, so a failure here never leaves a
  // profile pointing at something that is gone.
  if (path) await sb.storage.from("avatars").remove([path]);
}

/** Signed URLs for avatar paths; the bucket is private, so nothing is public. */
export async function signAvatarUrls(paths: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return {};
  const sb = requireSupabase();
  const { data, error } = await sb.storage.from("avatars").createSignedUrls(unique, 60 * 60);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const row of data ?? []) if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  return out;
}

export const MIN_PASSWORD_LENGTH = 8;

export function passwordProblem(next: string, confirm: string): string | null {
  if (next.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (next !== confirm) return "The two entries do not match.";
  return null;
}

export async function updateOwnPassword(nextPassword: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.auth.updateUser({ password: nextPassword });
  if (error) throw error;
}

/** Sends the reset email for an address; used from the account page and sign-in. */
export async function sendPasswordReset(email: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login` });
  if (error) throw error;
}
