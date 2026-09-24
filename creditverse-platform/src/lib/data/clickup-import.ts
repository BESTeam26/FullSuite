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
  /** Cards deliberately left in ClickUp — archived ones (Dee, 2026-09-23). */
  notImported: number;
  secrets: number;
  comments: number;
  attachments: number;
  needsReview: string[];
  /**
   * Same name, separate records — the matcher saw both cards and declined to
   * merge, because a name alone does not prove one person (Dee, 2026-09-23).
   */
  duplicates: string[];
  /** Imported with no email, phone, date of birth or SSN to match on later. */
  thinIdentity: string[];
  /**
   * How many of these people look like clients of ANOTHER partner too.
   *
   * A count, never a name. The files stay separate and neither partner learns
   * of the other; only BES staff authorized for both partners can read which
   * pairs these are (Dee, 2026-09-24, D-023).
   */
  crossPartner: number;
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
