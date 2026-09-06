import { describe, expect, it } from "vitest";
import {
  mentionNode,
  mentionQueryAt,
  mentionText,
  mentionedUserIds,
  mentionsIn,
  rankMentionCandidates,
  readMention,
} from "./mentions";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

const doc = (...content: unknown[]) => ({ type: "doc", content });

describe("readMention", () => {
  it("accepts a real id with a label and refuses anything else", () => {
    expect(readMention(mentionNode(ID_A, "Piper"))).toEqual({ userId: ID_A, label: "Piper" });
    expect(readMention({ type: "mention", attrs: { userId: "not-a-uuid", label: "X" } })).toBeNull();
    expect(readMention({ type: "mention", attrs: { userId: ID_A, label: "  " } })).toBeNull();
    expect(readMention({ type: "text", text: "@Piper" })).toBeNull();
  });
});

describe("mentionedUserIds", () => {
  it("finds mentions at any depth, once each, in order", () => {
    const body = doc(
      { type: "paragraph", content: [{ type: "text", text: "Hi " }, mentionNode(ID_B, "Quinn")] },
      { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [mentionNode(ID_A, "Piper"), mentionNode(ID_B, "Quinn")] }] }] },
    );
    expect(mentionedUserIds(body)).toEqual([ID_B, ID_A]);
    expect(mentionsIn(body).map((m) => m.label)).toEqual(["Quinn", "Piper"]);
  });

  it("returns nothing for plain text or a malformed body", () => {
    expect(mentionedUserIds(doc({ type: "paragraph", content: [{ type: "text", text: "@Piper" }] }))).toEqual([]);
    expect(mentionedUserIds("not a document")).toEqual([]);
    expect(mentionedUserIds(null)).toEqual([]);
  });

  it("ignores a mention node with a bad id, rather than trusting it", () => {
    const body = doc({ type: "paragraph", content: [{ type: "mention", attrs: { userId: "'; drop table", label: "X" } }] });
    expect(mentionedUserIds(body)).toEqual([]);
  });
});

describe("mentionQueryAt", () => {
  it("opens on @ at the start or after a space", () => {
    expect(mentionQueryAt("@pi", 3)).toEqual({ query: "pi", from: 0 });
    expect(mentionQueryAt("hello @qu", 9)).toEqual({ query: "qu", from: 6 });
    expect(mentionQueryAt("@", 1)).toEqual({ query: "", from: 0 });
  });

  it("does not open inside an email address or after the word ends", () => {
    expect(mentionQueryAt("mail me at dee@bes.test", 23)).toBeNull();
    expect(mentionQueryAt("@piper and then", 15)).toBeNull();
    expect(mentionQueryAt("no at sign here", 15)).toBeNull();
  });

  it("gives up on an absurdly long word", () => {
    expect(mentionQueryAt("@" + "x".repeat(41), 42)).toBeNull();
  });
});

describe("rankMentionCandidates", () => {
  const people = [
    { name: "Piper Manager", email: "org.manager@bes.test" },
    { name: "Quinn Lead", email: "org.lead@bes.test" },
    { name: "Rae Agent", email: "piper.rae@bes.test" },
  ];

  it("puts a name that starts with the query first, then other words, then email", () => {
    expect(rankMentionCandidates(people, "pi").map((p) => p.name)).toEqual(["Piper Manager", "Rae Agent"]);
    expect(rankMentionCandidates(people, "lead").map((p) => p.name)).toEqual(["Quinn Lead"]);
    expect(rankMentionCandidates(people, "org.lead").map((p) => p.name)).toEqual(["Quinn Lead"]);
  });

  it("returns everyone up to the limit when nothing is typed yet", () => {
    expect(rankMentionCandidates(people, "", 2)).toHaveLength(2);
  });

  it("returns nothing when nobody matches", () => {
    expect(rankMentionCandidates(people, "zzz")).toEqual([]);
  });
});

describe("mentionText", () => {
  it("is the one place the plain-text form is decided", () => {
    expect(mentionText("Piper Manager")).toBe("@Piper Manager");
  });
});
