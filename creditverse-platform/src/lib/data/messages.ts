/**
 * Messages — the rich part of the one conversation.
 *
 * ── ONE CALL PER CONVERSATION ──────────────────────────────────────────────
 *
 * `channel_messages()` returns the messages with their reactions, reply
 * counts, quoted context, pins, attachments and announcement cards already
 * attached. The alternative is a query per message per feature, which on a
 * sixty-message conversation is several hundred round trips to open a channel
 * (rule 14, Dee §41–§43).
 *
 * ── THE ONE RULE THAT OUTRANKS EVERYTHING HERE ─────────────────────────────
 *
 * Dee, §30, marked permanent: nobody deletes anybody else's message — not a
 * manager, not an admin, not the owner. `delete_own_message` is a readable
 * error message; `messages_update` (author_id = auth.uid(), both sides) is
 * what actually refuses. Removing this file would not let one person delete
 * another's message.
 */
import { requireSupabase } from "@/lib/supabase/client";
import { buildMessageBody } from "@/lib/communication/message-body";
import type { MentionAttrs } from "@/lib/activity/mentions";

export interface Reaction {
  emoji: string;
  count: number;
  /** Whether the caller is one of them. Drives the toggle, never a second query. */
  mine: boolean;
}

export interface Attachment {
  id: string;
  name: string;
  path: string;
  mime: string | null;
  size: number | null;
}

export interface RichMessage {
  id: number;
  channelId: string;
  authorId: string;
  authorName: string;
  fromBes: boolean;
  /** NULL for a tombstone. The server withholds it; this does not hide it. */
  bodyText: string | null;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  messageType: "message" | "announcement" | "meeting" | "system";
  /** An announcement CARD. Title and body come from the canonical record, and
   *  are null when the reader is not authorized for it (0200, §15). */
  announcementId: string | null;
  announcementTitle: string | null;
  announcementBody: string | null;
  announcementPublishedAt: string | null;
  parentMessageId: number | null;
  replyToId: number | null;
  replyToText: string | null;
  replyToAuthor: string | null;
  replyCount: number;
  lastReplyAt: string | null;
  pinned: boolean;
  reactions: Reaction[];
  attachments: Attachment[];
  /**
   * Who the message named, with the labels the author saw. From the document
   * rather than from `profiles`, so a message reads as it was written (0208).
   */
  mentions: MentionAttrs[];
  /** Only on an optimistic row, until the server's own row replaces it. */
  pending?: boolean;
  failed?: boolean;
  clientMessageId?: string;
}

const toReactions = (v: unknown): Reaction[] =>
  Array.isArray(v)
    ? v.map((r) => {
        const x = r as Record<string, unknown>;
        return { emoji: String(x.emoji), count: Number(x.count ?? 0), mine: !!x.mine };
      })
    : [];

const toAttachments = (v: unknown): Attachment[] =>
  Array.isArray(v)
    ? v.map((a) => {
        const x = a as Record<string, unknown>;
        return {
          id: String(x.id), name: String(x.name), path: String(x.path),
          mime: (x.mime as string) ?? null,
          size: x.size === null || x.size === undefined ? null : Number(x.size),
        };
      })
    : [];

const toMentions = (v: unknown): MentionAttrs[] =>
  Array.isArray(v)
    ? v.flatMap((m) => {
        const x = m as Record<string, unknown>;
        const userId = String(x.userId ?? "");
        const label = String(x.label ?? "").trim();
        return userId && label ? [{ userId, label }] : [];
      })
    : [];

