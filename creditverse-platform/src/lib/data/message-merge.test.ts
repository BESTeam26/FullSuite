/**
 * The two properties Dee named in §55: an optimistic send must not duplicate
 * when the Realtime event arrives, and the order must be correct.
 */
import { describe, expect, it } from "vitest";
import { mergeIncoming } from "./use-message-realtime";
import type { RichMessage } from "./messages";

const msg = (over: Partial<RichMessage>): RichMessage => ({
  id: 1,
  channelId: "cccccccc-0000-4000-8000-000000000001",
  authorId: "aaaaaaaa-0000-4000-8000-000000000001",
  authorName: "Dee Gallardo",
  fromBes: true,
  bodyText: "hello",
  createdAt: "2026-09-08T10:00:00.000Z",
  editedAt: null,
  deleted: false,
  messageType: "message",
  announcementId: null,
  announcementTitle: null,
  announcementBody: null,
  announcementPublishedAt: null,
  parentMessageId: null,
  replyToId: null,
  replyToText: null,
  replyToAuthor: null,
  replyCount: 0,
  lastReplyAt: null,
  pinned: false,
  reactions: [],
  attachments: [],
  mentions: [],
  ...over,
});

describe("an optimistic row is replaced, never twinned", () => {
  it("matches the server's row to the optimistic one by client_message_id", () => {
    const optimistic = msg({ id: -1, pending: true, clientMessageId: "k1", bodyText: "hello" });
    const fromServer = msg({ id: 77, clientMessageId: "k1", bodyText: "hello" });
    const out = mergeIncoming([optimistic], fromServer);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(77);
    /* The pending marks are cleared, or the row renders as still sending. */
    expect(out[0].pending).toBe(false);
    expect(out[0].clientMessageId).toBeUndefined();
  });

  it("recognises a second delivery of the same row by id", () => {
    const already = msg({ id: 77 });
    const out = mergeIncoming([already], msg({ id: 77, bodyText: "hello (edited)" }));
    expect(out).toHaveLength(1);
    expect(out[0].bodyText).toBe("hello (edited)");
  });

  it("does not match two different messages that share nothing but a null key", () => {
    /* `clientMessageId` is undefined on anything the server sent. Matching on
       undefined === undefined would collapse every server row into the first. */
    const a = msg({ id: 1, bodyText: "first" });
    const b = msg({ id: 2, bodyText: "second", createdAt: "2026-09-08T10:00:01.000Z" });
    expect(mergeIncoming([a], b)).toHaveLength(2);
  });
});

describe("the server's clock decides the order", () => {
  it("inserts an out-of-order arrival in its right place", () => {
    const first = msg({ id: 1, createdAt: "2026-09-08T10:00:00.000Z", bodyText: "first" });
    const third = msg({ id: 3, createdAt: "2026-09-08T10:00:02.000Z", bodyText: "third" });
    const second = msg({ id: 2, createdAt: "2026-09-08T10:00:01.000Z", bodyText: "second" });
    const out = mergeIncoming([first, third], second);
    expect(out.map((m) => m.bodyText)).toEqual(["first", "second", "third"]);
  });

  it("appends the newest when it arrives last, which is the ordinary case", () => {
    const first = msg({ id: 1, createdAt: "2026-09-08T10:00:00.000Z", bodyText: "first" });
    const out = mergeIncoming([first], msg({ id: 2, createdAt: "2026-09-08T10:00:05.000Z", bodyText: "next" }));
    expect(out.map((m) => m.id)).toEqual([1, 2]);
  });

  it("does not reorder a list when replacing in place", () => {
    const a = msg({ id: 1, createdAt: "2026-09-08T10:00:00.000Z" });
    const b = msg({ id: -1, pending: true, clientMessageId: "k9", createdAt: "2026-09-08T10:00:09.000Z" });
    const out = mergeIncoming([a, b], msg({ id: 9, clientMessageId: "k9", createdAt: "2026-09-08T10:00:09.000Z" }));
    expect(out.map((m) => m.id)).toEqual([1, 9]);
  });

  it("starts a list from empty", () => {
    expect(mergeIncoming([], msg({ id: 5 })).map((m) => m.id)).toEqual([5]);
  });
});
