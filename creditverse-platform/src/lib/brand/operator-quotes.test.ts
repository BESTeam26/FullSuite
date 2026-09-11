import { describe, expect, it } from "vitest";
import { OPERATOR_QUOTES, pickOperatorQuote } from "@/lib/brand/operator-quotes";

describe("the operator lines", () => {
  it("opens with the line the Company Hub has always used", () => {
    expect(OPERATOR_QUOTES[0]).toBe("If it lives in someone's memory, it's not a system yet.");
  });

  it("holds no duplicates", () => {
    expect(new Set(OPERATOR_QUOTES).size).toBe(OPERATOR_QUOTES.length);
  });

  it("keeps every line short enough to read at a glance", () => {
    /* These sit beside a password field. A line somebody has to stop and parse
       is the wrong length for the place it appears, whatever it says. */
    const long = OPERATOR_QUOTES.filter((q) => q.length > 95);
    expect(long).toEqual([]);
  });

  it("carries its own punctuation and no stray quote marks", () => {
    /* The page draws the typographic quotes around whichever line it picks, so
       a line that also carries its own would render as ""like this"". */
    const malformed = OPERATOR_QUOTES.filter(
      (q) => !/[.!?]$/.test(q) || /^["“]/.test(q) || /["”]$/.test(q.slice(0, -1)),
    );
    expect(malformed).toEqual([]);
  });

  it("returns a line for any index, including ones out of range", () => {
    expect(pickOperatorQuote(0)).toBe(OPERATOR_QUOTES[0]);
    expect(pickOperatorQuote(OPERATOR_QUOTES.length)).toBe(OPERATOR_QUOTES[0]);
    expect(pickOperatorQuote(-1)).toBe(OPERATOR_QUOTES[OPERATOR_QUOTES.length - 1]);
    expect(OPERATOR_QUOTES).toContain(pickOperatorQuote());
  });

  it("can reach every line, so none is dead weight", () => {
    const seen = new Set(OPERATOR_QUOTES.map((_, i) => pickOperatorQuote(i)));
    expect(seen.size).toBe(OPERATOR_QUOTES.length);
  });
});
