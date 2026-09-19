import { describe, expect, it } from "vitest";
import { pageAll } from "./page-all";

describe("reading past PostgREST's silent 1,000-row cap", () => {
  const source = Array.from({ length: 1472 }, (_, i) => i);
  const fetchPage = async (offset: number, limit: number) => source.slice(offset, offset + limit);

  it("keeps asking until a page comes back short, and returns everything", async () => {
    expect((await pageAll(fetchPage)).length).toBe(1472);
  });

  it("does not trust an exactly-full last page", async () => {
    const exact = Array.from({ length: 2000 }, (_, i) => i);
    const calls: number[] = [];
    const rows = await pageAll(async (o, l) => { calls.push(o); return exact.slice(o, o + l); });
    expect(rows.length).toBe(2000);
    expect(calls).toEqual([0, 1000, 2000]);
  });

  it("stops loudly rather than looping forever", async () => {
    await expect(pageAll(async (_o, l) => Array.from({ length: l }, () => 0), 10, 3)).rejects.toThrow(/Refused/);
  });
});
