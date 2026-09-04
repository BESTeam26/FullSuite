/**
 * Attachments for a whole timeline, in two requests — never per note.
 *
 * One query returns every attachment row for the visible notes; one signing
 * call returns time-limited URLs for all of them together. A timeline of forty
 * notes with attachments therefore costs two requests, not eighty (rule 14).
 *
 * RLS does the filtering: `files` rows for an activity are readable only when
 * the note is, and signing runs under the caller's own storage policies. A note
 * the viewer cannot read contributes no rows and no URLs.
 */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import {
  fetchAttachmentsFor,
  signAttachments,
  type ActivityAttachment,
} from "@/lib/data/activity-attachments";

export interface TimelineAttachment extends ActivityAttachment {
  /** Time-limited. Absent if signing failed for this object. */
  url?: string;
}

export interface AttachmentsResult {
  /** Keyed by activity id. */
  byActivity: Record<string, TimelineAttachment[]>;
  isLoading: boolean;
}

export function useActivityAttachments(
  activityIds: string[],
): AttachmentsResult {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in";
  /* Sorted so the key is stable when the same notes arrive in a different
     order — otherwise the query refires on every render. */
  const key = [...activityIds].sort();

  const q = useQuery({
    queryKey: ["activity-attachments", key],
    queryFn: async () => {
      const byActivity = await fetchAttachmentsFor(key);
      const paths = Object.values(byActivity)
        .flat()
        .map((a) => a.path);
      const urls = await signAttachments(paths);
      const out: Record<string, TimelineAttachment[]> = {};
      for (const [id, list] of Object.entries(byActivity)) {
        out[id] = list.map((a) => ({ ...a, url: urls[a.path] }));
      }
      return out;
    },
    enabled: live && key.length > 0,
    // Signed URLs expire; refresh a little before they do.
    staleTime: 5 * 60_000,
  });

  return { byActivity: q.data ?? {}, isLoading: live ? q.isLoading : false };
}
