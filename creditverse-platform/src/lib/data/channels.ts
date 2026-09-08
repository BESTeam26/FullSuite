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
import type { MentionCandidate } from "@/components/composer/MentionPicker";

export interface Channel {
  id: string;
  /** Exactly one of these three is set (0190, 0191). */
  organizationId: string | null;
  agencyId: string | null;
  partnerGroupId: string | null;
  /** Scopes a partner conversation to one service engagement (0192, §19). */
  partnerServiceId: string | null;
  /** Whose channel it is, for the label. */
  organizationName?: string | null;
  partnerName?: string | null;
  serviceName?: string | null;
  kind: "general" | "department" | "topic" | "direct";
  name: string;
  /** What to call it HERE. A direct message shows the other person. */
  displayName: string;
  purpose: string | null;
  /** A deliberate all-hands conversation rather than a members-only one. */
  openToScope: boolean;
  archivedAt: string | null;
  /** Whether BES can currently reach it. Derived, never stored. */
  sharedWithBes: boolean;
  /**
   * Readable for ADMINISTRATION but not a conversation this person is in
   * (0192, §17). Grouped separately and never counted as unread, because
   * being able to inspect something is not the same as owing it a reply.
   */
  auditOnly: boolean;
  isManager: boolean;
  unread: number;
  lastMessageAt: string | null;
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
 * Every conversation this person may reach, with unread counts, in ONE call.
 *
 * ── WHY THERE IS NO `owner` ARGUMENT ANY MORE ──────────────────────────────
 *
 * There used to be one, and it was the wrong shape. Dee, §20: "Agency
 * Communication should be capable of displaying all authorized conversation
 * types in ONE interface... Do not build five separate inboxes." A caller who
 * has to say which kind of conversation they want is a caller deciding
 * visibility a second time, differently from the database.
 *
 * `visible_channels()` is SECURITY INVOKER, so `channels_select` remains the
 * only answer to who may see what. This function asks for everything and
 * renders whatever arrives — for a BES agent that is their internal channels,
 * their partners and the organization channels shared into their scope; for a
 * partner contact it is their own partner's conversations; for an organization
 * member it is theirs. Same row, different chairs (§1, §45).
 *
 * Unread comes back with the list rather than one query per channel, which on
 * a forty-conversation inbox is the difference between one request and
 * forty-one (rule 14).
 */
export async function fetchChannels(): Promise<Channel[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("visible_channels");
  if (error) throw error;
  return (data ?? []).map((row) => {
    const c = row as Record<string, unknown>;
    return {
      id: c.id as string,
      organizationId: (c.organization_id as string) ?? null,
      agencyId: (c.agency_id as string) ?? null,
      partnerGroupId: (c.partner_group_id as string) ?? null,
      partnerServiceId: (c.partner_service_id as string) ?? null,
      organizationName: (c.organization_name as string) ?? null,
      partnerName: (c.partner_name as string) ?? null,
      serviceName: (c.service_name as string) ?? null,
      kind: c.kind as Channel["kind"],
      name: c.name as string,
      displayName: (c.display_name as string) || (c.name as string),
      purpose: (c.purpose as string) ?? null,
      openToScope: !!c.open_to_scope,
      archivedAt: (c.archived_at as string) ?? null,
      sharedWithBes: !!c.shared_with_bes,
      auditOnly: !!c.audit_only,
      isManager: !!c.is_manager,
      unread: Number(c.unread ?? 0),
      lastMessageAt: (c.last_message_at as string) ?? null,
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
/**
 * Open a conversation.
 *
 * ── TWO PATHS, AND WHY THEY ARE NOT ONE ────────────────────────────────────
 *
 * A BES channel goes through `create_agency_channel()`: creating it and
 * joining it are two writes whose policies deadlock for anybody who is not
 * already an administrator — the channel exists, and its creator cannot add
 * themselves to it because they are not yet its manager. One authorized
 * transaction removes the question (0198, Dee §2). The agency is resolved
 * inside that function from the caller's own membership, so this code has no
 * agency id to get wrong.
 *
 * An ORGANIZATION or PARTNER channel is a plain insert, because there is no
 * deadlock: the organization member or the assigned staff member passes
 * `channels_insert` on their own, and `channel_manager` lets them add
 * themselves.
 */
export async function createChannel(input: {
  name: string;
  kind: string;
  purpose?: string | null;
  createdBy: string;
  organizationId?: string | null;
  agencyId?: string | null;
  partnerGroupId?: string | null;
  openToScope?: boolean;
  partnerServiceId?: string | null;
  teamIds?: string[];
  userIds?: string[];
  systemKey?: string | null;
}): Promise<string> {
  const sb = requireSupabase();

  if (!input.organizationId && !input.partnerGroupId) {
    const { data, error } = await sb.rpc("create_agency_channel", {
      p_name: input.name,
      p_purpose: input.purpose ?? null,
      p_kind: input.kind,
      p_open_to_scope: input.openToScope ?? false,
      p_team_ids: input.teamIds ?? [],
      p_user_ids: input.userIds ?? [],
    });
    if (error) throw error;
    return data as string;
  }

  const owners = (input.organizationId ? 1 : 0) + (input.partnerGroupId ? 1 : 0);
  if (owners !== 1) {
    throw new Error(
      "A conversation belongs to exactly one of: an organization, the agency, or a partner",
    );
  }

  const { data, error } = await sb.from("channels").insert({
    name: input.name.trim(),
    kind: input.kind,
    purpose: input.purpose?.trim() || null,
    created_by: input.createdBy,
    organization_id: input.organizationId ?? null,
    agency_id: null,
    partner_group_id: input.partnerGroupId ?? null,
    open_to_scope: input.openToScope ?? false,
    partner_service_id: input.partnerServiceId ?? null,
  } as never).select("id").single();
  if (error) throw error;

  const id = (data as { id: string }).id;
  /* The creator manages it. Two statements rather than one — `channel_members`
     has its own policy and the insert must see the channel row committed. */
  const { error: memberError } = await sb.from("channel_members")
    .insert({ channel_id: id, user_id: input.createdBy, is_manager: true } as never);
  if (memberError) throw memberError;

  for (const teamId of input.teamIds ?? []) {
    const { error: teamError } = await sb.from("channel_teams")
      .insert({ channel_id: id, team_id: teamId } as never);
    if (teamError) throw teamError;
  }
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
    /* A whole-partner conversation: everybody assigned to this partner is in
       it, without anybody being added one at a time. A narrower conversation
       about one service is created deliberately, with its own scope (§19). */
    openToScope: true,
  });
}


/* ------------------------------------------------------------------------ *
 * The central inbox's other verbs.
 * ------------------------------------------------------------------------ */

/** Where this person has read up to. Never moves backwards (0193). */
export async function markChannelRead(channelId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("mark_channel_read", { p_channel: channelId });
  if (error) throw error;
}

export interface MessageHit {
  messageId: number;
  channelId: string;
  channelName: string;
  authorName: string;
  bodyText: string;
  createdAt: string;
}

/**
 * Search, which cannot see further than the conversation list.
 *
 * Dee, §24: "Search is not allowed to bypass RLS." It does not try — the
 * function is SECURITY INVOKER and narrowed to `channel_visible`, so a
 * conversation somebody may only inspect for administration does not appear
 * here either. Nothing is filtered on this side; there is nothing to filter.
 */
export async function searchMessages(query: string, limit = 40): Promise<MessageHit[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("search_messages", { p_query: query, p_limit: limit });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const h = r as Record<string, unknown>;
    return {
      messageId: Number(h.message_id),
      channelId: h.channel_id as string,
      channelName: h.channel_name as string,
      authorName: (h.author_name as string) ?? "Someone",
      bodyText: h.body_text as string,
      createdAt: h.created_at as string,
    };
  });
}

/** The ONE direct conversation with somebody, found or created (§13). */
export async function openDirectChannel(otherUserId: string): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("open_direct_channel", { p_other: otherUserId });
  if (error) throw error;
  return data as string;
}

