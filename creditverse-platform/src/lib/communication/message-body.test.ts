/**
 * The textual cases, none of which need a browser.
 *
 * The one that matters most is the prefix collision: before longest-first
 * matching, a colleague called "Sam" would claim the "@Sam" that begins
 * "@Sam Okafor" and the message would notify the wrong person while looking
 * completely correct on screen.
 */
import { describe, expect, it } from "vitest";
import { buildMessageBody, effectiveMentions, splitBody } from "./message-body";
import { mentionedUserIds } from "@/lib/activity/mentions";

const SAM = { userId: "11111111-1111-4111-8111-111111111111", label: "Sam" };
const SAM_O = { userId: "22222222-2222-4222-8222-222222222222", label: "Sam Okafor" };
const ROWELL = { userId: "33333333-3333-4333-8333-333333333333", label: "Rowell" };

const ids = (text: string, mentions: { userId: string; label: string }[]) =>
  mentionedUserIds(buildMessageBody(text, mentions).body);

describe("the document the database reads", () => {
  it("emits a mention node the SQL parser can find", () => {
    expect(ids("morning @Rowell", [ROWELL])).toEqual([ROWELL.userId]);
  });

  it("keeps the plain text exactly as typed, @label and all", () => {
    const out = buildMessageBody("morning @Rowell", [ROWELL]);
    expect(out.bodyText).toBe("morning @Rowell");
  });

  it("splits text around the mention rather than replacing it", () => {
    const body = buildMessageBody("hi @Rowell can you look", [ROWELL]).body as
      { content: { content: { type: string; text?: string }[] }[] };
    expect(body.content[0].content.map((n) => n.type)).toEqual(["text", "mention", "text"]);
    expect(body.content[0].content[0].text).toBe("hi ");
    expect(body.content[0].content[2].text).toBe(" can you look");
  });

  it("handles a mention at the very start and the very end", () => {
    expect(ids("@Rowell", [ROWELL])).toEqual([ROWELL.userId]);
    expect(ids("please see @Rowell", [ROWELL])).toEqual([ROWELL.userId]);
  });
});

describe("labels that are prefixes of each other", () => {
  it("gives '@Sam Okafor' to Sam Okafor, not to Sam", () => {
    expect(ids("@Sam Okafor please review", [SAM, SAM_O])).toEqual([SAM_O.userId]);
  });

  it("still names Sam when only Sam was typed", () => {
    expect(ids("@Sam please review", [SAM, SAM_O])).toEqual([SAM.userId]);
  });

  it("names both when both were typed", () => {
    expect(ids("@Sam and @Sam Okafor", [SAM, SAM_O]).sort())
      .toEqual([SAM.userId, SAM_O.userId].sort());
  });

  it("does not match a label inside a longer word", () => {
    expect(ids("@Samantha is away", [SAM])).toEqual([]);
  });
});

describe("what the author actually left in the message", () => {
  it("names nobody when the label was deleted again", () => {
    expect(ids("never mind", [ROWELL])).toEqual([]);
  });

  it("names somebody once even when mentioned twice", () => {
    expect(ids("@Rowell and again @Rowell", [ROWELL])).toEqual([ROWELL.userId]);
  });

  it("effectiveMentions reports exactly who will be told", () => {
    expect(effectiveMentions("@Rowell only", [ROWELL, SAM])).toEqual([ROWELL]);
    expect(effectiveMentions("nobody", [ROWELL, SAM])).toEqual([]);
  });
});

describe("a message with no mentions at all", () => {
  it("is still a valid document", () => {
    const body = buildMessageBody("just a message").body as
      { type: string; content: { content: { text: string }[] }[] };
    expect(body.type).toBe("doc");
    expect(body.content[0].content[0].text).toBe("just a message");
    expect(mentionedUserIds(body)).toEqual([]);
  });

  it("does not treat an email address as one", () => {
    expect(ids("write to sam@example.test", [SAM])).toEqual([]);
  });
});

describe("reading the mentions back out for display", () => {
  const parts = (text: string, mentions: typeof SAM[], me?: string) =>
    splitBody(text, mentions, me).map((p) =>
      p.kind === "mention" ? `[${p.text}${p.isMe ? "*" : ""}]` : p.text).join("");

  it("marks the run that is the mention and leaves the rest alone", () => {
    expect(parts("hi @Rowell can you look", [ROWELL])).toBe("hi [@Rowell] can you look");
  });

  it("marks a mention of the reader differently from anybody else's", () => {
    expect(parts("@Rowell and @Sam", [ROWELL, SAM], SAM.userId))
      .toBe("[@Rowell] and [@Sam*]");
  });

  it("does not light up a name that was merely typed as a word", () => {
    /* The message names nobody, so nothing is highlighted — even though a
       colleague called Sam exists and the word "Sam" is right there. */
    expect(parts("ask Sam about it", [])).toBe("ask Sam about it");
  });

  it("is the exact inverse of what the builder wrote", () => {
    const text = "@Sam Okafor please brief @Rowell today";
    const built = mentionedUserIds(buildMessageBody(text, [SAM, SAM_O, ROWELL]).body);
    const shown = splitBody(text, [SAM, SAM_O, ROWELL]).filter((p) => p.kind === "mention");
    expect(shown).toHaveLength(built.length);
    expect(shown).toHaveLength(2);
  });

  it("returns nothing for an empty message", () => {
    expect(splitBody("", [ROWELL])).toEqual([]);
  });
});
