/**
 * Who a person may mention on a record: the organization's own directory,
 * which row-level security already limits to organizations the caller belongs
 * to or is engaged with. One cached query, shared with the People screen.
 *
 * A record with no organization (BES's own work) returns nobody for now, so
 * "@" simply does nothing there — better than offering names from a scope the
 * author is not writing in.
 */
import { useMemo } from "react";
import type { MentionCandidate } from "@/components/composer/MentionPicker";
import { useAvatarUrls } from "@/lib/data/use-account";
import { useOrganizationDirectory } from "@/lib/data/use-directory";

export function useMentionable(organizationId: string | null | undefined): {
  mentionable: MentionCandidate[];
  mentionAvatars: Record<string, string>;
} {
  const directory = useOrganizationDirectory(organizationId ?? null);
  const avatars = useAvatarUrls(directory.people.map((p) => p.avatarPath));
  const mentionable = useMemo<MentionCandidate[]>(
    () =>
      directory.people.map((p) => ({
        userId: p.userId,
        name: p.preferredName || p.name,
        email: p.email,
        avatarPath: p.avatarPath,
        hint: p.departmentName ?? p.jobTitle,
      })),
    [directory.people],
  );
  return { mentionable, mentionAvatars: avatars.data ?? {} };
}