export interface ChannelTeam {
  teamId: string;
}

export async function fetchChannelTeams(channelId: string): Promise<ChannelTeam[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("channel_teams").select("team_id").eq("channel_id", channelId);
  if (error) throw error;
  return (data ?? []).map((t) => ({ teamId: t.team_id }));
}

/**
 * Put a TEAM in a conversation (§12).
 *
 * The point of this over naming people: joining and leaving the team is then
 * the only thing anybody edits, and nobody has to remember to take a leaver
 * out of eleven channels (§32).
 */
export async function addChannelTeam(channelId: string, teamId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("channel_teams")
    .insert({ channel_id: channelId, team_id: teamId } as never);
  if (error) throw error;
}

export async function removeChannelTeam(channelId: string, teamId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("channel_teams")
    .delete().eq("channel_id", channelId).eq("team_id", teamId);
  if (error) throw error;
}

/** Restore an archived conversation. Archiving is never deletion (§30). */
export async function restoreChannel(channelId: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("channels")
    .update({ archived_at: null } as never).eq("id", channelId);
  if (error) throw error;
}


/**
 * Who the "@" picker may offer in this conversation.
 *
 * `channel_mentionable()` is the set form of the same predicate the notifier
 * asks, so the picker cannot offer somebody the notification will skip — type
 * a name, nothing happens, and people stop trusting mentions. It returns
 * nothing at all to a caller who cannot see the channel, so there is no
 * filtering to do here and nothing to get wrong (0207, §27).
 */
export async function fetchChannelMentionable(channelId: string): Promise<MentionCandidate[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("channel_mentionable", { p_channel: channelId });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const c = r as Record<string, unknown>;
    return {
      userId: c.user_id as string,
      name: (c.name as string) ?? "Someone",
      email: (c.email as string) ?? null,
      hint: (c.hint as string) ?? null,
    };
  });
}
