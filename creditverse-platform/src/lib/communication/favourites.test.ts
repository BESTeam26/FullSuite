/**
 * Starring a conversation.
 *
 * Dee, 2026-09-17: "I dont have Favorite Section/ chat / SLACK has that as
 * STAR. We can do just Favorite."
 */
import { describe, expect, it } from "vitest";
import { groupChannels } from "./channel-groups";
import type { Channel } from "@/lib/data/channels";

const ch = (over: Partial<Channel> & { id: string }): Channel => ({
  organizationId: null, agencyId: "a1", partnerGroupId: null, partnerServiceId: null,
  partnerTopic: null, kind: "topic", name: over.id, displayName: over.id,
  directUserId: null, purpose: null, openToScope: false, archivedAt: null,
  sharedWithBes: false, auditOnly: false, isManager: false, favourite: false, canRename: false,
  unread: 0, lastMessageAt: null, ...over,
});

const keys = (channels: Channel[]) => groupChannels(channels).map((g) => g.key);
const group = (channels: Channel[], key: string) =>
  groupChannels(channels).find((g) => g.key === key);

describe("the Favorites section", () => {
  it("does not exist until something is starred", () => {
    expect(keys([ch({ id: "general" })])).not.toContain("favourites");
  });

  it("comes first, above everything", () => {
    expect(keys([ch({ id: "general", favourite: true })])[0]).toBe("favourites");
  });

  it("is a shortcut, not a move — the conversation keeps its own home", () => {
    /* Somebody who stars #general still expects to find it under BES
       internal. Slack works this way and so does this. */
    const groups = groupChannels([ch({ id: "general", favourite: true })]);
    expect(groups.find((g) => g.key === "favourites")?.channels).toHaveLength(1);
    expect(groups.find((g) => g.key === "internal")?.channels).toHaveLength(1);
  });

  it("lifts a starred direct message too, not only channels", () => {
    const dm = ch({ id: "dm", kind: "direct", favourite: true, displayName: "Rowell" });
    expect(group([dm], "favourites")?.channels[0].id).toBe("dm");
    expect(group([dm], "direct")?.channels[0].id).toBe("dm");
  });

  it("does NOT lift an archived one", () => {
    /* Starring is about what you are working on. An archived conversation is
       not, and putting it at the top of the rail would be noise you cannot
       clear without unstarring history. */
    const old = ch({ id: "old", favourite: true, archivedAt: "2026-01-01T00:00:00Z" });
    expect(keys([old])).not.toContain("favourites");
    expect(group([old], "archived")?.channels).toHaveLength(1);
  });

  it("is labelled the way Dee asked, not the way the column is spelled", () => {
    expect(group([ch({ id: "g", favourite: true })], "favourites")?.label).toBe("Favorites");
  });

  it("keeps Unread above the rest but below Favorites", () => {
    const starred = ch({ id: "s", favourite: true });
    const noisy = ch({ id: "n", unread: 3 });
    expect(keys([starred, noisy]).slice(0, 2)).toEqual(["favourites", "unread"]);
  });
});
