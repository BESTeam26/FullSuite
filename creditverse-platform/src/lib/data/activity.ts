/**
 * Activity timeline data layer.
 *
 * One canonical `activity_events` table, four audiences, visibility on every
 * row. **Association is not publication** — an event hanging off a client says
 * nothing about who may read it, and the database decides that, not this file.
 *
 * Nothing here filters by visibility. RLS already returns only the permitted
 * rows, so a second filter in JavaScript would either duplicate the rule (and
 * drift from it) or create the illusion that the interface is what protects the
 * data. One scoped query returns the whole permitted timeline — no per-audience
 * queries, no N+1 (rule 14).
 */

import { requireSupabase } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import type {
  ActivityVisibility,
  OpsActivityEntry,
} from "@/lib/fulfillment/ops-activity-domain";

/* Re-exported so existing importers keep one obvious place to reach it. */
export type { ActivityVisibility };
type Row = Tables<"activity_events">;

export const VISIBILITY_LABEL: Record<ActivityVisibility, string> = {
  bes_internal: "BES Internal",
  organization_internal: "Organization Internal",
  shared_with_partner: "Shared with Partner",
  client_visible: "Client Visible",
};

/** One line explaining who actually ends up reading it. */
export const VISIBILITY_HINT: Record<ActivityVisibility, string> = {
  bes_internal: "Only BES staff. Never the customer or the client.",
  organization_internal: "Only this organization's own staff.",
  shared_with_partner: "BES and the organization working this file.",
  client_visible: "Approved for the end client to read.",
};

/**
 * The safe default, everywhere. Publishing is a decision, so a composer that
 * has not been told otherwise posts to nobody outside BES.
 */
export const DEFAULT_VISIBILITY: ActivityVisibility = "bes_internal";

/** Who is writing, from the authenticated context — never from a component. */
export type AuthorKind = "bes" | "organization";

/**
 * Which levels this author may create.
 *
 * The single source of this rule (rule 13). The database enforces the same
 * thing in the `activity_events` insert policy; this exists so the interface
 * can avoid offering an option that would then be refused, not so the
 * interface can decide.
 *
 * - BES may never post as the organization's internal voice, and vice versa.
 * - `shared_with_partner` needs a live fulfillment relationship — there is no
 *   partner to share with otherwise.
 * - `client_visible` is offered but never preselected; it has to be chosen.
 */
export function allowedVisibilities(
  author: AuthorKind,
  hasActiveEngagement: boolean,
): ActivityVisibility[] {
  const own: ActivityVisibility =
    author === "bes" ? "bes_internal" : "organization_internal";
  const levels: ActivityVisibility[] = [own];
  if (hasActiveEngagement) levels.push("shared_with_partner");
  levels.push("client_visible");
  return levels;
}

/** Guard for the write path: refuse before the database has to. */
export function mayPostAs(
  author: AuthorKind,
  hasActiveEngagement: boolean,
  visibility: ActivityVisibility,
): boolean {
  return allowedVisibilities(author, hasActiveEngagement).includes(visibility);
}

/**
 * The canonical cache identity for one record's timeline.
 *
 * Exported so the reader (`useTimeline`) and the writer (the ops store) name
 * the same cache. Two hand-built key arrays is how a posted comment ends up
 * invalidating something other than the list it belongs to (rule 13).
 */
export const timelineKey = (entityType: string, entityId: string | undefined) =>
  ["activity", entityType, entityId] as const;

export interface TimelineEntry extends OpsActivityEntry {
  visibility: ActivityVisibility;
  /** True for trigger-written events; false for a note somebody typed. */
  isSystem: boolean;
  /**
   * The structured note body, when there is one.
   *
   * NULL for system events and for every note written before rich bodies
   * existed — those render from `detail`, which is always populated.
   */
  body?: unknown;
}

const mapRow = (r: Row): TimelineEntry => ({
  id: String(r.id),
  clientId: r.entity_id,
  timestamp: r.created_at,
  actor: r.actor_name ?? "System",
  action: r.action,
  detail: r.detail ?? "",
  field: r.field ?? undefined,
  previousValue: r.previous_value ?? undefined,
  newValue: r.new_value ?? undefined,
  pinned: r.pinned,
  mark: r.mark ?? undefined,
  visibility: r.visibility,
  body: (r as Row & { body?: unknown }).body ?? undefined,
  // A trigger-written event records a field that changed; a note does not.
  isSystem: r.field !== null,
});

/**
 * The permitted timeline for one record, newest first.
 *
 * `actor_name` is denormalised on the row, so rendering never joins to profiles
 * per entry — the N+1 this would otherwise be.
 */
export async function fetchTimeline(
  entityType: string,
  entityId: string,
  limit = 200,
): Promise<TimelineEntry[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("activity_events")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export interface PostNoteInput {
  agencyId: string;
  organizationId?: string;
  entityType: string;
  entityId: string;
  actorId: string;
  actorName: string;
  action: string;
  detail: string;
  /** Chosen deliberately by the author. There is no safe default here. */
  visibility: ActivityVisibility;
  mark?: string;
  /**
   * Structured rich-text document. `detail` must carry the same content as
   * plain text — it is what search and every non-rich surface read.
   */
  body?: unknown;
}

/**
 * Post a human note onto the timeline.
 *
 * `visibility` is required rather than defaulted: the whole point of this model
 * is that publishing is a decision. The database still checks it — the insert
 * policy refuses a level the author is not entitled to publish at, so a
 * tampered client cannot post as the customer's internal voice.
 *
 * `field` is deliberately left null, which is what marks a row as a human note
 * rather than a system event.
 *
 * Returns the **persisted** row, not the input. The caller needs the database's
 * own id and `created_at` to place the note in the timeline; echoing the input
 * back would put a record on screen that does not exist yet, and leave it there
 * if the write later failed.
 */
export async function postNote(input: PostNoteInput): Promise<TimelineEntry> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("activity_events")
    .insert({
      agency_id: input.agencyId,
      organization_id: input.organizationId ?? null,
      entity_type: input.entityType,
      entity_id: input.entityId,
      actor_id: input.actorId,
      actor_name: input.actorName,
      action: input.action,
      detail: input.detail,
      visibility: input.visibility,
      mark: input.mark ?? null,
      body: (input.body ?? null) as never,
    })
    .select()
    .single();
  if (error) throw error;
  // Guaranteed present: the insert policy's first conjunct is
  // `can_view_activity(...)`, so a row that may be written may be read back.
  return mapRow(data as Row);
}
