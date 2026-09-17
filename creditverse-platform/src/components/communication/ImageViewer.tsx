/**
 * Looking at an image without leaving the conversation.
 *
 * Dee, 2026-09-17: "preview of the image on the app so it wont open another
 * tab just to view the image."
 *
 * Opening a new tab loses your place, loses the conversation, and hands
 * somebody a bare storage URL with no way back. This shows it over the app and
 * closes on Escape, on a click outside, or on the button — three ways out,
 * because an overlay you cannot dismiss is worse than a new tab.
 *
 * Download is still there for anybody who actually wants the file.
 */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";

export function ImageViewer({ url, name, onClose }: {
  url: string;
  name: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    /* The page behind must not scroll while a full-screen image is over it. */
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  /* A portal, so the overlay is not clipped by a scrolling conversation
     column or trapped under a panel's stacking context. */
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={name}
      onClick={onClose}
      className="fixed inset-0 z-[100] flex flex-col bg-black/80 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <p className="min-w-0 truncate text-sm font-semibold">{name}</p>
        <div className="flex shrink-0 items-center gap-1">
          <a
            href={url}
            download={name}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Download ${name}`}
            className="rounded-lg p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Download className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center p-4 pt-0">
        <img
          src={url}
          alt={name}
          /* Stops a click on the picture itself from closing it — people zoom
             in by leaning toward the screen and clicking, and losing it then
             is infuriating. */
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
        />
      </div>

      <p className="pb-3 text-center text-[11px] text-white/50">
        Press Escape or click outside to close
      </p>
    </div>,
    document.body,
  );
}
