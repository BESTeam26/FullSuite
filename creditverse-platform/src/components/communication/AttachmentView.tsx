/**
 * An attachment, shown as what it is.
 *
 * Dee, 2026-09-17: "I want Images to be an actual image view and not just with
 * name and attachment."
 *
 * Every attachment used to render as the same grey row with a paperclip and a
 * filename, so a screenshot — which is the single most common thing anybody
 * pastes into a chat — arrived as `Screenshot 2026-09-17 at 3.05.42 PM.png`
 * and you had to open it in a new tab to find out whether it was the right
 * one.
 *
 * ── THE URL IS SIGNED AND SHORT-LIVED ─────────────────────────────────────
 *
 * The bucket is private. Rendering an image means asking storage for a signed
 * URL, which expires — so the preview is fetched when the message comes into
 * view and refreshed before it lapses, rather than a permanent link sitting in
 * the DOM. A thumbnail is not a reason to make a file public.
 *
 * ── AND IT STAYS A LINK ───────────────────────────────────────────────────
 *
 * Clicking the preview opens the full image the same way the row always did.
 * Somebody who needs the original still gets it; they just do not have to
 * guess first.
 */
import { useEffect, useRef, useState } from "react";
import { Download, ImageOff, Paperclip } from "lucide-react";
import { signedAttachmentUrl, type Attachment } from "@/lib/data/messages";
import { cn } from "@/lib/utils";

/** How long a signed URL lasts, and when to renew it. */
const URL_SECONDS = 600;
const RENEW_AFTER_MS = (URL_SECONDS - 60) * 1000;

/** Rendered inline. Anything else stays a row you can download. */
const isImage = (mime: string | null, name: string): boolean => {
  if (mime?.startsWith("image/")) return true;
  /* A file uploaded without a type still looks like what it is called. */
  return /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(name);
};

const isAnimated = (mime: string | null, name: string): boolean =>
  mime === "image/gif" || /\.gif$/i.test(name) || mime === "image/webp";

export function AttachmentView({ attachment }: { attachment: Attachment }) {
  const image = isImage(attachment.mime, attachment.name);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  /* Only an image needs a URL up front. A document gets one when it is asked
     for, which is what the row has always done. */
  useEffect(() => {
    if (!image) return;
    let alive = true;
    const load = async () => {
      try {
        const next = await signedAttachmentUrl(attachment.path, URL_SECONDS);
        if (!alive) return;
        setUrl(next);
        /* Renewed a minute before it lapses, so a conversation left open does
           not quietly fill with broken images. */
        timer.current = window.setTimeout(load, RENEW_AFTER_MS);
      } catch {
        if (alive) setFailed(true);
      }
    };
    void load();
    return () => { alive = false; window.clearTimeout(timer.current); };
  }, [image, attachment.path]);

  const open = async () => {
    setBusy(true); setError(null);
    try {
      const href = await signedAttachmentUrl(attachment.path);
      window.open(href, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const kb = attachment.size ? Math.max(1, Math.round(attachment.size / 1024)) : null;

  if (image && !failed) {
    return (
      <figure className="mt-1.5">
        <button
          type="button"
          onClick={() => void open()}
          className="group block overflow-hidden rounded-xl border border-border bg-muted/40 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {url ? (
            <img
              src={url}
              alt={attachment.name}
              onError={() => setFailed(true)}
              /* Capped so a tall screenshot does not push the conversation off
                 the screen, and `contain` so nothing is cropped away. */
              className="max-h-80 max-w-sm object-contain"
              loading="lazy"
            />
          ) : (
            <span className="flex h-40 w-64 items-center justify-center text-xs text-muted-foreground">
              Loading…
            </span>
          )}
        </button>
        <figcaption className="mt-0.5 flex items-center gap-1.5 px-0.5 text-[10px] text-muted-foreground">
          {isAnimated(attachment.mime, attachment.name) && (
            <span className="rounded border border-border bg-card px-1 font-bold uppercase tracking-wider">
              GIF
            </span>
          )}
          <span className="min-w-0 truncate">{attachment.name}</span>
          {kb && <span className="shrink-0">· {kb} KB</span>}
        </figcaption>
      </figure>
    );
  }

  return (
    <>
      <button type="button" onClick={() => void open()} disabled={busy}
        className={cn(
          "flex w-full max-w-sm items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-left text-xs transition-colors",
          "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60",
        )}>
        {failed
          ? <ImageOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          : <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 flex-1 truncate text-foreground">{attachment.name}</span>
        {kb && <span className="shrink-0 text-[10px] text-muted-foreground">{kb} KB</span>}
        <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
      {error && <p role="alert" className="text-[11px] text-status-danger">{error}</p>}
    </>
  );
}
