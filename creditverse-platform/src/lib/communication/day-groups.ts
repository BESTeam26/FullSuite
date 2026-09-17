/**
 * Grouping a conversation by day.
 *
 * Dee's reference puts a "Today" divider above the day's messages. Without one
 * a conversation is an undifferentiated column and "9:14 AM" could be this
 * morning or three weeks ago.
 *
 * Kept out of the component and tested, because the interesting part is not
 * the divider — it is deciding which day a timestamp belongs to, which is a
 * timezone question and the one that goes quietly wrong.
 */

/** The local calendar day, as `YYYY-MM-DD`. */
export const dayKeyOf = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  /* Local, not UTC. A message sent at 8pm Manila is from that day for the
     person reading it in Manila — `toISOString().slice(0,10)` would call it
     the next day, and label yesterday's standup "Today". */
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** "Today", "Yesterday", or the date written out. */
export function dayLabel(key: string, today = new Date()): string {
  if (!key) return "";
  const todayKey = dayKeyOf(today.toISOString());
  if (key === todayKey) return "Today";

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === dayKeyOf(yesterday.toISOString())) return "Yesterday";

  const [y, m, d] = key.split("-").map(Number);
  /* Constructed from the parts rather than parsed from the string: `new
     Date("2026-09-17")` is UTC midnight and renders as the 16th west of
     Greenwich. */
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
    ...(y === today.getFullYear() ? {} : { year: "numeric" }),
  });
}

/**
 * Which rows start a new day.
 *
 * Returns the set of indices that need a divider drawn above them, so the
 * caller keeps one flat list and does not have to nest its rows.
 */
export function dayBoundaries(createdAts: readonly string[]): Map<number, string> {
  const out = new Map<number, string>();
  let previous = "";
  createdAts.forEach((at, i) => {
    const key = dayKeyOf(at);
    if (key && key !== previous) {
      out.set(i, key);
      previous = key;
    }
  });
  return out;
}
