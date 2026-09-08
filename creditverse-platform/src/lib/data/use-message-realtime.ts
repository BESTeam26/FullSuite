/**
 * Other people's messages, arriving without a refresh.
 *
 * ── THE THREE THINGS THAT GO WRONG ─────────────────────────────────────────
 *
 * Dee, §55: "optimistic send does not duplicate when Realtime event arrives /
 * correct ordering / reconnect", and §43: no full refetch after each message.
 *
 *   DUPLICATES. Your own message is already in the list optimistically, and
 *   then arrives again over the wire. Matched on `client_message_id` — the
 *   same idempotency key the send used — and on the real id once reconciled,
 *   so it is recognised as the row already there rather than appended twice.
 *
 *   ORDER. Appending on arrival is wrong the moment two messages cross. The
 *   list is sorted by `created_at`, which is the server's clock for everybody.
 *
 *   RECONNECT. The socket drops; messages are missed. On resubscribe the
 *   conversation is refetched ONCE — not on every message, which is the thing
 *   §43 forbids, but exactly once when there is a real gap to close.
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase/client";
import { fetchMessageById, type RichMessage } from "@/lib/data/messages";
import { richMessagesKey, threadKey } from "@/lib/data/use-messages";
import { channelsKey } from "@/lib/data/use-channels";

/**
 * Merge one arriving message into a list. Pure, and exported, because the two
 * properties Dee named in §55 — "optimistic send does not duplicate when the
 * Realtime event arrives" and "correct ordering" — are rules about data, not
 * about a subscription. Buried in the effect closure they could only be
 * checked by driving a socket.
 */
export function mergeIncoming(list: RichMessage[], incoming: RichMessage): RichMessage[] {
  const at = list.findIndex(
    (m) =>
      m.id === incoming.id ||
      (!!incoming.clientMessageId && m.clientMessageId === incoming.clientMessageId),
  );
  /* Already here — our own optimistic row, or a second delivery. Replaced in
     place rather than appended as a twin. */
  if (at >= 0) {
    const next = [...list];
    next[at] = { ...incoming, pending: false, clientMessageId: undefined };
    return next;
  }
  /* The server's clock decides the order, not the arrival order. */
  return [...list, incoming].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function useMessageRealtime(channelId: string | null): void {
  const qc = useQueryClient();
  /* Survives re-renders without re-subscribing. A subscription that churns on
     every render is a subscription that misses messages. */
  const seen = useRef<Set<number>>(new Set());
  /* Whether this mount has ALREADY been subscribed once. The gap-closing
     refetch used to fire on `seen.size > 0` — "we have received something, so
     a reconnect may have lost something". That misses the worst case: the
     socket drops before any message arrives, `seen` is still empty, and the
     resubscribe closes no gap at all. Having subscribed before is the thing
     that means this is a RE-subscribe. */
  const subscribedBefore = useRef(false);

  useEffect(() => {
    if (!channelId) return;
    let cancelled = false;
    const sb = requireSupabase();
    seen.current = new Set();
    subscribedBefore.current = false;

    const upsert = (incoming: RichMessage) => {
      const key = incoming.parentMessageId
        ? threadKey(incoming.parentMessageId)
        : richMessagesKey(channelId);
      qc.setQueryData<RichMessage[]>(key, (prev) => mergeIncoming(prev ?? [], incoming));
      /* The conversation list carries unread and last-message time, so it is
         stale — but the MESSAGES are not refetched (§43). */
      void qc.invalidateQueries({ queryKey: channelsKey });
    };

    const channel = sb
      .channel(`messages:${channelId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` },
        (payload) => {
          const id = Number((payload.new as { id: number }).id);
          if (cancelled || seen.current.has(id)) return;
          seen.current.add(id);
          /* One small read for the shape the list speaks. Delivery was already
             RLS-filtered; this read is filtered again by `messages_select`,
             so a row we should not see returns nothing rather than rendering. */
          void fetchMessageById(id).then((m) => { if (m && !cancelled) upsert(m); });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` },
        (payload) => {
          const id = Number((payload.new as { id: number }).id);
          if (cancelled) return;
          /* An edit or a tombstone. Re-read rather than trusting the payload:
             the rich shape withholds a deleted body on the SERVER, and that
             is where the withholding belongs. */
          void fetchMessageById(id).then((m) => { if (m && !cancelled) upsert(m); });
        },
      )
      .subscribe((status) => {
        if (status !== "SUBSCRIBED" || cancelled) return;
        /* The first subscribe closes no gap: the list was just fetched. Every
           later one does, exactly once — not per message (§43). */
        if (subscribedBefore.current) {
          void qc.invalidateQueries({ queryKey: richMessagesKey(channelId) });
        }
        subscribedBefore.current = true;
      });

    return () => {
      cancelled = true;
      void sb.removeChannel(channel);
    };
  }, [channelId, qc]);
}
