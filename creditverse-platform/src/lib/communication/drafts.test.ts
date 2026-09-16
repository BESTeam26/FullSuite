/**
 * A draft is somebody's unsent typing. The rules are about not losing it and
 * not inventing it.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { clearDraft, listDrafts, readDraft, saveDraft } from "./drafts";

beforeEach(() => window.localStorage.clear());

describe("keeping a draft", () => {
  it("comes back for the conversation it was typed in", () => {
    saveDraft("c1", "half a thought");
    expect(readDraft("c1")).toBe("half a thought");
  });

  it("does not leak into another conversation", () => {
    saveDraft("c1", "for c1");
    expect(readDraft("c2")).toBe("");
  });

  it("replaces rather than appends when you keep typing", () => {
    saveDraft("c1", "one");
    saveDraft("c1", "one two");
    expect(readDraft("c1")).toBe("one two");
  });
});

describe("what is not a draft", () => {
  it("empty text stores nothing", () => {
    saveDraft("c1", "");
    expect(listDrafts()).toHaveLength(0);
  });

  it("whitespace alone stores nothing — it would list a conversation that holds no words", () => {
    saveDraft("c1", "    ");
    expect(listDrafts()).toHaveLength(0);
  });

  it("clearing removes the entry, not just its text", () => {
    saveDraft("c1", "something");
    clearDraft("c1");
    expect(listDrafts()).toHaveLength(0);
    expect(readDraft("c1")).toBe("");
  });

  it("emptying a draft removes an entry that was already there", () => {
    saveDraft("c1", "something");
    saveDraft("c1", "");
    expect(listDrafts()).toHaveLength(0);
  });
});

describe("the list", () => {
  it("puts the most recently touched first", () => {
    saveDraft("older", "a");
    saveDraft("newer", "b");
    expect(listDrafts().map((d) => d.channelId)).toEqual(["newer", "older"]);
  });

  it("survives a corrupted store rather than throwing at somebody mid-sentence", () => {
    window.localStorage.setItem("bes.communication.drafts", "{not json");
    expect(listDrafts()).toEqual([]);
    expect(readDraft("c1")).toBe("");
  });

  it("ignores a stored entry that lost its text", () => {
    window.localStorage.setItem("bes.communication.drafts",
      JSON.stringify({ c1: { channelId: "c1", savedAt: "2026-09-16T00:00:00Z" } }));
    expect(listDrafts()).toEqual([]);
  });
});
