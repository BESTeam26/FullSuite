import { describe, expect, it } from "vitest";
import { VOICE_NOTES, checkVoice } from "./letter-voice";

describe("checkVoice", () => {
  it("passes a short, direct, annoyed letter", () => {
    const text = "This is the third time I have written about this balance. Your last response said verified. The balance is still $1,310 on my report and $1,200 on the other two. How did you verify it?";
    expect(checkVoice(text, "frustrated")).toEqual([]);
  });

  it("catches the em dash the specification bans", () => {
    expect(checkVoice("The balance — which is wrong — is still there.").map((i) => i.found))
      .toContain("em dash");
  });

  it("catches a guarantee at any tier", () => {
    for (const voice of ["plain", "frustrated"] as const) {
      expect(checkVoice("This guarantees deletion.", voice).map((i) => i.found)).toContain("guarantee");
    }
  });

  it("catches the phrasing that makes a letter read as generated", () => {
    const found = checkVoice("Please be advised that it is important to note the discrepancy.").map((i) => i.found);
    expect(found).toContain("please be advised");
    expect(found).toContain("it is important to note");
  });

  it("catches a sentence nobody would write by hand", () => {
    const long = "I am writing " + "about this account and the balance and the dates and the history ".repeat(6) + "today.";
    expect(checkVoice(long).some((i) => i.kind === "overlong")).toBe(true);
  });

  it("flags hedging in a frustrated letter, and lets it pass in a plain one", () => {
    const text = "I may be wrong, but the balance looks incorrect.";
    expect(checkVoice(text, "frustrated").some((i) => i.kind === "hedge")).toBe(true);
    expect(checkVoice(text, "plain").some((i) => i.kind === "hedge")).toBe(false);
  });

  it("does not mistake anger for a compliance problem", () => {
    /* Frustration on a confirmed fact is legitimate and must survive. */
    const text = "I have disputed this twice. Nothing changed. The date of last activity is still before the date the account opened.";
    expect(checkVoice(text, "frustrated")).toEqual([]);
  });
});

describe("VOICE_NOTES", () => {
  it("tells a frustrated writer to be angry about the fact, not the conclusion", () => {
    expect(VOICE_NOTES.frustrated.join(" ")).toContain("never about a claim the record cannot carry");
  });
});
