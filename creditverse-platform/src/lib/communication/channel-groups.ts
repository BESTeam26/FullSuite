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

/**
 * One owner's channels inside a group.
 *
 * Dee, 2026-09-15: *"I want to have the channels grouped per Partner if
 * there's multiple partners."* With several partners a flat list makes the
 * reader match each row against a subtitle to work out whose it is; with one
 * partner a heading naming them above three rows that already say so is just
 * the name twice. So sections appear only when there is something to separate.
 */
export interface ChannelSection {
  /** The owning partner or organization id — stable, unlike the name. */
  key: string;
  label: string;
  channels: Channel[];
}

export interface ChannelGroup {
  key: ChannelGroupKey;
  label: string;
  channels: Channel[];
  /**
   * Present only when the group has MORE THAN ONE owner. When it is set, the
   * interface renders these instead of `channels`; `channels` stays populated
   * either way so counts and anything else reading the group are unaffected.
   */
  sections?: ChannelSection[];
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
    .map((key) => {
      const channels = sortChannels(buckets.get(key) ?? []);
      const sections = key === "partners" ? sectionsBy(channels, "partner")
        : key === "organizations" ? sectionsBy(channels, "organization")
        : undefined;
      return sections ? { key, label: LABELS[key], channels, sections }
                      : { key, label: LABELS[key], channels };
    })
    .filter((g) => g.channels.length > 0);
}

/**
 * Split a group by its owner, or don't.
 *
 * Returns `undefined` for nought or one owner — the caller then renders the
 * flat list it already had, so a single-partner agency sees no change at all.
 *
 * Owners are keyed by ID and only LABELLED by name: two partners could be
 * renamed to the same thing and would still be two sections, which is what
 * rule 4 asks for. Sections follow the order the channels are already in, so
 * the partner spoken to most recently leads — the same rule as the rows.
 */
function sectionsBy(
  channels: readonly Channel[],
  owner: "partner" | "organization",
): ChannelSection[] | undefined {
  const idOf = (c: Channel) => (owner === "partner" ? c.partnerGroupId : c.organizationId);
  const nameOf = (c: Channel) => (owner === "partner" ? c.partnerName : c.organizationName);

  const sections: ChannelSection[] = [];
  const byKey = new Map<string, ChannelSection>();
  for (const c of channels) {
    /* A channel whose owner did not come back — the caller may see the
       conversation without seeing the account — keeps its own bucket rather
       than being merged with every other unnamed one. */
    const key = idOf(c) ?? `unknown:${c.id}`;
    const existing = byKey.get(key);
    if (existing) { existing.channels.push(c); continue; }
    const section: ChannelSection = {
      key,
      label: nameOf(c) ?? (owner === "partner" ? "Partner" : "Organization"),
      channels: [c],
    };
    byKey.set(key, section);
    sections.push(section);
  }
  return sections.length > 1 ? sections : undefined;
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

/**
 * What a collapsed heading has to carry.
 *
 * Dee, 2026-09-16: *"Partner heading should be collapsible … use unread
 * badges, last activity."* Collapsing a section hides its rows, so whatever
 * those rows were telling you has to survive on the heading — otherwise
 * folding a partner away silently hides the fact that they are waiting for a
 * reply, and the control becomes a way to miss things.
 */
export interface SectionSummary {
  /** Unread across the section, audit and archived rows excluded as ever. */
  unread: number;
  /** The most recent activity in the section, or null if nobody has spoken. */
  lastMessageAt: string | null;
}

export function summariseSection(section: ChannelSection): SectionSummary {
  return {
    unread: totalUnread(section.channels),
    lastMessageAt: section.channels.reduce<string | null>(
      (latest, c) => (c.lastMessageAt && (!latest || c.lastMessageAt > latest) ? c.lastMessageAt : latest),
      null,
    ),
  };
}

/**
 * A conversation's icon, as a kind rather than a component — the rule is
 * testable here; the drawing belongs to the rail.
 *
 * Dee, 2026-09-16: *"Do not prefix DMs with `#`. DMs should visually look
 * different from channels."* Every row used to carry the same hash, so a
 * person and a topic were indistinguishable at a glance.
 */
export type ChannelGlyph = "audit" | "person" | "private" | "hash";

export function glyphFor(channel: Channel): ChannelGlyph {
  if (channel.auditOnly) return "audit";
  if (channel.kind === "direct") return "person";
  /* Members-only. `openToScope` is the deliberate all-hands flag, so its
     absence is what "not everyone can walk in" actually means here. */
  if (!channel.openToScope) return "private";
  return "hash";
}
