/**
 * Loading, failed and empty are three different answers. Say which.
 *
 * Dee, 2026-09-16: *"A failed API call must not render as '0 results' unless
 * zero is actually known. This is especially important because the
 * Partner-folder PostgREST bug previously rendered a backend error as empty
 * folders."*
 *
 * The shape that causes it is one line long and reads as harmless:
 *
 *   const rows = query.data ?? [];
 *   if (rows.length === 0) return <p>You&apos;re all caught up.</p>;
 *
 * `data` is undefined while the request is in flight AND after it fails, so a
 * partner whose actions could not be loaded is told they have none to do. The
 * empty state is a factual claim about their account; only make it once the
 * request has actually come back and said so.
 *
 * Pair with `hasRows` from `@/lib/ui/query-rows`:
 *
 *   {hasRows(q) ? <ul>…</ul> : <PanelState query={q} empty={…} />}
 */
import { AlertTriangle, Loader2 } from "lucide-react";
import type { QueryLike } from "@/lib/ui/query-rows";

/** The in-panel form: one line inside a card that already has its heading. */
export function PanelState({ query, empty }: { query: QueryLike; empty: React.ReactNode }) {
  if (query.isPending) {
    return (
      <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground" aria-live="polite">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" /> Loading…
      </p>
    );
  }
  if (query.isError) {
    return (
      <p className="flex items-start gap-2 py-2 text-sm text-foreground" role="status">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
        <span>
          This could not be loaded just now.
          <span className="block text-xs text-muted-foreground">
            It is a problem reaching BES, not a change to your account. Refresh to try again.
          </span>
        </span>
      </p>
    );
  }
  return <>{empty}</>;
}

/**
 * The whole-page counterpart, for a surface whose single query failed.
 *
 * Same distinction, same reason: a page that answers "No agreements yet" when
 * the request never came back is stating something about the partner's account
 * that nobody has established.
 */
export function PageLoadError({ what }: { what: string }) {
  return (
    <div className="rounded-xl border border-dashed border-amber-500/50 bg-amber-500/5 px-6 py-10 text-center" role="status">
      <AlertTriangle className="mx-auto mb-2 h-5 w-5 text-amber-600" aria-hidden="true" />
      <p className="text-sm font-semibold text-foreground">{what} could not be loaded</p>
      <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
        This is a problem reaching BES, not a change to your account. Refresh to try again — if it
        keeps happening, message BES and we will look at it.
      </p>
    </div>
  );
}
