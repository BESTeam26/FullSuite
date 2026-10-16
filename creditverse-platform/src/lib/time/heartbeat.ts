/**
 * When the app tells the database "this person is still here" (D-029).
 *
 * The idle sweep stops a work timer whose last heartbeat is older than the
 * agency's idle window, at that heartbeat. So the heartbeat must mean
 * ACTIVITY, not "the tab exists": it is sent only when the person did
 * something in FullSuite since the last beat — a click, a key, a scroll, a
 * touch, the tab coming back to the front. A sleeping screen, a locked
 * laptop or a background tab sends nothing, and the timer stops at the last
 * real moment of work.
 *
 * Pure: the hook feeds it timestamps; the tests feed it the same.
 */
export const HEARTBEAT_EVERY_MS = 60_000;
/** With no timer running, ask again only now and then: a clock-in is rare. */
export const IDLE_POLL_EVERY_MS = 5 * 60_000;

export interface HeartbeatState {
  lastActivityAt: number;
  lastBeatAt: number;
  /** What the last beat answered: is a work timer open. Unknown at first. */
  timerOpen: boolean | null;
}

export const initialHeartbeatState = (now: number): HeartbeatState => ({ lastActivityAt: now, lastBeatAt: 0, timerOpen: null });

/** Should a beat go out now? Only with activity since the last one, and not more often than the interval. */
export function shouldBeat(s: HeartbeatState, now: number, visible: boolean): boolean {
  if (!visible) return false;
  const interval = s.timerOpen === false ? IDLE_POLL_EVERY_MS : HEARTBEAT_EVERY_MS;
  if (now - s.lastBeatAt < interval) return false;
  return s.lastActivityAt > s.lastBeatAt;
}
