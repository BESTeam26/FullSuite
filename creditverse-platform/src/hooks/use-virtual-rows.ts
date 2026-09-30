/**
 * useVirtualRows — the one bounded-render primitive for FullSuite lists.
 *
 * Dee's rule (2026-09-30, FULLSUITE_PERFORMANCE_RULE.md addendum): any list
 * expected to exceed a few hundred rows renders only what is visible plus a
 * small buffer; deep scroll stays accurate; filters, selection and row
 * heights keep working. This hook is how every such list does it, so the
 * scroll-container discovery, the size estimate and the jsdom fallbacks are
 * written once.
 *
 * Usage:
 *   const listRef = useRef<HTMLTableElement>(null);
 *   const virtual = useVirtualRows(rows.length, listRef);
 *   <table ref={listRef}><tbody>
 *     <VirtualSpacer height={virtual.paddingTop} as="tr" />
 *     {virtual.rows.map((row) => (
 *       <tr key={rows[row.index].id} data-index={row.index} ref={virtual.measureElement}>…</tr>
 *     ))}
 *     <VirtualSpacer height={virtual.paddingBottom} as="tr" />
 *   </tbody></table>
 */
import { useVirtualizer } from "@tanstack/react-virtual";
import type { RefObject } from "react";

/**
 * The element that scrolls this list. In the app shell that is never the
 * document: DashboardLayout's <main> scrolls, and CreditOps / FundingOps
 * scroll an inner pane. Nearest `data-scroll-region` wins; otherwise the
 * nearest ancestor that scrolls vertically; otherwise the document (the
 * Partner Portal, plain pages).
 */
export function findScrollParent(anchor: HTMLElement | null): HTMLElement | null {
  if (!anchor) return null;
  const marked = anchor.closest<HTMLElement>("[data-scroll-region]");
  if (marked) return marked;
  for (let node = anchor.parentElement; node; node = node.parentElement) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return (document.scrollingElement as HTMLElement | null) ?? null;
}

/** Distance from the top of the scroll content to the list's first row. */
function offsetWithinScrollParent(anchor: HTMLElement | null): number {
  if (!anchor) return 0;
  const scroller = findScrollParent(anchor);
  if (!scroller || scroller === document.scrollingElement) {
    return anchor.getBoundingClientRect().top + (window.scrollY || 0);
  }
  return anchor.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
}

export const DEFAULT_ROW_ESTIMATE_PX = 44;

export function useVirtualRows(
  count: number,
  anchor: RefObject<HTMLElement | null>,
  estimateSize: number = DEFAULT_ROW_ESTIMATE_PX,
) {
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => findScrollParent(anchor.current),
    estimateSize: () => estimateSize,
    overscan: 12,
    /* Before the pane has been measured (first paint, tests), assume one
       screen of rows rather than none; and a row that measures 0 (not laid
       out, jsdom) keeps its estimate rather than collapsing the list. */
    initialRect: { width: 1200, height: 800 },
    measureElement: (el) => el.getBoundingClientRect().height || estimateSize,
    scrollMargin: offsetWithinScrollParent(anchor.current),
  });
  const rows = virtualizer.getVirtualItems();
  const margin = virtualizer.options.scrollMargin;
  return {
    rows,
    paddingTop: rows.length > 0 ? rows[0].start - margin : 0,
    paddingBottom: rows.length > 0 ? virtualizer.getTotalSize() - (rows[rows.length - 1].end - margin) : 0,
    measureElement: virtualizer.measureElement,
  };
}
