/**
 * How a work schedule reads on screen — one place, so the Members tab, the
 * Schedule tab and the People profile cannot describe the same shift three
 * different ways.
 */
import type { WorkSchedule } from "@/lib/data/people-management";

/** ISO weekday 1..7, Monday first — the order every schedule grid draws. */
export const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export const DAY_LETTER = ["M", "T", "W", "T", "F", "S", "S"];
export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "09:00:00" → "09:00", the shape a `<input type="time">` holds. */
export const hhmm = (t: string) => t.slice(0, 5);

/** "18:30:00" → "6:30 PM". */
export const prettyTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

/** "9:00 AM – 6:00 PM", or the honest absence of one. */
export const shiftLabel = (s: WorkSchedule | undefined) =>
  s ? `${prettyTime(s.shiftStart)} – ${prettyTime(s.shiftEnd)}` : "No schedule";

/** "America/New_York" → "EDT" today; the zone name itself when Intl cannot say. */
export const zoneAbbreviation = (timeZone: string, at: Date = new Date()): string => {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
      .formatToParts(at).find((p) => p.type === "timeZoneName");
    return part?.value ?? timeZone;
  } catch {
    return timeZone;
  }
};

/** The one-line summary the People profile shows: days, shift, allowances. */
export const describeSchedule = (s: WorkSchedule | undefined) =>
  s
    ? `${s.workDays.map((d) => DAY_LETTER[d - 1]).join("")} · ${hhmm(s.shiftStart)}–${hhmm(s.shiftEnd)} ${s.timezone}` +
      ` · lunch ${s.lunchMinutes}m · breaks ${s.breakMinutes}m · grace ${s.graceMinutes}m`
    : "No schedule — attendance says nothing about them";
