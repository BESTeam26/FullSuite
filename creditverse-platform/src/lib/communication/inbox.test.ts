/**
 * The Inbox counts conversations, not messages.
 *
 * The distinction is the point: "3" beside Partner messages has to mean three
 * partners are waiting, because that is the number somebody acts on. One
 * partner who sent forty lines is still one thing to answer.
 */
import { describe, expect, it } from "vitest";
import { inboxBuckets } from "./inbox";
import type { Channel } from "@/lib/data/channels";

const ch = (over: Partial<Channel>): Channel => ({
  id: "c1", organizationId: null, agencyId: "a1", partnerGroupId: null,
  partnerServiceId: null, partnerTopic: null, kind: "topic", name: "general",
  displayName: "general", directUserId: null, purpose: null, openToScope: true,
  archivedAt: null, sharedWithBes: false, auditOnly: false, isManager: false,
  unread: 0, lastMessageAt: null, ...over,
});

const bucket = (channels: Channel[], key: string) =>
  inboxBuckets(channels).find((b) => b.key === key)!;

describe("what the badge counts", () => {
  it("counts conversations waiting, not messages waiting", () => {
    expect(bucket([ch({ id: "a", partnerGroupId: "p", unread: 40 })], "partners").waiting).toBe(1);
  });

  it("counts each waiting partner once", () => {
    expect(bucket([
      ch({ id: "a", partnerGroupId: "p1", unread: 2 }),
      ch({ id: "b", partnerGroupId: "p2", unread: 1 }),
      ch({ id: "c", partnerGroupId: "p3", unread: 0 }),
    ], "partners").waiting).toBe(2);
  });
});

describe("what never counts as waiting", () => {
  it("an audit row you are not in", () => {
    expect(bucket([ch({ auditOnly: true, unread: 5 })], "unread").waiting).toBe(0);
  });

  it("an archived conversation", () => {
    expect(bucket([ch({ archivedAt: "2026-09-01T00:00:00Z", unread: 5 })], "unread").waiting).toBe(0);
  });
});

describe("each conversation lands where it belongs", () => {
  it("a direct message is a direct message, not internal", () => {
    const b = inboxBuckets([ch({ kind: "direct" })]);
    expect(b.find((x) => x.key === "direct")!.channels).toHaveLength(1);
    expect(b.find((x) => x.key === "internal")!.channels).toHaveLength(0);
  });

  it("a partner channel is not counted as BES internal", () => {
    const b = inboxBuckets([ch({ partnerGroupId: "p1" })]);
    expect(b.find((x) => x.key === "partners")!.channels).toHaveLength(1);
    expect(b.find((x) => x.key === "internal")!.channels).toHaveLength(0);
  });

  it("an organization channel is neither partner nor internal", () => {
    const b = inboxBuckets([ch({ organizationId: "o1", agencyId: null })]);
    expect(b.find((x) => x.key === "partners")!.channels).toHaveLength(0);
    expect(b.find((x) => x.key === "internal")!.channels).toHaveLength(0);
  });

  it("Unread holds whatever is waiting, whichever kind it is", () => {
    expect(bucket([
      ch({ id: "a", kind: "direct", unread: 1 }),
      ch({ id: "b", partnerGroupId: "p1", unread: 1 }),
      ch({ id: "c", unread: 0 }),
    ], "unread").channels).toHaveLength(2);
  });
});

describe("the buckets that are deliberately absent", () => {
  it("offers no bucket the data cannot support", () => {
    /* "Assigned to me" and "Needs reply" were asked for and are not here:
       a conversation has no assignee, and visible_channels() does not say
       whether the last message was mine. A bucket that guesses is worse than
       one that is missing. */
    expect(inboxBuckets([ch({})]).map((b) => b.key))
      .toEqual(["unread", "direct", "partners", "internal"]);
  });
});
