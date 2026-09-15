/**
 * Grouping is a rule with edges, so it is tested rather than eyeballed.
 *
 * The two that matter most are both about NOT mixing things up:
 *
 *   an archived partner conversation is Archived, not Partners — otherwise a
 *   closed conversation sits in the live list looking answerable;
 *
 *   a row an administrator may only INSPECT is Administration, never among
 *   their own conversations and never counted as unread. Dee, §17: "Do not
 *   silently insert Admin into the conversation." A badge saying they owe a
 *   reply is exactly that.
 */
import { describe, expect, it } from "vitest";
import { groupChannels, sortChannels, totalUnread } from "./channel-groups";
import type { Channel } from "@/lib/data/channels";

const ch = (over: Partial<Channel>): Channel => ({
  id: "c1", organizationId: null, agencyId: "a1", partnerGroupId: null,
  partnerServiceId: null, partnerTopic: null, kind: "topic", name: "general", displayName: "general", directUserId: null,
  purpose: null, openToScope: false, archivedAt: null, sharedWithBes: false,
  auditOnly: false, isManager: false, unread: 0, lastMessageAt: null, ...over,
});

const keys = (channels: Channel[]) => groupChannels(channels).map((g) => g.key);

describe("one home per conversation", () => {
  it("puts a BES channel in BES internal", () => {
    expect(keys([ch({})])).toEqual(["internal"]);
  });

  it("puts a partner conversation in Partners", () => {
    expect(keys([ch({ agencyId: null, partnerGroupId: "g1" })])).toEqual(["partners"]);
  });

  it("puts an organization channel in Organizations", () => {
    expect(keys([ch({ agencyId: null, organizationId: "o1" })])).toEqual(["organizations"]);
  });

  it("puts a direct message in Direct messages, whoever owns it", () => {
    expect(keys([ch({ kind: "direct" })])).toEqual(["direct"]);
  });

  it("renders no empty group at all", () => {
    expect(keys([])).toEqual([]);
  });
});

describe("archived and administrative rows do not sit with live ones", () => {
  it("an archived PARTNER conversation is Archived, not Partners", () => {
    expect(keys([ch({ agencyId: null, partnerGroupId: "g1", archivedAt: "2026-09-01T00:00:00Z" })]))
      .toEqual(["archived"]);
  });

  it("an audit-only row is Administration, not BES internal", () => {
    expect(keys([ch({ auditOnly: true })])).toEqual(["administration"]);
  });

  it("an audit-only row is never unread, however many messages it holds", () => {
    const rows = [ch({ auditOnly: true, unread: 12 })];
    expect(keys(rows)).toEqual(["administration"]);
    expect(totalUnread(rows)).toBe(0);
  });

  it("an archived conversation is never unread either", () => {
    expect(totalUnread([ch({ unread: 4, archivedAt: "2026-09-01T00:00:00Z" })])).toBe(0);
  });
});

describe("Unread is a shortcut, not a seventh home", () => {
  it("lists a waiting conversation twice: at the top, and where it lives", () => {
    const rows = [ch({ id: "c1", unread: 3 })];
    const groups = groupChannels(rows);
    expect(groups.map((g) => g.key)).toEqual(["unread", "internal"]);
    expect(groups[0].channels[0].id).toBe("c1");
    expect(groups[1].channels[0].id).toBe("c1");
  });

  it("counts every waiting conversation once for the badge", () => {
    expect(totalUnread([
      ch({ id: "a", unread: 2 }),
      ch({ id: "b", unread: 3, partnerGroupId: "g1", agencyId: null }),
      ch({ id: "c", unread: 0 }),
    ])).toBe(5);
  });
});

