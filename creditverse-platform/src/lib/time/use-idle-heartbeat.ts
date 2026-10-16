/**
 * Mounted once in the agency shell: while a BES staff member is signed in,
 * their activity in FullSuite reaches `time_heartbeat()` about once a minute
 * (see heartbeat.ts for the rule). One request a minute per clocked-in
 * person; one every five minutes for somebody not clocked in.
 */
import { useEffect, useRef } from "react";
import { requireSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { HEARTBEAT_EVERY_MS, initialHeartbeatState, shouldBeat, type HeartbeatState } from "./heartbeat";

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"];

export function useIdleHeartbeat(): void {
  const auth = useAuth();
  const live = auth.mode === "live" && auth.status === "signed-in" && !!auth.agencyId;
  const state = useRef<HeartbeatState>(initialHeartbeatState(Date.now()));

  useEffect(() => {
    if (!live) return;
    const touch = () => { state.current.lastActivityAt = Date.now(); };
    const onVisible = () => { if (document.visibilityState === "visible") { touch(); void tick(); } };
    const tick = async () => {
      const now = Date.now();
      if (!shouldBeat(state.current, now, document.visibilityState === "visible")) return;
      state.current.lastBeatAt = now;
      try {
        const { data } = await requireSupabase().rpc("time_heartbeat");
        state.current.timerOpen = data === true;
      } catch {
        /* A missed beat is a missed minute, nothing more; the next activity sends another. */
      }
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    document.addEventListener("visibilitychange", onVisible);
    const id = window.setInterval(() => void tick(), HEARTBEAT_EVERY_MS / 4);
    void tick();
    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, touch));
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(id);
    };
  }, [live]);
}
