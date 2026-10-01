/**
 * Looking at an attachment without leaving the conversation.
 *
 * Dee, 2026-09-17: "preview of the image on the app so it wont open another
 * tab just to view the image." Dee, 2026-10-01: the same for everything
 * else — "view those html in correct format … previews on messages."
 *
 * Opening a new tab loses your place and hands somebody a bare storage URL
 * with no way back. Worse, the storage service deliberately serves an HTML
 * file as plain text, so "open in a tab" showed a web page as its source.
 * This shows the file over the app, by what it is (attachment-kind.ts):
 *
 *   image           the picture, as before
 *   pdf             the browser's own PDF reader, inline
 *   html            the page, rendered in a SANDBOXED frame: no scripts, no
 *                   access to this app, no forms — a mock-up looks like a
 *                   mock-up and cannot act like a program
 *   text            the text, monospaced (notes, CSV, JSON, logs)
 *   video / audio   the browser's player
 *   anything else   a plain statement that there is no preview, and Download
 *
 * Download is one click on every kind, through a signed URL that asks the
 * browser to save rather than display. Closes on Escape, on a click outside,
 * or on the button — three ways out, because an overlay you cannot dismiss is
 * worse than a new tab.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2, X } from "lucide-react";
import { attachmentKind, formatBytes } from "@/lib/communication/attachment-kind";
import type { Attachment } from "@/lib/data/messages";
import { downloadAttachment } from "@/components/communication/attachment-download";

export function AttachmentViewer({ attachment, url, onClose }: {
  attachment: Attachment;
  /** A signed URL that is already known to be live. */
  url: string;
  onClose: () => void;
}) {
  const kind = attachmentKind(attachment.mime, attachment.name);
  const [body, setBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    /* The page behind must not scroll while a full-screen file is over it. */
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  /* HTML and text are fetched as text and rendered here, because the storage
     service will not serve HTML as HTML. The frame gets the document, never a
     URL into the app. */
  useEffect(() => {
    if (kind !== "html" && kind !== "text") return;
    let alive = true;
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`Could not load the file (${r.status}).`))))
      .then((text) => { if (alive) setBody(text); })
      .catch((e: Error) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [kind, url]);

  const save = async () => {
    setSaving(true); setError(null);
    try { await downloadAttachment(attachment); }
    catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const size = formatBytes(attachment.size);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const content = (() => {
    if (error) return <p role="alert" className="text-sm text-white">{error}</p>;
    switch (kind) {
      case "image":
        return <img src={url} alt={attachment.name} onClick={stop} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />;
      case "pdf":
        return <iframe title={attachment.name} src={url} onClick={stop} className="h-full w-full max-w-5xl rounded-lg bg-white shadow-2xl" />;
      case "html":
        return body === null
          ? <Loader2 className="h-6 w-6 animate-spin text-white/70" aria-label="Loading" />
          : <iframe title={attachment.name} srcDoc={body} sandbox="" onClick={stop}
              className="h-full w-full max-w-6xl rounded-lg bg-white shadow-2xl" />;
      case "text":
        return body === null
          ? <Loader2 className="h-6 w-6 animate-spin text-white/70" aria-label="Loading" />
          : <pre onClick={stop} className="h-full w-full max-w-4xl overflow-auto whitespace-pre-wrap rounded-lg bg-white p-4 text-xs text-foreground shadow-2xl">{body}</pre>;
      case "video":
        return <video src={url} controls autoPlay onClick={stop} className="max-h-full max-w-full rounded-lg shadow-2xl" />;
      case "audio":
        return <audio src={url} controls autoPlay onClick={stop} className="w-full max-w-md" />;
      default:
        return (
          <div onClick={stop} className="rounded-2xl bg-white px-6 py-5 text-center shadow-2xl">
            <p className="text-sm font-semibold text-foreground">No preview for this type of file.</p>
            <p className="mt-1 text-xs text-muted-foreground">Download it to open it in the program that made it.</p>
            <button type="button" onClick={() => void save()} disabled={saving}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
              <Download className="h-3.5 w-3.5" aria-hidden /> Download
            </button>
          </div>
        );
    }
  })();

  /* A portal, so the overlay is not clipped by a scrolling conversation
     column or trapped under a panel's stacking context. */
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={attachment.name} onClick={onClose}
      className="fixed inset-0 z-[100] flex flex-col bg-black/80 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <p className="min-w-0 truncate text-sm font-semibold">
          {attachment.name}
          {size && <span className="ml-2 font-normal text-white/60">{size}</span>}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={(e) => { e.stopPropagation(); void save(); }} disabled={saving}
            aria-label={`Download ${attachment.name}`}
            className="rounded-lg p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          </button>
          <button type="button" onClick={onClose} aria-label="Close"
            className="rounded-lg p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center p-4 pt-0">{content}</div>

      <p className="pb-3 text-center text-[11px] text-white/50">Press Escape or click outside to close</p>
    </div>,
    document.body,
  );
}
