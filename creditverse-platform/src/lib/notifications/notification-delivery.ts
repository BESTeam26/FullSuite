/**
 * How a notification reaches a person who has the app open (Dee, 2026-10-01:
 * "like Slack and Teams" — a toast in the app, a desktop notification when
 * the tab is not in front, the unread count in the tab title, a chime).
 *
 * Pure rules, so the hook that wires them to the browser stays small and
 * these are tested. Nothing here decides WHO is notified: that is the
 * `notifications` row, written by the database under the recipient's own
 * Row Level Security.
 */
import type { Notification } from "@/lib/data/notifications";

export type NativePermission = "default" | "granted" | "denied" | "unsupported";

type HasNotification = { Notification?: { permission: NativePermission } };

export function nativePermission(w: HasNotification | undefined = typeof window === "undefined" ? undefined : (window as unknown as HasNotification)): NativePermission {
  if (!w || typeof w.Notification === "undefined") return "unsupported";
  return w.Notification.permission;
}

/**
 * A desktop notification is for the person who is NOT looking: the tab is
 * hidden or another window has focus. In front, the toast is enough — two
 * alerts for one event is Slack's most-muted behaviour.
 */
export function shouldNotifyNatively(permission: NativePermission, pageHidden: boolean, pageFocused: boolean): boolean {
  return permission === "granted" && (pageHidden || !pageFocused);
}

/** "(3) FullSuite" while something is unread; the plain title otherwise. */
export function badgedTitle(baseTitle: string, unread: number): string {
  const base = baseTitle.replace(/^\(\d+\+?\)\s*/, "");
  if (unread <= 0) return base;
  return `(${unread > 99 ? "99+" : unread}) ${base}`;
}

/** What the toast and the desktop notification say. */
export function describeForAlert(n: Pick<Notification, "title" | "detail" | "kind">): { title: string; body: string | null; urgent: boolean } {
  return {
    title: n.title,
    body: n.detail ?? null,
    /* A reminder about the clock or the EOD, a mention or a DM: the ones that
       want a sound and a longer toast. A status change can wait. */
    urgent: n.kind === "reminder" || n.kind === "mention" || n.kind === "dm" || n.kind === "attention",
  };
}

export const SOUND_PREF_KEY = "fullsuite:notification-sound";

export function soundEnabled(storage: Pick<Storage, "getItem"> | null = typeof localStorage === "undefined" ? null : localStorage): boolean {
  try { return (storage?.getItem(SOUND_PREF_KEY) ?? "on") !== "off"; } catch { return true; }
}

/**
 * A short two-note chime, synthesised so there is no audio asset to load.
 * Browsers allow sound only after the person has interacted with the page;
 * before that the call fails quietly, which is the right outcome.
 */
export function playChime(): void {
  try {
    const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const at = ctx.currentTime;
    for (const [freq, start] of [[880, 0], [1174.66, 0.12]] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine"; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at + start);
      gain.gain.exponentialRampToValueAtTime(0.08, at + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + start + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at + start); osc.stop(at + start + 0.3);
    }
    setTimeout(() => { void ctx.close(); }, 800);
  } catch { /* no audio: nothing else changes */ }
}
