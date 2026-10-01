/**
 * No blank pages.
 *
 * Found 2026-10-01: a team member searched, FullSuite navigated to CreditOps,
 * and the page went blank. Their tab had been open since before the day's
 * deploys; every deploy replaces the hashed chunks, so the first visit to a
 * page the tab had not loaded yet fetched a file that no longer existed —
 * and nothing caught the failure, so React unmounted everything.
 *
 * Two rules, both here:
 *   1. A chunk that fails to load is a stale build, not a bug: reload the
 *      page once at the same address (a flag in sessionStorage stops a loop).
 *   2. Anything else renders a readable notice with a way out — the shell
 *      around it stays — and is logged, never swallowed.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

const STALE_CHUNK = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk \S+ failed|Unable to preload CSS/i;
const RELOAD_FLAG = "fullsuite:reloaded-for-stale-chunk";

export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return STALE_CHUNK.test(message);
}

/**
 * Reload once for a stale build. Returns true when a reload was started so
 * the caller can stay quiet; false when this address already reloaded once
 * (then the failure is real and must be shown).
 */
export function reloadOnceForStaleChunk(storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = window.sessionStorage): boolean {
  const key = `${RELOAD_FLAG}:${window.location.pathname}`;
  try {
    if (storage.getItem(key)) { storage.removeItem(key); return false; }
    storage.setItem(key, String(Date.now()));
  } catch { /* private mode: still better to reload than to stay blank */ }
  window.location.reload();
  return true;
}

/** A stale build can also surface as Vite's preload event, before React sees it. */
export function listenForStaleChunks(target: Window = window): () => void {
  const onPreloadError = (event: Event) => {
    if (reloadOnceForStaleChunk()) event.preventDefault();
  };
  target.addEventListener("vite:preloadError", onPreloadError);
  return () => target.removeEventListener("vite:preloadError", onPreloadError);
}

interface Props { children: ReactNode; /** Where "Go back to safety" leads. */ homeHref?: string }
interface State { error: Error | null; reloading: boolean }

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null, reloading: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isStaleChunkError(error)) {
      if (reloadOnceForStaleChunk()) { this.setState({ reloading: true }); return; }
    }
    /* Logged with the component stack, so a production report has somewhere to start. */
    console.error("[FullSuite] page error", error, info.componentStack);
  }

  render() {
    const { error, reloading } = this.state;
    if (!error) return this.props.children;
    if (reloading) {
      return <p className="p-8 text-center text-sm text-muted-foreground">A newer version of FullSuite is loading…</p>;
    }
    return (
      <div role="alert" className="mx-auto my-10 max-w-lg rounded-2xl border border-border bg-card p-6 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-600" aria-hidden />
        <h2 className="mt-3 text-lg font-bold text-foreground">This page hit a problem</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Nothing you saved was lost. Reload to try again, or go back to Home. If it keeps happening, tell your team lead what you clicked.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => window.location.reload()}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <RotateCw className="h-4 w-4" aria-hidden /> Reload
          </button>
          <a href={this.props.homeHref ?? "/app"}
            className="inline-flex h-10 items-center rounded-lg border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Go to Home
          </a>
        </div>
        <p className="mt-3 break-words font-mono text-[11px] text-muted-foreground">{error.message}</p>
      </div>
    );
  }
}
