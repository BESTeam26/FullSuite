/**
 * Channels — the organization's own conversation, and the one bridge to BES.
 *
 * Every query is a plain select against a table whose policies already decide
 * what a caller may see. Nothing here filters for privacy: a channel that is
 * not yours does not arrive, and a channel BES may not reach does not arrive
 * for BES. That is the point of putting the rule in `channel_visible()` rather
 * than in this file.
 *
 * Shaped for rule 14: the list is one query, a channel's messages are one
 * query, and neither loads the other's data. Opening the app must not fetch
 * every message in every channel.
 */
import { requireSupabase } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";

export interface Channel {
  id: string;
  organizationId: string;
  kind: "general" | "department" | "topic" | "direct";
  name: string;
  purpose: string | null;
  /** Whether BES can currently reach it. Derived, never stored. */
  sharedWithBes: boolean;
}

export interface ChannelMessage {
  id: number;
  channelId: string;
  authorId: string;
  authorName: string;
  body: Json;
  bodyText: string;
  createdAt: string;
  editedAt: string | null;
  /**
   * Whether the author was BES staff WHEN THEY WROTE IT. Read from the row, not
   * recomputed, so attribution survives someone changing teams.
   */
  fromBes: boolean;
}

/** Every channel the caller may see. One request (rule 14). */
export async function fetchChannels(organizationId: string): Promise<Channel[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("channels")
    .select("id, organization_id, kind, name, purpose, channel_shares(id, revoked_at)")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("kind")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    organizationId: c.organization_id,
    kind: c.kind as Channel["kind"],
    name: c.name,
    purpose: c.purpose,
    sharedWithBes: (c.channel_shares ?? []).some((s: { revoked_at: string | null }) => s.revoked_at === null),
  }));
}

/**
 * One channel's messages, newest last so a conversation reads downward.
 * Paged from the end, because a channel open for a year should not send a
 * year of history to a phone.
 */
export async function fetchMessages(channelId: string, limit = 50): Promise<ChannelMessage[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("messages")
    .select("id, channel_id, author_id, body, body_text, created_at, edited_at, author_is_bes, profiles!messages_author_id_fkey(full_name, email)")
    .eq("channel_id", channelId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? [])
    .map((m) => {
      const p = m.profiles as { full_name: string | null; email: string } | null;
      return {
        id: m.id,
        channelId: m.channel_id,
        authorId: m.author_id,
        authorName: p?.full_name?.trim() || p?.email || "Someone",
        body: m.body,
        bodyText: m.body_text,
        createdAt: m.created_at,
        editedAt: m.edited_at,
        /* Stamped on the row when it was written, so a person leaving or
                   joining the BES team never rewrites who said what. */
                fromBes: m.author_is_bes,
      };
    })
    .reverse();
}

export async function postMessage(input: {
  channelId: string; authorId: string; body: Json; bodyText: string; replyToId?: number;
}): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("messages").insert({
    channel_id: input.channelId,
    author_id: input.authorId,
    body: input.body,
    body_text: input.bodyText,
    reply_to_id: input.replyToId ?? null,
  });
  if (error) throw error;
}

/**
 * Share a channel with BES against a specific engagement.
 *
 * The engagement is the point: access follows the commercial relationship, so
 * when it ends nobody has to remember to revoke anything.
 */
export async function shareChannel(channelId: string, engagementId: string, createdBy: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("channel_shares").insert({
    channel_id: channelId, engagement_id: engagementId, created_by: createdBy,
  });
  if (error) throw error;
}

export async function revokeShare(shareId: string, revokedBy: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb
    .from("channel_shares")
    .update({ revoked_at: new Date().toISOString(), revoked_by: revokedBy })
    .eq("id", shareId);
  if (error) throw error;
}
