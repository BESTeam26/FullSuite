/**
 * How the one conversation list is grouped for the left rail.
 *
 * Domain logic rather than JSX, because "which group does this belong to" is a
 * rule with edges — an archived partner conversation is Archived, not
 * Partners; an administrator's audit row is Administration even though it is
 * a BES channel; a DM is Direct Messages whoever owns it — and rules with
 * edges belong somewhere they can be tested (rule 5).
 *
 * The order is Dee's, §3/§20:
 *
 *   My Conversations · BES Internal · Partners · Organizations ·
 *   Direct Messages · Administration · Archived
 *
 * "My Conversations" is the unread shortcut rather than a seventh category —
 * the same rows appear below in their own group. Anything with something
 * waiting surfaces at the top, which is the whole reason to open the screen.
 * A group with nothing in it is not rendered at all (§18: "empty categories
 * with nothing inside").
 */
import type { Channel } from "@/lib/data/channels";

export type ChannelGroupKey =
  | "unread" | "internal" | "partners" | "organizations"
  | "direct" | "administration" | "archived";

export interface ChannelGroup {
  key: ChannelGroupKey;
  label: string;
  channels: Channel[];
}

const LABELS: Record<ChannelGroupKey, string> = {
  unread: "Unread",
  internal: "BES internal",
  partners: "Partners",
  organizations: "Organizations",
  direct: "Direct messages",
  administration: "Administration",
  archived: "Archived",
};

/**
 * Exactly one home per conversation, plus the Unread shortcut.
 *
 * Order matters: archived wins over everything, because an archived partner
 * conversation in the Partners group is a live conversation as far as anybody
 * scanning the list is concerned. Administration comes next, because a row an
 * administrator is not part of must never sit among the ones they are.
 */
function homeOf(c: Channel): ChannelGroupKey {
  if (c.archivedAt) return "archived";
  if (c.auditOnly) return "administration";
  if (c.kind === "direct") return "direct";
  if (c.partnerGroupId) return "partners";
  if (c.organizationId) return "organizations";
  return "internal";
}

export function groupChannels(channels: readonly Channel[]): ChannelGroup[] {
  const buckets = new Map<ChannelGroupKey, Channel[]>();
  const push = (key: ChannelGroupKey, c: Channel) => {
    const list = buckets.get(key);
    if (list) list.push(c); else buckets.set(key, [c]);
  };

  for (const c of channels) {
    /* An audit row is never unread. You do not owe a reply to a conversation
       you are not in (§17). */
    if (c.unread > 0 && !c.auditOnly && !c.archivedAt) push("unread", c);
    push(homeOf(c), c);
  }

  const order: ChannelGroupKey[] = [
    "unread", "internal", "partners", "organizations",
    "direct", "administration", "archived",
  ];
  return order
    .map((key) => ({ key, label: LABELS[key], channels: sortChannels(buckets.get(key) ?? []) }))
    .filter((g) => g.channels.length > 0);
}

/**
 * Most recently spoken in first, and a conversation nobody has spoken in yet
 * last rather than first — an empty channel is not news.
 */
export function sortChannels(channels: Channel[]): Channel[] {
  return [...channels].sort((a, b) => {
    if (!!a.lastMessageAt !== !!b.lastMessageAt) return a.lastMessageAt ? -1 : 1;
    if (a.lastMessageAt && b.lastMessageAt && a.lastMessageAt !== b.lastMessageAt) {
      return a.lastMessageAt < b.lastMessageAt ? 1 : -1;
    }
    return a.displayName.localeCompare(b.displayName);
  });
}

/** For the sidebar badge: everything waiting, across every group, counted once. */
export function totalUnread(channels: readonly Channel[]): number {
  return channels.reduce(
    (sum, c) => sum + (c.auditOnly || c.archivedAt ? 0 : c.unread),
    0,
  );
}
