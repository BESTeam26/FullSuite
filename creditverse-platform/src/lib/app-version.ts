/**
 * Is the page running the version that is deployed?
 *
 * During the pilot the platform is deployed several times a day, and a tab
 * left open keeps running whatever it loaded that morning. Dee reported
 * reactions as broken twice after they were fixed, because her tab still held
 * the old code (P-042, 2026-09-21). Nothing in the app said so.
 *
 * The check needs no build-time plumbing: the page knows the hashed filename
 * of its OWN entry script, and index.html on the server names the current
 * one. Different hash, different deploy.
 *
 * Event-driven, never a loop (rule 22): the check runs when the tab is
 * brought back to the front, and at most once a minute. One request for a
 * ~2 KB HTML file; the cost of an out-of-date team is far higher.
 */

/** The entry script this page was loaded with, e.g. "/assets/index-Bd0ui_AX.js". */
function loadedEntry(): string | null {
  const scripts = [...document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')];
  const entry = scripts.map((s) => s.getAttribute("src") ?? "").find((src) => /\/assets\/index-[^/]+\.js$/.test(src));
  return entry ?? null;
}

const ENTRY_IN_HTML = /["']([^"']*\/assets\/index-[^"']+\.js)["']/;

/** The entry script the server is serving now, or null when it cannot be read. */
export async function deployedEntry(fetcher: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetcher("/", { cache: "no-store", headers: { accept: "text/html" } });
    if (!res.ok) return null;
    const html = await res.text();
    return ENTRY_IN_HTML.exec(html)?.[1] ?? null;
  } catch {
    /* Offline, or a network the browser refused: not an update, just silence. */
    return null;
  }
}

/**
 * True when the server is serving a different build from the one running.
 * Unknown on either side answers false — never nag on a failed check.
 */
export function isStale(loaded: string | null, deployed: string | null): boolean {
  if (!loaded || !deployed) return false;
  const file = (p: string) => p.split("/").pop() ?? p;
  return file(loaded) !== file(deployed);
}

export const MIN_CHECK_GAP_MS = 60_000;

/**
 * Calls `onStale` once the deployed build differs from this one. Returns the
 * unsubscribe. Checks on focus and on becoming visible again.
 */
export function watchForNewVersion(onStale: () => void, fetcher: typeof fetch = fetch): () => void {
  const loaded = loadedEntry();
  /* In dev there is no hashed entry, so there is nothing to compare and the
     banner can never appear — which is right; the dev server hot-reloads. */
  if (!loaded) return () => {};

  let last = Date.now();
  let stopped = false;

  const check = async () => {
    if (stopped || Date.now() - last < MIN_CHECK_GAP_MS) return;
    last = Date.now();
    if (isStale(loaded, await deployedEntry(fetcher))) onStale();
  };
  const onVisible = () => { if (document.visibilityState === "visible") void check(); };

  window.addEventListener("focus", onVisible);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    stopped = true;
    window.removeEventListener("focus", onVisible);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
