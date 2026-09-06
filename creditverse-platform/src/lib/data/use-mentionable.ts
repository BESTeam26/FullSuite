/**
 * Who a person may mention on a record: the organization's own directory,
 * which row-level security already limits to organizations the caller belongs
 * to or is engaged with. One cached query, shared with the People screen.
 *
 * A record with no organization is BES's own work, so BES staff may mention
 * their colleagues from the agency roster. Anyone else gets nobody, and "@"
 * simply does nothing — better than offering names from a scope the author is
 * not writing in.
 */
import { useMemo } from "react";
import type { MentionCandidate } from "@/components/composer/MentionPicker";
import { useAuth } from "@/lib/auth/auth-context";
import { useAvatarUrls } from "@/lib/data/use-account";
import { useOrganizationDirectory } from "@/lib/data/use-directory";
import { useWorkforce } from "@/lib/data/use-workforce";

export function useMentionable(organizationId: string | null | undefined): {
  mentionable: MentionCandidate[];
  mentionAvatars: Record<string, string>;
} {
  const auth = useAuth();
  const directory = useOrganizationDirectory(organizationId ?? null);
  /* The agency roster is only fetched for BES staff on an agency-scope
     record; an organization surface never asks for it. */
  const besScope = !organizationId && auth.isAgencyStaff;
  const workforce = useWorkforce({ enabled: besScope });
  const workforcePeople = besScope ? workforce.data?.people ?? [] : [];
  const avatars = useAvatarUrls(directory.people.map((p) => p.avatarPath));
  const mentionable = useMemo<MentionCandidate[]>(() => {
    if (organizationId) {
      return directory.people.map((p) => ({
        userId: p.userId,
        name: p.preferredName || p.name,
        email: p.email,
        avatarPath: p.avatarPath,
        hint: p.departmentName ?? p.jobTitle,
      }));
    }
    return workforcePeople.map((p) => ({ userId: p.userId, name: p.name, email: p.email, hint: null }));
  }, [organizationId, directory.people, workforcePeople]);
  return { mentionable, mentionAvatars: avatars.data ?? {} };
}