function toRich(row: Record<string, unknown>): RichMessage {
  return {
    id: Number(row.id),
    channelId: (row.channel_id as string) ?? "",
    authorId: row.author_id as string,
    authorName: (row.author_name as string) ?? "Someone",
    fromBes: !!row.author_is_bes,
    bodyText: (row.body_text as string) ?? null,
    createdAt: row.created_at as string,
    editedAt: (row.edited_at as string) ?? null,
    deleted: !!row.deleted,
    messageType: (row.message_type as RichMessage["messageType"]) ?? "message",
    announcementId: (row.announcement_id as string) ?? null,
    announcementTitle: (row.announcement_title as string) ?? null,
    announcementBody: (row.announcement_body as string) ?? null,
    announcementPublishedAt: (row.announcement_published_at as string) ?? null,
    parentMessageId: row.parent_message_id === null || row.parent_message_id === undefined
      ? null : Number(row.parent_message_id),
    replyToId: row.reply_to_id === null || row.reply_to_id === undefined
      ? null : Number(row.reply_to_id),
    replyToText: (row.reply_to_text as string) ?? null,
    replyToAuthor: (row.reply_to_author as string) ?? null,
    replyCount: Number(row.reply_count ?? 0),
    lastReplyAt: (row.last_reply_at as string) ?? null,
    pinned: !!row.pinned,
    reactions: toReactions(row.reactions),
    attachments: toAttachments(row.attachments),
    mentions: toMentions(row.mentions),
  };
}

export async function fetchChannelMessages(channelId: string, limit = 60): Promise<RichMessage[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("channel_messages", { p_channel: channelId, p_limit: limit });
  if (error) throw error;
  return (data ?? []).map((r) => toRich(r as Record<string, unknown>));
}

/** A thread's replies, fetched only when the thread is opened. */
export async function fetchThread(rootId: number): Promise<RichMessage[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("thread_messages", { p_root: rootId });
  if (error) throw error;
  return (data ?? []).map((r) =>
    toRich({ ...(r as Record<string, unknown>), parent_message_id: rootId }));
}

export interface SendInput {
  channelId: string;
  authorId: string;
  bodyText: string;
  /** §44. The same key on a retry writes no second message. */
  clientMessageId: string;
  parentMessageId?: number | null;
  replyToId?: number | null;
  /**
   * Who the author picked from the "@" list. `buildMessageBody` decides which
   * of them are actually still named in the text — somebody whose label was
   * typed and then deleted is not mentioned (0207).
   */
  mentions?: readonly MentionAttrs[];
}

/**
 * Send one message.
 *
 * `on conflict do nothing` is not used: the unique index on
 * (author_id, client_message_id) means a retry raises 23505, and that is the
 * correct answer — the message is already there. The caller treats it as
 * success rather than as an error to show somebody (§44, §45).
 */
export async function sendMessage(input: SendInput): Promise<RichMessage | null> {
  const sb = requireSupabase();
  /* The document carries mention NODES; `body_text` keeps "@Label" verbatim,
     which is what search and notification detail read. Neither is derived
     from the other at read time, so they cannot drift (0207). */
  const { body, bodyText } = buildMessageBody(input.bodyText, input.mentions ?? []);
  const { data, error } = await sb.from("messages").insert({
    channel_id: input.channelId,
    author_id: input.authorId,
    body,
    body_text: bodyText,
    client_message_id: input.clientMessageId,
    parent_message_id: input.parentMessageId ?? null,
    reply_to_id: input.replyToId ?? null,
  } as never).select("id").single();

  if (error) {
    /* The same message, already accepted. Not a failure. */
    if (error.code === "23505") return null;
    throw error;
  }
  return { id: Number((data as { id: number }).id) } as RichMessage;
}

/** Toggle your own reaction. Nobody can remove anybody else's (§20). */
export async function toggleReaction(messageId: number, emoji: string, mine: boolean): Promise<void> {
  const sb = requireSupabase();
  if (mine) {
    const { error } = await sb.from("message_reactions")
      .delete().eq("message_id", messageId).eq("emoji", emoji);
    if (error) throw error;
    return;
  }
  const { error } = await sb.from("message_reactions")
    .insert({ message_id: messageId, emoji } as never);
  /* Two tabs, one emoji: already there is the state we wanted. */
  if (error && error.code !== "23505") throw error;
}

