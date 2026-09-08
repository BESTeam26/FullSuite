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
  /** Exactly one of these three is set (0190, 0191). */
  organizationId: string | null;
  agencyId: string | null;
  partnerGroupId: string | null;
  /** Whose channel it is, for the label. */
  organizationName?: string | null;
  partnerName?: string | null;
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

/**
 * Every channel the caller may see for one owner.
 *
 * ── THE AGENCY VIEW IS DELIBERATELY WIDER ──────────────────────────────────
 *
 * Dee: "IF a BES agent is supporting fulfillment inside an Organization, that
 * organization channel will show inside the BES Communication channel as ONE
 * CANONICAL CHANNEL as well. Not duplicate."
 *
 * So the agency view asks for every channel RLS will give it and sorts them
 * into two kinds:
 *
 *   BES's own team channels          agency_id set
 *   a partner's channel shared with  organization_id set, reachable because a
 *   BES                              live share says BES may read it
 *
 * The second kind is the SAME ROW the organization sees. Not a copy, not a
 * mirror, not a synced twin — one channel, two doors. An agent answers in the
 * partner's channel from the BES view and the partner sees the reply in
 * theirs, because there is only one conversation.
 *
 * This is why the query does not filter by owner at all in the agency case:
 * `channel_visible` already decides, and asking for less would mean deciding
 * a second time, differently.
 *
 * The partner case is the same row from the other side. A partner contact asks
 * for their own group's conversations and gets the SAME channel BES sees —
 * `is_partner_contact_of` is the other branch of `channel_visible`, not a
 * second table.
 */
export async function fetchChannels(
  owner: { organizationId: string } | { agencyId: string } | { partnerGroupId: string },
): Promise<Channel[]> {
  const sb = requireSupabase();
  let q = sb
    .from("channels")
    .select("id, organization_id, agency_id, partner_group_id, kind, name, purpose, organizations(name), outsourcing_groups(name), channel_shares(id, revoked_at)");

  if ("organizationId" in owner) {
    q = q.eq("organization_id", owner.organizationId);
  } else if ("partnerGroupId" in owner) {
    q = q.eq("partner_group_id", owner.partnerGroupId);
  }
  /* No filter in the agency case. RLS returns BES's own channels, every
     organization channel shared with BES, and every partner conversation the
     caller may see — which is exactly the set, and needed no query change when
     partner conversations were added (0191). That is what a single canonical
     table buys. */

  const { data, error } = await q
    .is("archived_at", null)
    .order("kind")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((row) => {
    const c = row as Record<string, unknown>;
    const org = (c.organizations ?? null) as { name?: string } | null;
    const partner = (c.outsourcing_groups ?? null) as { name?: string } | null;
    return {
      id: c.id as string,
      organizationId: (c.organization_id as string) ?? null,
      agencyId: (c.agency_id as string) ?? null,
      partnerGroupId: (c.partner_group_id as string) ?? null,
      organizationName: org?.name ?? null,
      partnerName: partner?.name ?? null,
      kind: c.kind as Channel["kind"],
      name: c.name as string,
      purpose: (c.purpose as string) ?? null,
      sharedWithBes: ((c.channel_shares ?? []) as { revoked_at: string | null }[])
        .some((s) => s.revoked_at === null),
    };
  });
}

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


/**
 * Open a channel.
 *
 * The creator joins as its manager in the same breath: a channel nobody can
 * manage is one nobody can add anybody to, and the person opening it is the
 * obvious first manager. Two statements rather than one — `channel_members`
 * has its own policy, and the insert must see the channel row already
 * committed to satisfy it.
 */
export async function createChannel(input: {
  name: string;
  kind: string;
  purpose?: string | null;
  createdBy: string;
  organizationId?: string | null;
  agencyId?: string | null;
  partnerGroupId?: string | null;
}): Promise<string> {
  const sb = requireSupabase();
  const owners = (input.organizationId ? 1 : 0) + (input.agencyId ? 1 : 0) + (input.partnerGroupId ? 1 : 0);
  if (owners !== 1) {
    throw new Error("A conversation belongs to exactly one of: an organization, the agency, or a partner");
  }
  const { data, error } = await sb.from("channels").insert({
    name: input.name.trim(),
    kind: input.kind,
    purpose: input.purpose?.trim() || null,
    created_by: input.createdBy,
    organization_id: input.organizationId ?? null,
    agency_id: input.agencyId ?? null,
    partner_group_id: input.partnerGroupId ?? null,
  } as never).select("id").single();
  if (error) throw error;

  const id = (data as { id: string }).id;
  const { error: memberError } = await sb.from("channel_members")
    .insert({ channel_id: id, user_id: input.createdBy, is_manager: true } as never);
  if (memberError) throw memberError;
  return id;
}

/** Archive, never delete — a conversation that happened is a record of it. */
export async function archiveChannel(channelId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("channels")
    .update({ archived_at: new Date().toISOString() } as never).eq("id", channelId);
  if (error) throw error;
}

export interface ChannelMember {
  userId: string;
  isManager: boolean;
}

export async function fetchChannelMembers(channelId: string): Promise<ChannelMember[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("channel_members").select("user_id, is_manager").eq("channel_id", channelId);
  if (error) throw error;
  return (data ?? []).map((m) => ({ userId: m.user_id, isManager: m.is_manager }));
}

export async function addChannelMember(channelId: string, userId: string, isManager = false): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("channel_members")
    .upsert({ channel_id: channelId, user_id: userId, is_manager: isManager } as never,
            { onConflict: "channel_id,user_id" });
  if (error) throw error;
}

export async function removeChannelMember(channelId: string, userId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("channel_members")
    .delete().eq("channel_id", channelId).eq("user_id", userId);
  if (error) throw error;
}

/**
 * Open — or reopen — the conversation with one partner.
 *
 * A partner has ONE canonical conversation, so this looks before it creates.
 * Two agents clicking "Conversation" on the same partner an hour apart must
 * land in the same channel, otherwise the promise that a partner's portal and
 * the BES view are two doors onto one row quietly becomes untrue.
 *
 * Called on click, never on page load: the partner profile does not need the
 * channel list to render, and asking for it there would be a request nobody
 * asked for (rule 14).
 */
export async function openPartnerConversation(input: {
  partnerGroupId: string;
  partnerName: string;
  createdBy: string;
}): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("channels")
    .select("id")
    .eq("partner_group_id", input.partnerGroupId)
    .is("archived_at", null)
    .order("created_at")
    .limit(1);
  if (error) throw error;
  if (data && data.length > 0) return (data[0] as { id: string }).id;

  return createChannel({
    name: "General",
    kind: "general",
    purpose: `BES and ${input.partnerName}`,
    createdBy: input.createdBy,
    partnerGroupId: input.partnerGroupId,
  });
}
