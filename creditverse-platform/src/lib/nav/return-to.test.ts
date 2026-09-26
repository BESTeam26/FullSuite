/**
 * Back has to land where you were, and must not be a way out of the app.
 *
 * Dee, 2026-09-26: "if I select a client and go back to client list, I wanna
 * make sure we go back to the actual list we're working on and not on the main
 * list or other list."
 */
import { describe, expect, it } from "vitest";
import { fromHere, returnTo } from "./return-to";

describe("the return address", () => {
  it("records the page being left, query string and all", () => {
    /* The query string is the part that matters here: it is where CreditOps
       now keeps WHICH list you are on, so dropping it would land you on the
       right page and the wrong list — the bug this exists to fix. */
    expect(fromHere({ pathname: "/app/creditops", search: "?partner=p1&view=main-list" }))
      .toEqual({ from: "/app/creditops?partner=p1&view=main-list" });
  });

  it("returns you to it", () => {
    expect(returnTo({ from: "/app/creditops?partner=p1&view=main-list" }, "/app/creditops"))
      .toBe("/app/creditops?partner=p1&view=main-list");
  });

  it("falls back when there is no address — a pasted link, or a new tab", () => {
    for (const state of [null, undefined, {}, { from: 42 }, { from: null }, "nonsense"]) {
      expect(returnTo(state, "/app/creditops")).toBe("/app/creditops");
    }
  });
});

describe("Back cannot be pointed out of the app", () => {
  /* Router state is ordinary client-side data — anything that can push a
     history entry can put a value here. A Back button that honours an
     arbitrary `from` is an open redirect wearing a back arrow. */
  it("refuses an absolute URL", () => {
    for (const evil of [
      "https://elsewhere.example/login",
      "http://elsewhere.example",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
    ]) {
      expect(returnTo({ from: evil }, "/app/creditops"), evil).toBe("/app/creditops");
    }
  });

  it("refuses a protocol-relative path, which is NOT a local path", () => {
    /* The trap: "//evil.example" starts with "/" and passes a naive check,
       but a browser reads it as https://evil.example. */
    expect(returnTo({ from: "//evil.example/phish" }, "/app/creditops")).toBe("/app/creditops");
    expect(returnTo({ from: "//" }, "/app/creditops")).toBe("/app/creditops");
  });

  it("still allows an ordinary in-app path", () => {
    expect(returnTo({ from: "/app/people/structure?tab=teams" }, "/x"))
      .toBe("/app/people/structure?tab=teams");
  });
});
