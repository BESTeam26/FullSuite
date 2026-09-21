/**
 * The staleness rule, which decides whether the team is asked to reload.
 * Wrong in one direction it nags; wrong in the other it leaves somebody on
 * yesterday's code reporting fixed bugs.
 */
import { describe, expect, it, vi } from "vitest";
import { deployedEntry, isStale } from "./app-version";

describe("is this page out of date", () => {
  it("a different entry hash means a newer deploy", () => {
    expect(isStale("/assets/index-AAA.js", "/assets/index-BBB.js")).toBe(true);
  });
  it("the same file is the same build, whatever the path in front of it", () => {
    expect(isStale("/assets/index-AAA.js", "https://app.bescrm.net/assets/index-AAA.js")).toBe(false);
  });
  it("an unreadable answer is never treated as an update", () => {
    expect(isStale("/assets/index-AAA.js", null)).toBe(false);
    expect(isStale(null, "/assets/index-BBB.js")).toBe(false);
  });
});

describe("reading what the server serves", () => {
  const html = `<!doctype html><script type="module" crossorigin src="/assets/index-Bd0ui_AX.js"></script>`;
  it("finds the entry script in index.html", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, text: async () => html });
    await expect(deployedEntry(fetcher as unknown as typeof fetch)).resolves.toBe("/assets/index-Bd0ui_AX.js");
    expect(fetcher).toHaveBeenCalledWith("/", expect.objectContaining({ cache: "no-store" }));
  });
  it("says nothing when the network refuses — offline is not a new version", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(deployedEntry(fetcher as unknown as typeof fetch)).resolves.toBeNull();
  });
  it("says nothing on a non-OK response", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, text: async () => "" });
    await expect(deployedEntry(fetcher as unknown as typeof fetch)).resolves.toBeNull();
  });
});