export async function pinMessage(channelId: string, messageId: number): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("message_pins")
    .insert({ channel_id: channelId, message_id: messageId } as never);
  if (error && error.code !== "23505") throw error;
}

export async function unpinMessage(messageId: number): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("message_pins").delete().eq("message_id", messageId);
  if (error) throw error;
}

/** Your own message, tombstoned. This is also Unsend (§33). */
export async function deleteOwnMessage(messageId: number): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.rpc("delete_own_message", { p_id: messageId });
  if (error) throw error;
}

export async function editOwnMessage(
  messageId: number, bodyText: string, mentions: readonly MentionAttrs[] = [],
): Promise<void> {
  const sb = requireSupabase();
  const { body, bodyText: text } = buildMessageBody(bodyText, mentions);
  const { error } = await sb.from("messages").update({
    body_text: text,
    body,
    edited_at: new Date().toISOString(),
  } as never).eq("id", messageId);
  if (error) throw error;
}

/**
 * Attach a file to a message.
 *
 * The canonical `files` table and the canonical private bucket. The path is
 * `<tenant>/channels/<channelId>/…`, which is what `bes_files_select` reads to
 * decide access: the object is reachable exactly when the conversation is
 * (0203, §26). A path copied out of the page grants nothing on its own.
 */
export async function attachToMessage(input: {
  messageId: number;
  channelId: string;
  organizationId: string | null;
  file: File;
  uploadedBy: string;
}): Promise<void> {
  const sb = requireSupabase();
  const tenant = input.organizationId ?? "agency";
  const safe = input.file.name.replace(/[^\w.-]+/g, "_").slice(0, 120);
  const path = `${tenant}/channels/${input.channelId}/${crypto.randomUUID()}-${safe}`;

  const { error: upErr } = await sb.storage.from("bes-files")
    .upload(path, input.file, { contentType: input.file.type || undefined, upsert: false });
  if (upErr) throw upErr;

  const { error } = await sb.from("files").insert({
    organization_id: input.organizationId,
    entity_type: "channel_message",
    entity_id: String(input.messageId),
    bucket: "bes-files",
    path,
    name: input.file.name.slice(0, 200),
    mime_type: input.file.type || null,
    size_bytes: input.file.size,
    uploaded_by: input.uploadedBy,
  } as never);
  if (error) throw error;
}

/** A short-lived link. The bucket is private; there is no public URL to leak. */
export async function signedAttachmentUrl(path: string, seconds = 300): Promise<string> {
  const sb = requireSupabase();
  const { data, error } = await sb.storage.from("bes-files").createSignedUrl(path, seconds);
  if (error) throw error;
  return data.signedUrl;
}

export interface PinnedMessage {
  messageId: number;
  pinnedAt: string;
}

export async function fetchPins(channelId: string): Promise<PinnedMessage[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("message_pins")
    .select("message_id, pinned_at").eq("channel_id", channelId).order("pinned_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((p) => ({ messageId: Number(p.message_id), pinnedAt: p.pinned_at }));
}

/**
 * ONE message, in the same shape the list speaks.
 *
 * For a realtime arrival. The payload is the raw row — an author id, no
 * reactions, no reply count — and refetching the conversation to render one
 * incoming line is what §43 forbids. One small read instead.
 */
export async function fetchMessageById(id: number): Promise<RichMessage | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc("channel_message_by_id", { p_id: id });
  if (error) throw error;
  const row = (data ?? [])[0];
  return row ? toRich(row as Record<string, unknown>) : null;
}

export interface MessageRevision {
  id: number;
  bodyText: string;
  editedBy: string | null;
  editedAt: string;
}

/** What a message said before each edit. Append-only in the database. */
export async function fetchMessageRevisions(messageId: number): Promise<MessageRevision[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("message_revisions")
    .select("id, body_text, edited_by, edited_at")
    .eq("message_id", messageId)
    .order("edited_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: Number(r.id), bodyText: r.body_text,
    editedBy: r.edited_by ?? null, editedAt: r.edited_at,
  }));
}
