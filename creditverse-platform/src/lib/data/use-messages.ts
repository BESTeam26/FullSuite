/**
 * Messages, and the send that has to feel instant.
 *
 * ── WHY THE OPTIMISTIC PATH IS THE MAIN PATH ───────────────────────────────
 *
 * Dee: "first message send feels slow/delayed... Sending should FEEL instant."
 * (§41, §42)
 *
 * The old send waited for the insert to come back and then invalidated the
 * message list AND the channel list, so pressing Enter cost a round trip plus
 * two refetches before a single character appeared. Now:
 *
 *   1. a client_message_id is minted
 *   2. the message goes into the cache immediately, marked pending
 *   3. the composer clears
 *   4. the insert goes out
 *   5. the pending row is reconciled, NOT the whole list refetched
 *
 * §43 is the other half: "Do not invalidate the entire Communication app...
 * after each message." The channel list is left alone on send — its unread and
 * last-message time are refreshed on its own schedule, not by the person
 * typing.
 *
 * A retry carries the SAME key, so a flaky network produces one message (§44).
 */
import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  attachToMessage, deleteOwnMessage, editOwnMessage, fetchChannelFiles,
  fetchChannelMessages,
  fetchThread, pinMessage, sendMessage, toggleReaction, unpinMessage,
  type RichMessage,
} from "@/lib/data/messages";
import { useAuth } from "@/lib/auth/auth-context";
import type { MentionAttrs } from "@/lib/activity/mentions";

export const richMessagesKey = (channelId: string | null) =>
  ["messages", channelId ?? ""] as const;
export const threadKey = (rootId: number | null) => ["messages", "thread", rootId ?? 0] as const;

export function useRichMessages(channelId: string | null) {
  return useQuery({
    queryKey: richMessagesKey(channelId),
    queryFn: () => fetchChannelMessages(channelId!),
    enabled: !!channelId,
    staleTime: 10_000,
  });
}

export function useThread(rootId: number | null) {
  return useQuery({
    queryKey: threadKey(rootId),
    queryFn: () => fetchThread(rootId!),
    enabled: !!rootId,
    staleTime: 10_000,
  });
}

const optimistic = (input: {
  clientMessageId: string; channelId: string; authorId: string;
  authorName: string; bodyText: string; parentMessageId: number | null; replyToId: number | null;
  mentions: readonly MentionAttrs[];
}): RichMessage => ({
  /* Negative, so it cannot collide with a real bigint id and is obvious in a
     debugger as "not yet real". */
  id: -Date.now(),
  channelId: input.channelId,
  authorId: input.authorId,
  authorName: input.authorName,
  fromBes: true,
  bodyText: input.bodyText,
  createdAt: new Date().toISOString(),
  editedAt: null,
  deleted: false,
  messageType: "message",
  announcementId: null, announcementTitle: null, announcementBody: null,
  announcementPublishedAt: null,
  parentMessageId: input.parentMessageId,
  replyToId: input.replyToId,
  replyToText: null, replyToAuthor: null,
  replyCount: 0,
  replyParticipants: [], lastReplyAt: null, pinned: false,
  reactions: [], attachments: [], mentions: [...input.mentions],
  pending: true,
  clientMessageId: input.clientMessageId,
});

export interface PendingSend {
  clientMessageId: string;
  bodyText: string;
  parentMessageId: number | null;
  replyToId: number | null;
  /** Carried on the retry too, so a re-send names the same people. */
  mentions?: readonly MentionAttrs[];
}

/**
 * Sending. The message goes immediately; there is no Undo window — Dee,
 * 2026-09-21 (second time): the "Sent. Unsend" bar under the conversation
 * "is not needed". A wrong message is deleted from its own "…" menu, which
 * leaves the honest tombstone (§32) rather than pretending it was never sent.
 */
