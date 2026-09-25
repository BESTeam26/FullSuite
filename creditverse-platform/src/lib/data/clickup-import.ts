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

/**
 * `clickup:list:901821115879` or `clickup:view:rk9kb-22578` → what to import.
 *
 * This used to accept only the list form, so a partner linked by view — which
 * is what a pasted URL usually produces — had an import button that could
 * never run.
 */
export function importTargetFromSourceRef(
  ref: string | null | undefined,
): { kind: "list" | "view"; id: string } | null {
  if (!ref) return null;
  const m = /^clickup:(list|view):([A-Za-z0-9_-]+)$/.exec(ref.trim());
  return m ? { kind: m[1] as "list" | "view", id: m[2] } : null;
}


/**
 * Run the import from a list id, or from a VIEW id.
 *
 * What somebody copies out of ClickUp's address bar is usually a view —
 * `/v/l/rk9kb-22578` — because that is the tab they were looking at. Only
 * `/v/li/…` carries a list id. `parseClickUpListRef` has always told the two
 * apart; the import now resolves a view to the list behind it instead of
 * refusing the link people actually have.
 */
export async function runClickUpImport(
  groupId: string,
  ref: string | { kind: "list" | "view"; id: string },
  dryRun = false,
): Promise<ImportSummary> {
  const sb = requireSupabase();
  const target = typeof ref === "string" ? { kind: "list" as const, id: ref } : ref;
  const { data, error } = await sb.functions.invoke("clickup-import", {
    body: {
      groupId, dryRun,
      ...(target.kind === "view" ? { viewId: target.id } : { listId: target.id }),
    },
  });
  if (error) throw error;
  return data as ImportSummary;
}
