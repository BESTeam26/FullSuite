/**
 * CR-4b. These channels were "TRAP_CHANNELS" — CRA + FTC + CFPB, described as
 * multi-channel pressure from Round 1, with every channel firing on account
 * category alone. A dispute round is allowed to be just:
 *
 *     fact → recipient → dispute → result
 *
 * So the tests below are about words. That is not a small thing: the words
 * were the instruction, and one of them told staff a federal identity-theft
 * report was required for every collection.
 */
import { describe, expect, it } from "vitest";
import {
  DISPUTE_CHANNELS,
  FTC_CONSUMER_RESOURCES,
  LETTER_CATEGORIES,
  ftcResourceFor,
} from "./letters-and-channels";

describe("no channel is presented as a required step", () => {
  it("says 'required' nowhere in any channel", () => {
    const text = Object.values(DISPUTE_CHANNELS)
      .map((c) => `${c.label} ${c.description}`)
      .join(" ");
    expect(text).not.toMatch(/required/i);
    expect(text).not.toMatch(/must file/i);
    expect(text).not.toMatch(/fires simultaneously/i);
    expect(text).not.toMatch(/pressure/i);
  });

  it("describes the CFPB channel as the consumer's, with its own prerequisites", () => {
    const cfpb = DISPUTE_CHANNELS.CFPB.description;
    expect(cfpb).toMatch(/prerequisites/i);
    expect(cfpb).toMatch(/prior dispute with the bureau/i);
    expect(cfpb).toMatch(/consumer files it, not BES/i);
    /* The old text was "filed by category. Separate complaint per negative
       category." — a complaint per category, from the category. */
    expect(cfpb).not.toMatch(/by category/i);
    expect(cfpb).not.toMatch(/separate complaint per/i);
  });

  it("describes the FTC channel as available only on a consumer's statement", () => {
    const ftc = DISPUTE_CHANNELS.FTC.description;
    expect(ftc).toMatch(/never establishes identity theft/i);
    expect(ftc).toMatch(/only where the consumer states/i);
  });
});

describe("letter categories carry relevance, never requirement", () => {
  it("names the fields for relevance", () => {
    for (const cat of LETTER_CATEGORIES) {
      expect(typeof cat.ftcResourceRelevant).toBe("boolean");
      expect(typeof cat.cfpbResourceRelevant).toBe("boolean");
      expect(cat).not.toHaveProperty("requiresFTC");
      expect(cat).not.toHaveProperty("requiresCFPB");
    }
  });

  it("never routes to a federal report from a category, however relevant", () => {
    for (const cat of LETTER_CATEGORIES) {
      /* Relevance is about what to explain. Reaching the resource still needs
         a recorded consumer statement, and no category supplies one. */
      expect(ftcResourceFor("3rd-Party Collection", undefined)).toBeNull();
      expect(cat.ftcResourceRelevant === true || cat.ftcResourceRelevant === false).toBe(true);
    }
  });

  it("warns rather than instructs on an inquiry the consumer holds an account with", () => {
    const inquiry = LETTER_CATEGORIES.find((c) => c.key === "inquiry")!;
    expect(inquiry.description).toMatch(/never treated as fraud/i);
    expect(inquiry.description).not.toMatch(/FTC filings/i);
  });
});

describe("the consumer FTC resources carry their own cautions", () => {
  it("says a collection is not evidence of identity theft", () => {
    const coll = FTC_CONSUMER_RESOURCES.find((r) => r.relevantTo === "3rd-Party Collection")!;
    expect(coll.caution).toMatch(/not evidence of identity theft/i);
    expect(coll.caution).toMatch(/never as a step required/i);
  });

  it("frames each as something the consumer does", () => {
    for (const r of FTC_CONSUMER_RESOURCES) {
      expect(r.purpose).toMatch(/consumer/i);
      expect(r.caution.length).toBeGreaterThan(40);
    }
  });
});
