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
 * ── AND IT OPENS IN THE APP ───────────────────────────────────────────────
 *
 * Clicking the preview opens it over the conversation, not in a new tab. Dee,
 * 2026-09-17: "preview of the image on the app so it wont open another tab
 * just to view the image." A tab loses your place and hands somebody a bare
 * storage URL with no way back. Download is still one click inside it.
 *
 * ── EVERY KIND, IN THE APP ────────────────────────────────────────────────
 *
 * Dee, 2026-10-01: a PDF, an HTML mock-up, a note, a clip — all open over the
 * conversation too (AttachmentViewer), and every attachment has a Download
 * beside it. A spreadsheet or a Word file, which the browser cannot show,
 * says so and downloads.
 */
import { useEffect, useRef, useState } from "react";
import { Download, FileText, ImageOff, Loader2 } from "lucide-react";
import { signedAttachmentUrl, type Attachment } from "@/lib/data/messages";
import { AttachmentViewer } from "@/components/communication/AttachmentViewer";
import { downloadAttachment } from "@/components/communication/attachment-download";
import { attachmentKind, canPreview, formatBytes } from "@/lib/communication/attachment-kind";
import { cn } from "@/lib/utils";

/** How long a signed URL lasts, and when to renew it. */
const URL_SECONDS = 600;
const RENEW_AFTER_MS = (URL_SECONDS - 60) * 1000;

/** Rendered inline. Anything else is a row that previews or downloads. */
const isImage = (mime: string | null, name: string): boolean => attachmentKind(mime, name) === "image";

const isAnimated = (mime: string | null, name: string): boolean =>
  mime === "image/gif" || /\.gif$/i.test(name) || mime === "image/webp";

export function AttachmentView({ attachment }: { attachment: Attachment }) {
  const image = isImage(attachment.mime, attachment.name);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [viewing, setViewing] = useState(false);
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

  const kind = attachmentKind(attachment.mime, attachment.name);

  /* A document gets its URL when it is asked for, and opens over the app. */
  const open = async () => {
    setBusy(true); setError(null);
    try {
      setUrl(await signedAttachmentUrl(attachment.path, URL_SECONDS));
      setViewing(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true); setError(null);
    try { await downloadAttachment(attachment); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const size = formatBytes(attachment.size);

  if (image && !failed) {
    return (
      <figure className="mt-1.5">
        {viewing && url && (
          <AttachmentViewer attachment={attachment} url={url} onClose={() => setViewing(false)} />
        )}
        <button
          type="button"
          /* In the app. The signed URL is already loaded for the preview, so
             opening it costs nothing and shows instantly. */
          onClick={() => url && setViewing(true)}
          className="group block overflow-hidden rounded-xl border border-border bg-muted/40 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {url ? (
            <img
              src={url}
              alt={attachment.name}
              onError={() => setFailed(true)}
              /* Capped so a tall screenshot does not push the conversation off
                 the screen, and `contain` so nothing is cropped away. */
              /* `max-w-full` first: 24rem is wider than a 360px phone column, and an
                 image that overflows drags the whole message list sideways. */
              className="max-h-80 w-auto max-w-full object-contain sm:max-w-sm"
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
          {size && <span className="shrink-0">· {size}</span>}
          <button type="button" onClick={() => void save()} disabled={busy} aria-label={`Download ${attachment.name}`}
            className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
            <Download className="h-3.5 w-3.5" aria-hidden />
          </button>
        </figcaption>
        {error && <p role="alert" className="text-[11px] text-status-danger">{error}</p>}
      </figure>
    );
  }

  const previewable = canPreview(kind) && !failed;
  return (
    <>
      {viewing && url && (
        <AttachmentViewer attachment={attachment} url={url} onClose={() => setViewing(false)} />
      )}
      <div className={cn(
        "flex w-full max-w-full items-center gap-1 rounded-lg border border-border bg-card pr-1 text-xs sm:max-w-sm",
      )}>
        <button type="button" onClick={() => void (previewable ? open() : save())} disabled={busy}
          aria-label={`${previewable ? "Open" : "Download"} ${attachment.name}`}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-l-lg px-2.5 py-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60">
          {failed
            ? <ImageOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            : busy ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
            : <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <span className="min-w-0 flex-1 truncate text-foreground">{attachment.name}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {size ? `${size} · ` : ""}{previewable ? "Preview" : "Download"}
          </span>
        </button>
        <button type="button" onClick={() => void save()} disabled={busy} aria-label={`Download ${attachment.name}`}
          className="shrink-0 rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60">
          <Download className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      {error && <p role="alert" className="text-[11px] text-status-danger">{error}</p>}
    </>
  );
}
