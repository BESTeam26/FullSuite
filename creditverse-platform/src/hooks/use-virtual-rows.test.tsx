/**
 * The bounded-render primitive finds the element that actually scrolls.
 *
 * In the app shell the document never scrolls: DashboardLayout's <main>
 * does, and CreditOps / FundingOps scroll an inner pane. A virtualizer
 * pointed at the wrong element never advances past its first screen, so a
 * reader who scrolls sees blank space. These pin the discovery order.
 */
import { describe, expect, it } from "vitest";
import { findScrollParent } from "./use-virtual-rows";

function tree(html: string) {
  document.body.innerHTML = html;
  return document.getElementById("list") as HTMLElement;
}

describe("findScrollParent", () => {
  it("prefers the nearest ancestor marked data-scroll-region", () => {
    const list = tree(`<main data-scroll-region id="main"><div data-scroll-region id="pane"><table id="list"></table></div></main>`);
    expect(findScrollParent(list)?.id).toBe("pane");
  });
  it("otherwise takes the nearest ancestor that scrolls vertically", () => {
    const list = tree(`<div id="outer" style="overflow-y:auto"><div id="inner" style="overflow-y:scroll"><ul id="list"></ul></div></div>`);
    expect(findScrollParent(list)?.id).toBe("inner");
  });
  it("falls back to the document when nothing above scrolls (the Partner Portal)", () => {
    const list = tree(`<div><table id="list"></table></div>`);
    // jsdom has no scrollingElement; a browser answers <html>. Either way it is not an ancestor div.
    expect(findScrollParent(list)).toBe(document.scrollingElement ?? null);
  });
  it("answers null for a list that is not mounted yet", () => {
    expect(findScrollParent(null)).toBeNull();
  });
});
