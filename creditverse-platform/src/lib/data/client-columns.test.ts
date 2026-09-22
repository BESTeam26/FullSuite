/**
 * The two rules a custom column has to satisfy before the database will take
 * it — both learned by being refused.
 */
import { describe, expect, it } from "vitest";
import { columnKeyFor } from "./client-columns";

describe("the key a column is stored under", () => {
  /* `workspace_fields_key_check` is `^[a-z][a-z0-9_]{0,39}$`. A label that
     starts with a digit or is pure punctuation would otherwise be rejected
     at insert, which reads to the user as "Add column silently did nothing". */
  it("always starts with a letter", () => {
    expect(columnKeyFor("Priority")).toBe("priority");
    expect(columnKeyFor("2026 Goals")).toMatch(/^[a-z]/);
    expect(columnKeyFor("!!!")).toMatch(/^[a-z]/);
  });

  it("never ends in an underscore and never exceeds forty characters", () => {
    expect(columnKeyFor("Next step?")).toBe("next_step");
    const long = columnKeyFor("a".repeat(80));
    expect(long.length).toBeLessThanOrEqual(40);
    expect(long.endsWith("_")).toBe(false);
  });

  it("matches the constraint for anything somebody might type", () => {
    const shape = /^[a-z][a-z0-9_]{0,39}$/;
    for (const label of ["Priority", "2026 Goals", "!!!", "Next step?", "  spaced  out  ",
                         "Ré-import", "a".repeat(80), "9"]) {
      expect(columnKeyFor(label)).toMatch(shape);
    }
  });
});
