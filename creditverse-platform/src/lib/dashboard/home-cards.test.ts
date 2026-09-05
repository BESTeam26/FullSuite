import { describe, expect, it } from "vitest";
import { moveHomeCard, resolveHomeCards, toggleHomeCard } from "./home-cards";

describe("organization Home cards", () => {
  it("defaults to every card the organization is entitled to", () => {
    const keys = resolveHomeCards(null, ["creditOps"]).map((c) => c.key);
    expect(keys).toContain("work.open");
    expect(keys).toContain("creditops.active");
    expect(keys).not.toContain("fundingops.active");
    expect(keys).not.toContain("workspaces.count");
  });

  it("honours a saved order and drops unknown or unentitled keys", () => {
    const keys = resolveHomeCards(
      ["creditops.attention", "bogus", "fundingops.funded", "work.open", "work.open"],
      ["creditOps"],
    ).map((c) => c.key);
    expect(keys).toEqual(["creditops.attention", "work.open"]);
  });

  it("falls back to the default when nothing saved survives", () => {
    expect(resolveHomeCards(["fundingops.funded"], ["creditOps"]).length).toBeGreaterThan(1);
    expect(resolveHomeCards("not-an-array", []).map((c) => c.key)).toEqual(["work.open", "work.mine", "work.overdue"]);
  });

  it("edits are pure list operations", () => {
    expect(toggleHomeCard(["work.open"], "work.mine")).toEqual(["work.open", "work.mine"]);
    expect(toggleHomeCard(["work.open", "work.mine"], "work.open")).toEqual(["work.mine"]);
    expect(moveHomeCard(["a" as never, "b" as never], "b" as never, -1)).toEqual(["b", "a"]);
    expect(moveHomeCard(["a" as never, "b" as never], "a" as never, -1)).toEqual(["a", "b"]);
  });
});
