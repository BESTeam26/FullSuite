/**
 * The GIF picker, as Slack has one.
 *
 * Dee, 2026-09-17: "I want to have the capability to send GIF too just like in
 * Slack."
 *
 * A chosen GIF becomes an ordinary attachment — downloaded here, handed to the
 * composer as a File, uploaded to BES storage and rendered by the same code
 * that renders any other image. There is no second kind of message and no
 * hotlink to somebody else's CDN, which matters when conversations are kept
 * for seven years.
 *
 * ── NOT CONNECTED SAYS SO ─────────────────────────────────────────────────
 *
 * With no provider key the button is still there and explains itself, rather
 * than being hidden (so nobody knows the feature exists) or opening onto an
 * empty grid (which reads as "no GIFs match").
 *
 * ── NO REACT QUERY IN HERE, DELIBERATELY ──────────────────────────────────
 *
 * This lives inside `Composer`, which is presentational and is rendered in
 * tests without a QueryClient. A `useQuery` here makes the composer require a
 * provider — the same mistake that broke seven tests when saved-state hooks
 * went into `MessageRow`. Its own state, and a module-level note of whether
 * the key is set so opening the picker twice does not ask twice.
 */

/** Whether the provider key is set. Asked once per page load, not per open. */
let connectedCache: boolean | null = null;
import { useEffect, useRef, useState } from "react";
import { Loader2, Search, Sparkles, X } from "lucide-react";
import { gifAsFile, gifSearchConnected, searchGifs, type GifResult } from "@/lib/data/gifs";
import { cn } from "@/lib/utils";

export function GifPicker({ onPick, disabled }: {
  onPick: (file: File) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [connected, setConnected] = useState<boolean | null>(connectedCache);
  const [results, setResults] = useState<GifResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [taking, setTaking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  /* Asked once: whether the key is set does not change between two opens. */
  useEffect(() => {
    if (!open || connectedCache !== null) return;
    let alive = true;
    void gifSearchConnected()
      .then((yes) => { connectedCache = yes; if (alive) setConnected(yes); })
      .catch(() => { connectedCache = false; if (alive) setConnected(false); });
    return () => { alive = false; };
  }, [open]);

  /* One request per pause in typing, not one per letter. */
  useEffect(() => {
    if (!open || connected !== true) return;
    let alive = true;
    setLoading(true);
    const t = window.setTimeout(() => {
      void searchGifs(query)
        .then((found) => { if (alive) { setResults(found); setSearchError(null); } })
        .catch((e: Error) => { if (alive) setSearchError(e.message); })
        .finally(() => { if (alive) setLoading(false); });
    }, 350);
    return () => { alive = false; window.clearTimeout(t); };
  }, [open, connected, query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  });

  const pick = async (gif: GifResult) => {
    setTaking(gif.id); setError(null);
    try {
      onPick(await gifAsFile(gif));
      setOpen(false);
      setQuery("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That GIF could not be added.");
    } finally {
      setTaking(null);
    }
  };

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Add a GIF"
        title="Add a GIF"
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
      >
        <span className="flex h-4 items-center px-0.5 text-[10px] font-bold leading-none">GIF</span>
      </button>

      {open && (
        <div role="dialog" aria-label="Choose a GIF"
          className="absolute bottom-9 left-0 z-40 w-80 rounded-xl border border-border bg-popover p-2 shadow-lg">
          <div className="mb-2 flex items-center gap-1.5">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search GIFs"
                aria-label="Search GIFs"
                className="w-full rounded-lg border border-border bg-background py-1.5 pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </label>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {connected === null ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            </p>
          ) : connected !== true ? (
            <div className="px-2 py-6 text-center">
              <Sparkles className="mx-auto mb-1.5 h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-semibold text-foreground">GIF search is not connected yet</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                BES needs a Tenor API key set before this can search. You can still attach a GIF
                file with the paperclip — it will play in the conversation.
              </p>
            </div>
          ) : searchError ? (
            <p role="alert" className="px-2 py-6 text-center text-xs text-status-danger">{searchError}</p>
          ) : loading && results === null ? (
            <p className="py-8 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" /></p>
          ) : (results ?? []).length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              {query.trim() ? `Nothing matched “${query.trim()}”.` : "No GIFs came back."}
            </p>
          ) : (
            <ul className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto">
              {(results ?? []).map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    disabled={!!taking}
                    onClick={() => void pick(g)}
                    className={cn(
                      "group relative block w-full overflow-hidden rounded-lg border border-border bg-muted transition",
                      "hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      taking === g.id && "opacity-60",
                    )}
                  >
                    <img src={g.previewUrl} alt={g.description} loading="lazy"
                      className="h-24 w-full object-cover" />
                    {taking === g.id && (
                      <span className="absolute inset-0 flex items-center justify-center bg-background/60">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && <p role="alert" className="mt-1.5 text-[11px] text-status-danger">{error}</p>}
          {connected === true && (
            <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
              A GIF you pick is saved with the conversation, not linked to.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
