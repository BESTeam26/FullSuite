import { describe, expect, it } from "vitest";
import { toCsv } from "./export-csv";

describe("toCsv", () => {
  it("quotes commas, quotes and newlines and leaves plain values bare", () => {
    expect(toCsv(["a", "b"], [["x,y", 'say "hi"'], [1, null]])).toBe('a,b\n"x,y","say ""hi"""\n1,');
  });
});
