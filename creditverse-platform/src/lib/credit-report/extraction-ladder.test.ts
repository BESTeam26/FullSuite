import { describe, expect, it } from "vitest";
import { ACCEPT_THRESHOLD, assess, ladderFor, scoreExtraction } from "./extraction-ladder";

const realish = `
EQUIFAX CREDIT REPORT
Account: CAPITAL ONE  ending 6004
Account Status: Open      Balance: $609.00
High Credit: $681.00      Credit Limit: $500.00
Date Opened: 05/01/2022   Date Last Active: 04/01/2026
Payment Status: Late 120 Days
Account: LVNV FUNDING     Collection      Balance: $1,066.00
Date Opened: 09/14/2021   Charge-off reported 2023
`.repeat(3);

const gibberish = "|~#@^*(){}[]<>/\\\\ ".repeat(200);

describe("scoreExtraction", () => {
  it("recognises a credit report", () => {
    const q = scoreExtraction(realish);
    expect(q.score).toBeGreaterThanOrEqual(ACCEPT_THRESHOLD);
  });

  it("gives up on almost-nothing", () => {
    expect(scoreExtraction("  ").score).toBe(0);
    expect(scoreExtraction("page 1 of 12").reasons[0]).toContain("Almost nothing");
  });

  it("catches the classic OCR failure — characters that are not words", () => {
    const q = scoreExtraction(gibberish);
    expect(q.score).toBeLessThan(0.45);
    expect(q.reasons.join(" ")).toContain("symbols rather than words");
  });

  it("says what was missing rather than only scoring", () => {
    const q = scoreExtraction("Dear customer, thank you for your enquiry. ".repeat(20));
    expect(q.reasons.join(" ")).toContain("a dollar amount");
  });
});

describe("the ladder", () => {
  it("tries the free rungs first, and only then the paid one", () => {
    expect(ladderFor(true)).toEqual(["text_layer", "local_ocr", "assisted"]);
    expect(ladderFor(false)).toEqual(["local_ocr", "assisted"]);
  });

  it("accepts a clean text layer without review or charge", () => {
    const r = assess("text_layer", realish);
    expect(r.needsReview).toBe(false);
    expect(r.shouldOfferAssisted).toBe(false);
    expect(r.summary).toContain("nothing was charged");
  });

  it("accepts clean local OCR without charging either", () => {
    const r = assess("local_ocr", realish);
    expect(r.needsReview).toBe(false);
    expect(r.summary).toContain("Nothing was charged");
  });

  it("offers the model only once local extraction actually failed", () => {
    expect(assess("local_ocr", gibberish).shouldOfferAssisted).toBe(true);
    expect(assess("local_ocr", realish).shouldOfferAssisted).toBe(false);
  });

  it("ALWAYS sends assisted extraction to a person, however well it scored", () => {
    /* A model reading a photograph is inference, and inference gets a human
       before it becomes a client's balance. */
    const r = assess("assisted", realish);
    expect(r.quality.score).toBeGreaterThanOrEqual(ACCEPT_THRESHOLD);
    expect(r.needsReview).toBe(true);
  });

  it("never offers a paid retry of a paid attempt", () => {
    expect(assess("assisted", gibberish).shouldOfferAssisted).toBe(false);
  });
});