export function useSendMessage(channelId: string | null, opts?: { onSent?: () => void }) {
  const qc = useQueryClient();
  const auth = useAuth();
  const [failed, setFailed] = useState<PendingSend[]>([]);
  const key = richMessagesKey(channelId);

  const put = useCallback((rows: (prev: RichMessage[]) => RichMessage[]) => {
    qc.setQueryData<RichMessage[]>(key, (prev) => rows(prev ?? []));
  }, [qc, key]);

  const send = useMutation({
    mutationFn: async (v: PendingSend) => {
      const row = await sendMessage({
        channelId: channelId!,
        authorId: auth.user?.id ?? "",
        bodyText: v.bodyText,
        clientMessageId: v.clientMessageId,
        parentMessageId: v.parentMessageId,
        replyToId: v.replyToId,
        mentions: v.mentions,
      });
      return { v, id: row?.id ?? null };
    },
    onMutate: (v) => {
      setFailed((f) => f.filter((x) => x.clientMessageId !== v.clientMessageId));
      if (v.parentMessageId) return;
      put((prev) => [
        ...prev,
        optimistic({
          ...v,
          channelId: channelId!,
          authorId: auth.user?.id ?? "",
          authorName: auth.displayName ?? "You",
          mentions: v.mentions ?? [],
        }),
      ]);
    },
    onSuccess: ({ v, id }) => {
      if (v.parentMessageId) {
        void qc.invalidateQueries({ queryKey: threadKey(v.parentMessageId) });
        /* And the PARENT in the conversation, which is what shows "2 replies".
           Without this the indicator did not appear until the whole channel
           was refetched — Dee posted two replies and the message above them
           still looked like nobody had answered. Patched in place rather than
           refetched: the answer is already known (rule 14). */
        const me = auth.user?.id ?? null;
        const myName = auth.displayName ?? "You";
        put((prev) => prev.map((m) => {
          if (m.id !== v.parentMessageId) return m;
          /* One face per person, most recent first, five at most — the same
             rule the database applies when the row is next read, so the
             optimistic row and the real one agree. */
          const already = m.replyParticipants.filter((p) => p.id !== me);
          return {
            ...m,
            replyCount: m.replyCount + 1,
            lastReplyAt: new Date().toISOString(),
            replyParticipants: me
              ? [{ id: me, name: myName }, ...already].slice(0, 5)
              : m.replyParticipants,
          };
        }));
      } else {
        /* Reconcile the ONE row rather than refetching the conversation. */
        put((prev) => prev.map((m) =>
          m.clientMessageId === v.clientMessageId
            ? { ...m, id: id ?? m.id, pending: false, clientMessageId: undefined }
            : m));
      }
      opts?.onSent?.();
    },
    onError: (_e, v) => {
      put((prev) => prev.map((m) =>
        m.clientMessageId === v.clientMessageId ? { ...m, pending: false, failed: true } : m));
      setFailed((f) => [...f, v]);
    },
  });

  return {
    send, failed,
    dismissFailed: (clientMessageId: string) => {
      setFailed((f) => f.filter((x) => x.clientMessageId !== clientMessageId));
      put((prev) => prev.filter((m) => m.clientMessageId !== clientMessageId));
    },
  };
}

/** Reactions, pins, delete and edit — each touching only what it changed. */
export function useMessageActions(channelId: string | null) {
  const qc = useQueryClient();
  const auth = useAuth();
  const key = richMessagesKey(channelId);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ["messages", "pins", channelId ?? ""] });
  };
  return {
    react: useMutation({
      mutationFn: (v: { messageId: number; emoji: string; mine: boolean }) =>
        toggleReaction(v.messageId, v.emoji, v.mine),
      /* Optimistic: a reaction that takes a round trip to appear feels
         broken, and it is the cheapest thing in the product to undo. */
      onMutate: (v) => {
        qc.setQueryData<RichMessage[]>(key, (prev) => (prev ?? []).map((m) => {
          if (m.id !== v.messageId) return m;
          const existing = m.reactions.find((r) => r.emoji === v.emoji);
          if (!existing) return { ...m, reactions: [...m.reactions, { emoji: v.emoji, count: 1, mine: true }] };
          const count = existing.count + (v.mine ? -1 : 1);
          return {
            ...m,
            reactions: count <= 0
              ? m.reactions.filter((r) => r.emoji !== v.emoji)
              : m.reactions.map((r) => (r.emoji === v.emoji ? { ...r, count, mine: !v.mine } : r)),
          };
        }));
      },
      onSettled: refresh,
    }),
    pin: useMutation({
      mutationFn: (v: { messageId: number; pinned: boolean }) =>
        v.pinned ? unpinMessage(v.messageId) : pinMessage(channelId!, v.messageId),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: (id: number) => deleteOwnMessage(id), onSuccess: refresh }),
    edit: useMutation({
      mutationFn: (v: { messageId: number; bodyText: string }) =>
        editOwnMessage(v.messageId, v.bodyText),
      onSuccess: refresh,
    }),
    attach: useMutation({
      mutationFn: (v: { messageId: number; organizationId: string | null; file: File }) =>
        attachToMessage({ ...v, channelId: channelId!, uploadedBy: auth.user?.id ?? "" }),
      onSuccess: refresh,
    }),
  };
}

/** Only fetched when the Files tab is actually opened (rule 14). */
export function useChannelFiles(channelId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["messages", "files", channelId ?? ""],
    queryFn: () => fetchChannelFiles(channelId!),
    enabled: !!channelId && enabled,
    staleTime: 30_000,
  });
}
