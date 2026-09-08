/**
 * Who is typing, right now.
 *
 * ── WHY PRESENCE AND NOT A TABLE ───────────────────────────────────────────
 *
 * "X is typing" is true for about two seconds and then it is not. A row per
 * keystroke would be a write per keystroke (rule 14), an append-only audit
 * record of nothing (rule 10), and a thing to clean up when a browser closes
 * mid-sentence. Supabase Realtime PRESENCE is the right shape: it lives on the
 * socket, it expires when the socket does, and it never reaches Postgres.
 *
 * ── WHAT STOPS IT LEAKING ──────────────────────────────────────────────────
 *
 * The presence channel is named for the conversation, and joining it is the
 * same subscription 0217 already opens for messages — which Realtime filters
 * by the reader's own row-level security. Somebody who cannot see the
 * conversation cannot join its channel, so they neither publish nor read
 * typing. The payload carries only a display name the other participants can
 * already see in the message list.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ───────────────────────────────────────
 *
 * It does not announce that somebody merely OPENED the conversation. Reading
 * is not an event (0218 §36: audit administration, never reads), and "seen
 * your message" is a different feature with different consent.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requireSupabase } from "@/lib/supabase/client";

export interface TypingPerson {
  userId: string;
  name: string;
}

/** Typing stops being true this long after the last keystroke. */
const IDLE_MS = 4_000;
/** Re-announcing on every keystroke is pointless; once per this window is enough. */
const REANNOUNCE_MS = 2_000;

export interface TypingPresence {
  /** Everybody except you who is typing here now. */
  typing: TypingPerson[];
  /** Call on each keystroke. Cheap: it announces at most once every 2s. */
  onInput: () => void;
  /** Call when the message is sent, or the composer is abandoned. */
  stop: () => void;
}

export function useTypingPresence(
  channelId: string | null,
  me: TypingPerson | null,
): TypingPresence {
  const [typing, setTyping] = useState<TypingPerson[]>([]);
  /* The live channel, and the two timers. Refs, because a re-render must not
     re-subscribe — a subscription that churns announces and un-announces. */
  const chan = useRef<ReturnType<ReturnType<typeof requireSupabase>["channel"]> | null>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = useRef(0);
  const tracking = useRef(false);
  const meId = me?.userId ?? null;

  useEffect(() => {
    if (!channelId || !meId) {
      setTyping([]);
      return;
    }
    let cancelled = false;
    const sb = requireSupabase();
    const ch = sb.channel(`typing:${channelId}`, { config: { presence: { key: meId } } });

    const read = () => {
      if (cancelled) return;
      const state = ch.presenceState() as Record<string, { userId?: string; name?: string }[]>;
      const others: TypingPerson[] = [];
      for (const entries of Object.values(state)) {
        for (const e of entries) {
          if (!e?.userId || e.userId === meId) continue;
          if (others.some((o) => o.userId === e.userId)) continue;
          others.push({ userId: e.userId, name: e.name || "Someone" });
        }
      }
      setTyping(others);
    };

    ch.on("presence", { event: "sync" }, read)
      .on("presence", { event: "join" }, read)
      .on("presence", { event: "leave" }, read)
      .subscribe();
    chan.current = ch;

    return () => {
      cancelled = true;
      if (idle.current) clearTimeout(idle.current);
      idle.current = null;
      tracking.current = false;
      chan.current = null;
      /* Leaving the conversation must stop the dots for everybody else, even
         if the composer never called stop(). */
      void sb.removeChannel(ch);
    };
  }, [channelId, meId]);

  const stop = useCallback(() => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = null;
    lastSent.current = 0;
    if (tracking.current && chan.current) {
      tracking.current = false;
      void chan.current.untrack();
    }
  }, []);

  const onInput = useCallback(() => {
    const ch = chan.current;
    if (!ch || !me) return;
    const now = Date.now();
    if (!tracking.current || now - lastSent.current > REANNOUNCE_MS) {
      lastSent.current = now;
      tracking.current = true;
      void ch.track({ userId: me.userId, name: me.name });
    }
    if (idle.current) clearTimeout(idle.current);
    /* Stopping mid-sentence is the common case — somebody thinks, or walks
       away. The dots have to go without anybody pressing anything. */
    idle.current = setTimeout(stop, IDLE_MS);
  }, [me, stop]);

  return useMemo(() => ({ typing, onInput, stop }), [typing, onInput, stop]);
}
