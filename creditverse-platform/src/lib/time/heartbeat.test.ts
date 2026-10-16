import { describe, expect, it } from "vitest";
import { HEARTBEAT_EVERY_MS, IDLE_POLL_EVERY_MS, initialHeartbeatState, shouldBeat } from "./heartbeat";

const t0 = 1_000_000;
describe("the activity heartbeat (D-029)", () => {
  it("beats at most once a minute, and only after activity", () => {
    let s = initialHeartbeatState(t0);
    expect(shouldBeat(s, t0 + 1, true)).toBe(true);            // first beat: activity at start
    s = { ...s, lastBeatAt: t0 + 1, timerOpen: true };
    expect(shouldBeat(s, t0 + 30_000, true)).toBe(false);      // too soon
    expect(shouldBeat(s, t0 + HEARTBEAT_EVERY_MS + 5, true)).toBe(false); // a minute passed, but nobody did anything
    s = { ...s, lastActivityAt: t0 + 45_000 };
    expect(shouldBeat(s, t0 + HEARTBEAT_EVERY_MS + 5, true)).toBe(true);  // activity since the last beat
  });
  it("sends nothing from a hidden tab — a sleeping screen is not work", () => {
    const s = { ...initialHeartbeatState(t0), lastActivityAt: t0 + 10, timerOpen: true };
    expect(shouldBeat(s, t0 + HEARTBEAT_EVERY_MS * 2, false)).toBe(false);
  });
  it("polls only every five minutes when no timer is running", () => {
    const s = { ...initialHeartbeatState(t0), lastBeatAt: t0, lastActivityAt: t0 + 10, timerOpen: false };
    expect(shouldBeat(s, t0 + HEARTBEAT_EVERY_MS * 2, true)).toBe(false);
    expect(shouldBeat(s, t0 + IDLE_POLL_EVERY_MS + 1, true)).toBe(true);
  });
});
