import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ROUTE_CHUNKS,
  chunkFor,
  chunkKeyFor,
  isWarmed,
  prefetchRoute,
  resetWarmed,
} from "./route-chunks";

beforeEach(resetWarmed);

describe("chunkKeyFor", () => {
  it("matches a plain path", () => {
    expect(chunkKeyFor("/app/settings")).toBe("/app/settings");
  });

  it("ignores the query string, which never changes which module loads", () => {
    expect(chunkKeyFor("/app/funding-deals?view=funded")).toBe("/app/funding-deals");
    expect(chunkKeyFor("/app/funding-deals?view=renewals")).toBe("/app/funding-deals");
  });

  it("ignores a hash", () => {
    expect(chunkKeyFor("/app/reporting#top")).toBe("/app/reporting");
  });

  it("ignores a trailing slash", () => {
    expect(chunkKeyFor("/app/people/")).toBe("/app/people");
  });

  it("resolves a record URL to its parameterised screen", () => {
    expect(chunkKeyFor("/app/clients/8f2a-1")).toBe("/app/clients/:id");
    expect(chunkKeyFor("/app/creditops/cases/abc")).toBe("/app/creditops/cases/:id");
    expect(chunkKeyFor("/app/bes-partners/xyz")).toBe("/app/bes-partners/:id");
    expect(chunkKeyFor("/app/funding-deals/d-1")).toBe("/app/funding-deals/:dealId");
  });

  it("prefers the exact route over the parameterised one", () => {
    // /app/clients is a screen in its own right, not the :id screen.
    expect(chunkKeyFor("/app/clients")).toBe("/app/clients");
  });

  it("returns null for a path with no registered chunk", () => {
    expect(chunkKeyFor("/app/not-a-screen")).toBeNull();
    expect(chunkKeyFor("/login")).toBeNull();
  });

  it("does not invent a match two segments deep", () => {
    expect(chunkKeyFor("/app/clients/abc/notes")).toBeNull();
  });
});

describe("chunkFor", () => {
  it("returns a loader for a registered route", () => {
    expect(typeof chunkFor("/app/settings")).toBe("function");
  });

  it("throws for an unregistered route, so a typo fails loudly", () => {
    expect(() => chunkFor("/app/nope")).toThrow(/No route chunk registered/);
  });
});

describe("prefetchRoute", () => {
  it("warms a route once", () => {
    expect(isWarmed("/app/settings")).toBe(false);
    prefetchRoute("/app/settings");
    expect(isWarmed("/app/settings")).toBe(true);
  });

  it("treats query variants as the same chunk", () => {
    prefetchRoute("/app/funding-deals?view=offers");
    expect(isWarmed("/app/funding-deals")).toBe(true);
    expect(isWarmed("/app/funding-deals?view=funded")).toBe(true);
  });

  it("is silent about a path it does not know", () => {
    expect(() => prefetchRoute("/app/not-a-screen")).not.toThrow();
    expect(isWarmed("/app/not-a-screen")).toBe(false);
  });
});

/**
 * The rule, not the example: walk the menu the product actually renders.
 *
 * A menu item added later is covered the moment it exists — which is the only
 * way this stays true. A tab with no registered chunk still works; it just
 * silently loses its prefetch, and that is exactly the kind of quiet decay
 * that a hand-written list would never catch.
 */
describe("every menu tab has a chunk", () => {
  const sidebar = readFileSync(
    resolve(__dirname, "../../components/dashboard/Sidebar.tsx"),
    "utf8",
  );
  const hrefs = [
    ...new Set(
      [...sidebar.matchAll(/href:\s*"(\/app[^"]*)"/g)].map((m) => m[1]),
    ),
  ];

  it("finds the menu in the source", () => {
    expect(hrefs.length).toBeGreaterThan(30);
  });

  it.each(hrefs)("%s resolves to a chunk", (href) => {
    expect(chunkKeyFor(href)).not.toBeNull();
  });
});

describe("the registry itself", () => {
  it("registers every path exactly once", () => {
    const keys = Object.keys(ROUTE_CHUNKS);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("uses absolute /app paths", () => {
    for (const key of Object.keys(ROUTE_CHUNKS)) {
      expect(key.startsWith("/app")).toBe(true);
    }
  });
});
