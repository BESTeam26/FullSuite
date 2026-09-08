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
  attachToMessage, deleteOwnMessage, editOwnMessage, fetchChannelMessages, fetchPins,
  fetchThread, pinMessage, sendMessage, toggleReaction, unpinMessage,
  type RichMessage,
} from "@/lib/data/messages";
import { useAuth } from "@/lib/auth/auth-context";

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

export function usePins(channelId: string | null) {
  return useQuery({
    queryKey: ["messages", "pins", channelId ?? ""],
    queryFn: () => fetchPins(channelId!),
    enabled: !!channelId,
    staleTime: 30_000,
  });
}

const optimistic = (input: {
  clientMessageId: string; channelId: string; authorId: string;
  authorName: string; bodyText: string; parentMessageId: number | null; replyToId: number | null;
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
  replyCount: 0, lastReplyAt: null, pinned: false,
  reactions: [], attachments: [],
  pending: true,
  clientMessageId: input.clientMessageId,
});

export interface PendingSend {
  clientMessageId: string;
  bodyText: string;
  parentMessageId: number | null;
  replyToId: number | null;
}

/**
 * Sending, with an Undo window.
 *
 * §33: "Do not delay actual send for 10 seconds just to support Undo. Send
 * immediately. Undo reverses it." So the message goes now, and `undoable`
 * simply remembers which one may still be pulled back.
 */
export function useSendMessage(channelId: string | null, opts?: { onSent?: () => void }) {
  const qc = useQueryClient();
  const auth = useAuth();
  const [failed, setFailed] = useState<PendingSend[]>([]);
  const [undoable, setUndoable] = useState<{ id: number; at: number } | null>(null);
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
        }),
      ]);
    },
    onSuccess: ({ v, id }) => {
      if (v.parentMessageId) {
        void qc.invalidateQueries({ queryKey: threadKey(v.parentMessageId) });
      } else {
        /* Reconcile the ONE row rather than refetching the conversation. */
        put((prev) => prev.map((m) =>
          m.clientMessageId === v.clientMessageId
            ? { ...m, id: id ?? m.id, pending: false, clientMessageId: undefined }
            : m));
        if (id) setUndoable({ id, at: Date.now() });
      }
      opts?.onSent?.();
    },
    onError: (_e, v) => {
      put((prev) => prev.map((m) =>
        m.clientMessageId === v.clientMessageId ? { ...m, pending: false, failed: true } : m));
      setFailed((f) => [...f, v]);
    },
  });

  const undo = useMutation({
    mutationFn: (id: number) => deleteOwnMessage(id),
    onSuccess: (_d, id) => {
      put((prev) => prev.map((m) => (m.id === id ? { ...m, deleted: true, bodyText: null } : m)));
      setUndoable(null);
    },
  });

  /* The window is presentational: the row is already in the database, so an
     expired Undo is simply a button that is no longer offered. */
  const undoWindowMs = 12_000;
  const canUndo = useMemo(
    () => (undoable && Date.now() - undoable.at < undoWindowMs ? undoable.id : null),
    [undoable],
  );

  return {
    send, undo, failed, canUndo, undoWindowMs,
    dismissFailed: (clientMessageId: string) => {
      setFailed((f) => f.filter((x) => x.clientMessageId !== clientMessageId));
      put((prev) => prev.filter((m) => m.clientMessageId !== clientMessageId));
    },
    clearUndo: () => setUndoable(null),
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
