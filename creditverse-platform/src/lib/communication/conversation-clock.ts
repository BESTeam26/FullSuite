/**
 * Which clock a conversation is read on.
 *
 * Dee, 2026-09-17: *"the date and today or yesterday is overlapping, and I
 * wanna add the TIME in the chat record not just the date, so we know the time
 * stamp. For all internal BES, time should be EST. For partners, time will
 * follow their Time Zone on all partner GC and Partner Channels."*
 *
 * The zone belongs to the CONVERSATION, not the reader — `channel_timezone()`
 * decides it and `channel_details` carries it. A BES agent in Manila reading
 * #general sees Eastern, because that is the clock every BES cutoff and
 * standup is quoted in; the same agent reading a partner's channel sees the
 * partner's clock, because that is what the timestamp is there to tell them.
 *
 * ── WHY THE DAY KEY TAKES THE SAME ZONE ────────────────────────────────────
 *
 * It is the whole reason this file exists rather than two unrelated helpers.
 * A message sent 11:40 PM Eastern is Monday to everyone in the conversation —
 * but it is Tuesday lunchtime in Manila. Label the divider in the reader's
 * zone and stamp the message in the channel's and the conversation contradicts
 * itself: "Tuesday" above a message that says 11:40 PM Monday. One zone,
 * passed to both, or neither is trustworthy.
 */

/** BES's own clock, and the fallback while a conversation's zone is loading. */
export const BES_TIMEZONE = "America/New_York";

/* Intl.DateTimeFormat construction is not free and a long conversation asks
   for the same handful of formats hundreds of times, so they are kept. */
const formatters = new Map<string, Intl.DateTimeFormat>();
const formatter = (timeZone: string, options: Intl.DateTimeFormatOptions, locale = "en-US") => {
  const key = `${locale}|${timeZone}|${JSON.stringify(options)}`;
  let f = formatters.get(key);
  if (!f) {
    /* An unknown zone throws. The channel's zone is validated in the database,
       but a stale cached value must never blank out a conversation. */
    try { f = new Intl.DateTimeFormat(locale, { ...options, timeZone }); }
    catch { f = new Intl.DateTimeFormat(locale, { ...options, timeZone: BES_TIMEZONE }); }
    formatters.set(key, f);
  }
  return f;
};

const parse = (iso: string): Date | null => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** The calendar day a timestamp falls on IN THAT ZONE, as `YYYY-MM-DD`. */
export function dayKeyIn(iso: string, timeZone: string): string {
  const d = parse(iso);
  if (!d) return "";
  /* en-CA, not en-US: this one needs ISO ordering (2026-09-07), and en-US
     would hand back 09/07/2026 — which sorts wrong and parses wrong. */
  return formatter(timeZone, { year: "numeric", month: "2-digit", day: "2-digit" }, "en-CA").format(d);
}

/** "9:14 AM EDT" — the time, and whose time it is. */
export function timeIn(iso: string, timeZone: string): string {
  const d = parse(iso);
  if (!d) return "";
  return formatter(timeZone, { hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(d);
}

/**
 * What sits beside a name on a message: "Sep 8, 2026, 9:14 AM EDT".
 *
 * The zone is named on every row rather than once at the top, because rows are
 * what get screenshotted, quoted into a dispute and pasted into an email. A
 * bare "9:14 AM" in a partner channel is a number somebody will read as their
 * own morning.
 */
export function stampIn(iso: string, timeZone: string): string {
  const d = parse(iso);
  if (!d) return "";
  return formatter(timeZone, {
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(d);
}

/** "Today", "Yesterday", or the day written out — all in the channel's zone. */
export function dayLabelIn(key: string, timeZone: string, now: Date = new Date()): string {
  if (!key) return "";
  const nowIso = now.toISOString();
  if (key === dayKeyIn(nowIso, timeZone)) return "Today";

  const yesterday = new Date(now.getTime() - 86_400_000);
  if (key === dayKeyIn(yesterday.toISOString(), timeZone)) return "Yesterday";

  const [y, m, d] = key.split("-").map(Number);
  /* Noon UTC, then formatted back in the channel's zone: constructing local
     midnight and re-projecting can land on the previous day for zones far
     enough east or west, which would label the divider off by one. */
  const at = new Date(Date.UTC(y, m - 1, d, 12));
  const thisYear = dayKeyIn(nowIso, timeZone).slice(0, 4) === key.slice(0, 4);
  return formatter(timeZone, {
    weekday: "long", month: "long", day: "numeric",
    ...(thisYear ? {} : { year: "numeric" }),
  }).format(at);
}

/** One day's messages, in order, with the divider label already resolved. */
export interface DayGroup<T> { key: string; label: string; messages: T[] }

/**
 * Split a conversation into day groups.
 *
 * Returned as groups rather than as "which indices need a divider above them",
 * which is what this replaced. The flat version rendered every divider as a
 * sibling in one scroll container, so `sticky top-0` pinned ALL of them to the
 * same pixel and yesterday's pill sat on top of today's — the overlap Dee
 * photographed. A sticky header only steps aside for the next one when each
 * lives in its own section, so the grouping has to be real.
 */
export function groupByDay<T>(
  messages: readonly T[],
  createdAtOf: (message: T) => string,
  timeZone: string,
  now: Date = new Date(),
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const message of messages) {
    const key = dayKeyIn(createdAtOf(message), timeZone);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.messages.push(message);
    else groups.push({ key, label: dayLabelIn(key, timeZone, now), messages: [message] });
  }
  return groups;
}
