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
import type { Enums, Tables } from "@/lib/supabase/database.types";
import type { OpsActivityEntry } from "@/lib/fulfillment/ops-activity-domain";

export type ActivityVisibility = Enums<"activity_visibility">;
type Row = Tables<"activity_events">;

/** What a BES user may post. Organization staff post their own internal notes. */
export const BES_POSTABLE: ActivityVisibility[] = [
  "bes_internal",
  "shared_with_partner",
  "client_visible",
];

export const VISIBILITY_LABEL: Record<ActivityVisibility, string> = {
  bes_internal: "Internal — BES only",
  organization_internal: "Internal — organization only",
  shared_with_partner: "Shared with partner",
  client_visible: "Visible to client",
};

export interface TimelineEntry extends OpsActivityEntry {
  visibility: ActivityVisibility;
  /** True for trigger-written events; false for a note somebody typed. */
  isSystem: boolean;
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
 */
export async function postNote(input: PostNoteInput): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("activity_events").insert({
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
  });
  if (error) throw error;
}