describe("ordering", () => {
  it("puts the most recently spoken in first", () => {
    const out = sortChannels([
      ch({ id: "old", displayName: "old", lastMessageAt: "2026-09-01T00:00:00Z" }),
      ch({ id: "new", displayName: "new", lastMessageAt: "2026-09-07T00:00:00Z" }),
    ]);
    expect(out.map((c) => c.id)).toEqual(["new", "old"]);
  });

  it("puts a conversation nobody has spoken in LAST — an empty channel is not news", () => {
    const out = sortChannels([
      ch({ id: "empty", displayName: "empty" }),
      ch({ id: "spoken", displayName: "spoken", lastMessageAt: "2026-09-01T00:00:00Z" }),
    ]);
    expect(out.map((c) => c.id)).toEqual(["spoken", "empty"]);
  });

  it("falls back to the name so the order is stable", () => {
    const out = sortChannels([ch({ id: "b", displayName: "beta" }), ch({ id: "a", displayName: "alpha" })]);
    expect(out.map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("partner channels group under each partner", () => {
  /* Dee, 2026-09-15: "I want to have the channels grouped per Partner if
     there's multiple partners." */
  const partnerChannel = (partner: string, name: string, over: Partial<Channel> = {}) =>
    ch({ id: `${partner}-${name}`, agencyId: null, partnerGroupId: partner,
         partnerName: partner === "p1" ? "Acme Fulfilment" : "Prime Capital Group",
         kind: "topic", name, displayName: name, ...over });

  const partnersGroup = (channels: Channel[]) =>
    groupChannels(channels).find((g) => g.key === "partners");

  it("one partner stays a flat list — a heading would just repeat the row", () => {
    const g = partnersGroup([
      partnerChannel("p1", "General"), partnerChannel("p1", "Marketing"),
    ]);
    expect(g?.sections).toBeUndefined();
    expect(g?.channels).toHaveLength(2);
  });

  it("two partners split into a section each", () => {
    const g = partnersGroup([
      partnerChannel("p1", "General"), partnerChannel("p2", "General"),
      partnerChannel("p1", "Support"),
    ]);
    expect(g?.sections?.map((s) => s.label))
      .toEqual(["Acme Fulfilment", "Prime Capital Group"]);
    expect(g?.sections?.find((s) => s.key === "p1")?.channels).toHaveLength(2);
    expect(g?.sections?.find((s) => s.key === "p2")?.channels).toHaveLength(1);
  });

  it("every channel appears exactly once, and the flat list still holds them all", () => {
    const channels = [
      partnerChannel("p1", "General"), partnerChannel("p2", "General"),
      partnerChannel("p2", "Marketing"),
    ];
    const g = partnersGroup(channels)!;
    const inSections = g.sections!.flatMap((s) => s.channels.map((c) => c.id));
    expect(inSections).toHaveLength(channels.length);
    expect(new Set(inSections).size).toBe(channels.length);
    expect(g.channels.map((c) => c.id).sort()).toEqual([...inSections].sort());
  });

  it("sections are keyed by ID, so two partners sharing a name stay apart", () => {
    /* Rule 4: never infer a relationship from a display name. */
    const g = partnersGroup([
      partnerChannel("p1", "General", { partnerName: "Same Name Ltd" }),
      partnerChannel("p2", "General", { partnerName: "Same Name Ltd" }),
    ]);
    expect(g?.sections).toHaveLength(2);
    expect(g?.sections?.map((s) => s.key)).toEqual(["p1", "p2"]);
  });

  it("the most recently spoken-to partner leads", () => {
    const g = partnersGroup([
      partnerChannel("p1", "General", { lastMessageAt: "2026-09-01T00:00:00Z" }),
      partnerChannel("p2", "General", { lastMessageAt: "2026-09-14T00:00:00Z" }),
    ]);
    expect(g?.sections?.[0].key).toBe("p2");
  });

  it("an archived partner conversation is not sectioned into Partners at all", () => {
    /* It belongs to Archived, and that group is never split. */
    const groups = groupChannels([
      partnerChannel("p1", "General"),
      partnerChannel("p2", "Old", { archivedAt: "2026-01-01T00:00:00Z" }),
    ]);
    expect(groups.find((g) => g.key === "partners")?.sections).toBeUndefined();
    expect(groups.find((g) => g.key === "archived")?.sections).toBeUndefined();
  });

  it("groups that are not owner-scoped are never sectioned", () => {
    const groups = groupChannels([
      ch({ id: "i1", kind: "topic", name: "general", displayName: "general" }),
      ch({ id: "i2", kind: "topic", name: "random", displayName: "random" }),
      ch({ id: "d1", kind: "direct", displayName: "Someone" }),
      ch({ id: "d2", kind: "direct", displayName: "Somebody" }),
    ]);
    for (const g of groups) expect(g.sections).toBeUndefined();
  });
});
