import { describe, expect, it } from "vitest";
import { passwordProblem } from "./account";

describe("passwordProblem", () => {
  it("requires the minimum length and a matching confirmation", () => {
    expect(passwordProblem("short", "short")).toMatch(/at least/);
    expect(passwordProblem("long-enough-1", "different")).toBe("The two entries do not match.");
    expect(passwordProblem("long-enough-1", "long-enough-1")).toBeNull();
  });
});
