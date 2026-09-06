/**
 * The signed-in person's own account: display name on their profile row
 * (self-row update policy) and their password through Supabase Auth. Nothing
 * here touches another user's record.
 */
import { requireSupabase } from "@/lib/supabase/client";

export async function updateOwnDisplayName(userId: string, fullName: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("profiles").update({ full_name: fullName.trim() }).eq("id", userId);
  if (error) throw error;
}

/** Minimum length mirrors the Supabase project default; the server enforces its own policy too. */
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
