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
    /* The first page is read alone; the exactly-full second page is not
       trusted, so a third request (offset 2000) is made and comes back empty. */
    expect(calls[0]).toBe(0);
    expect(calls).toContain(1000);
    expect(calls).toContain(2000);
  });

  it("reads the pages after the first together, not one after another", async () => {
    let inFlight = 0, peak = 0;
    const rows = await pageAll(async (o, l) => {
      inFlight++; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return source.slice(o, o + l);
    });
    expect(rows.length).toBe(1472);
    /* 1,472 rows: page 0 alone, then pages 1–3 in flight at once. */
    expect(peak).toBeGreaterThan(1);
  });

  it("stops loudly rather than looping forever", async () => {
    await expect(pageAll(async (_o, l) => Array.from({ length: l }, () => 0), 10, 3)).rejects.toThrow(/Refused/);
  });
});
