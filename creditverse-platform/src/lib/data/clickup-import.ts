/**
 * Running a ClickUp import from the interface.
 *
 * The browser sends two ids and its own session. Everything else — which
 * ClickUp list, what a card means, who may do this — lives in the Edge
 * Function and the database. The session is the point: the import is
 * attributed to the person who ran it, and refused if they may not.
 */
import { requireSupabase } from "@/lib/supabase/client";

export interface ImportSummary {
  found: number;
  matched: number;
  created: number;
  skipped: number;
  secrets: number;
  comments: number;
  attachments: number;
  needsReview: string[];
}

/** `clickup:list:901821115879` → `901821115879`. */
export function listIdFromSourceRef(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const m = /^clickup:list:(\d+)$/.exec(ref.trim());
  return m ? m[1] : null;
}

export async function runClickUpImport(
  groupId: string,
  listId: string,
  dryRun = false,
): Promise<ImportSummary> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke("clickup-import", {
    body: { groupId, listId, dryRun },
  });
  if (error) throw error;
  return data as ImportSummary;
}
