/**
 * INP probe for FullSuite — run IN THE BROWSER, on the live app, signed in.
 *
 * Dee, 2026-09-30: "normal click INP under 200 ms, preferably under 100 ms
 * for common navigation." Paste this file into the console on /app/creditops,
 * then click, by hand or through the browser tool, in this order:
 *   Main Client List · Dispute Queue · Support Queue · a Partner folder ·
 *   a client row.
 * Then run `window.__inpReport()`.
 *
 * Only REAL input counts: a synthetic element.click() has no interaction id
 * and is invisible to the Event Timing API, which is why this cannot be a
 * Node test. Measure as an agent account as well as the owner.
 */
window.__inp = [];
new PerformanceObserver((list) => {
  for (const e of list.getEntries()) {
    if (!e.interactionId || e.name !== "click") continue;
    window.__inp.push({
      at: Math.round(e.startTime),
      toNextPaintMs: Math.round(e.duration),
      handlerMs: Math.round(e.processingEnd - e.processingStart),
      target: (e.target && (e.target.textContent || e.target.className) || "").toString().trim().slice(0, 40),
    });
  }
}).observe({ type: "event", durationThreshold: 16, buffered: false });

window.__inpReport = () => {
  const seen = new Set();
  const rows = window.__inp.filter((e) => { const k = e.at; if (seen.has(k)) return false; seen.add(k); return true; });
  const worst = Math.max(0, ...rows.map((r) => r.toNextPaintMs));
  console.table(rows.map((r) => ({ ...r, verdict: r.toNextPaintMs <= 100 ? "ok (<100)" : r.toNextPaintMs <= 200 ? "ok (<200)" : "OVER 200 ms" })));
  console.log(`worst click → next paint: ${worst} ms — target 200 ms, preferably 100 ms; DOM rows now: ${document.querySelectorAll("table tbody tr").length}`);
  return rows;
};
console.log("INP probe armed. Click: Main Client List · Dispute Queue · Support Queue · a Partner · a client row, then window.__inpReport().");
