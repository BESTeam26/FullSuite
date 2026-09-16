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
