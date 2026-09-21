/**
 * The Inbox — a projection, not a second list.
 *
 * Dee, 2026-09-16: *"Add a Communication Inbox view. Think Intercom: Unread,
 * Assigned to Me, Mentions, Partner Messages, DMs, Needs Reply. This is a
 * projection of existing conversations/messages."*
 *
 * So it is computed from the channel list the rail already holds. Nothing here
 * fetches; a second request for "what am I in" would be a second answer to the
 * question the rail has already asked, and two answers is how they begin to
 * disagree.
 *
 * ── WHAT IS NOT HERE, AND WHY ──────────────────────────────────────────────
 *
 * "Assigned to me" and "Needs reply" are missing on purpose. A channel is not
 * assigned to anybody — assignment belongs to work items, not conversations —
 * and "needs reply" would require knowing whether the last message was mine,
 * which `visible_channels()` does not return. Both could be built; neither can
 * be DERIVED from what exists, and a bucket that quietly guesses is worse than
 * a bucket that is absent (§"AUTOMATIC DOES NOT MEAN FAKE DATA").
 *
 * Mentions has a feed of its own and is counted separately, not here.
 */
import type { Channel } from "@/lib/data/channels";

export type InboxBucketKey = "unread" | "direct" | "partners" | "internal";

export interface InboxBucket {
  key: InboxBucketKey;
  label: string;
  /** What the badge shows: conversations waiting, not messages. */
  waiting: number;
  channels: Channel[];
}

const LABELS: Record<InboxBucketKey, string> = {
  unread: "Unread",
  direct: "Direct messages",
  partners: "Partner messages",
  internal: "BES internal",
};

/** An audit row is never waiting on you, and an archived one never will be. */
const answerable = (c: Channel) => !c.auditOnly && !c.archivedAt;

export function inboxBuckets(channels: readonly Channel[]): InboxBucket[] {
  const live = channels.filter(answerable);
  const unread = live.filter((c) => c.unread > 0);

  const of = (key: InboxBucketKey, rows: Channel[]): InboxBucket => ({
    key,
    label: LABELS[key],
    /* Conversations with something waiting — not the sum of their messages.
       "3" next to Partner messages means three partners are waiting, which is
       the number somebody acts on. */
    waiting: rows.filter((c) => c.unread > 0).length,
    channels: rows,
  });

  return [
    of("unread", unread),
    of("direct", live.filter((c) => c.kind === "direct")),
    of("partners", live.filter((c) => c.partnerGroupId !== null)),
    of("internal", live.filter((c) => c.kind !== "direct" && !c.partnerGroupId && !c.organizationId)),
  ];
}

/* ------------------------------------------------------------------ */
/* The inbox list — chips, filter, sort, search (D-023, Dee's mockup)   */
/* ------------------------------------------------------------------ */

export type InboxChip = "unread" | "all" | "recent" | "starred";
export type InboxKind = "all" | "channels" | "partners" | "direct";
export type InboxSort = "newest" | "unread" | "name";

export interface InboxQuery {
  chip: InboxChip;
  kind: InboxKind;
  sort: InboxSort;
  search: string;
}

export const DEFAULT_INBOX_QUERY: InboxQuery = { chip: "unread", kind: "all", sort: "newest", search: "" };

export const INBOX_CHIPS: { key: InboxChip; label: string }[] = [
  { key: "unread", label: "Unread" },
  { key: "all", label: "All" },
  { key: "recent", label: "Recent" },
  { key: "starred", label: "Starred" },
];

/** "Recent" = something was said in the last seven days. A week is the mockup's meaning of recent, not a setting. */
const RECENT_DAYS = 7;

const isRecent = (c: Channel, now: number) =>
  !!c.lastMessageAt && now - Date.parse(c.lastMessageAt) <= RECENT_DAYS * 86_400_000;

const matchesChip = (c: Channel, chip: InboxChip, now: number) =>
  chip === "all" ? true
  : chip === "unread" ? c.unread > 0
  : chip === "recent" ? isRecent(c, now)
  : c.favourite;

/** Partner conversations are partners wherever they live; "channels" is everything else that is not a DM. */
const matchesKind = (c: Channel, kind: InboxKind) =>
  kind === "all" ? true
  : kind === "direct" ? c.kind === "direct"
  : kind === "partners" ? c.partnerGroupId !== null
  : c.kind !== "direct" && c.partnerGroupId === null;

const haystack = (c: Channel) =>
  [c.displayName, c.name, c.partnerName, c.organizationName, c.lastMessageText, c.lastMessageAuthor]
    .filter(Boolean).join(" ").toLowerCase();

const newest = (a: Channel, b: Channel) =>
  (b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0) - (a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0);

/**
 * The conversations the Inbox lists for one query. Audit-only and archived
 * rows are out before any chip applies — the same rule the buckets use — so
 * "All" means all conversations you are IN, never everything you may inspect.
 */
export function filterInbox(channels: readonly Channel[], q: InboxQuery, now = Date.now()): Channel[] {
  const needle = q.search.trim().toLowerCase();
  const kept = channels.filter((c) =>
    answerable(c) && matchesChip(c, q.chip, now) && matchesKind(c, q.kind) && (!needle || haystack(c).includes(needle)));
  const by: Record<InboxSort, (a: Channel, b: Channel) => number> = {
    newest,
    unread: (a, b) => b.unread - a.unread || newest(a, b),
    name: (a, b) => a.displayName.localeCompare(b.displayName),
  };
  return [...kept].sort(by[q.sort]);
}

/** The number on each chip, under the current kind filter and search but before the chip itself. */
export function chipCounts(channels: readonly Channel[], q: Omit<InboxQuery, "chip" | "sort">, now = Date.now()): Record<InboxChip, number> {
  const base = { ...q, sort: "newest" as const };
  return Object.fromEntries(INBOX_CHIPS.map((c) => [c.key, filterInbox(channels, { ...base, chip: c.key }, now).length])) as Record<InboxChip, number>;
}
