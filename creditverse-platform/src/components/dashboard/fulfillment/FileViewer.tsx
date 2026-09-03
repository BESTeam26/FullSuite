/**
 * FileViewer — in-app file preview / lightbox.
 *
 * Renders images as a zoomable, pannable lightbox with next/prev navigation,
 * and PDFs in an embedded in-app viewer (no download required). Other file
 * types show a clear file card with an Open/Download action.
 *
 * Sized for real document review. This app is document-heavy — credit reports,
 * agreements, bureau responses — so the preview gives the document the whole
 * viewport and keeps its own chrome to a single slim bar. Two details matter:
 *
 *  - The PDF is NOT capped to a narrow column. A narrow frame makes the
 *    browser's built-in viewer pick a tiny "fit page" zoom (53% on a laptop),
 *    which is unreadable and cannot be widened from inside the frame.
 *  - `#view=FitH` asks that viewer to fit the page WIDTH instead, so text opens
 *    at a readable size and the user scrolls down rather than squinting.
 *
 * Kept dependency-free: images use native <img> + CSS transform; PDFs use
 * <iframe> pointing at the blob URL (works for local object URLs and remote).
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Download,
  FileText,
  Maximize2,
  Minimize2,
} from "lucide-react";
import {
  isImageFile,
  isPdfFile,
  type AttachmentFile,
} from "@/lib/fulfillment/attachment-domain";
import { cn } from "@/lib/utils";

interface Props {
  files: AttachmentFile[];
  startIndex: number;
  onClose: () => void;
}

/**
 * A comfortable reading column for a portrait page on a wide monitor. Wider
 * than this and a letter-size page stretches past what the eye tracks well;
 * "Full width" lifts the cap for side-by-side or landscape documents.
 */
const READING_MAX_WIDTH = 1400;

/**
 * Ask the browser's PDF viewer to fit the page width and hide its sidebar, so
 * the document opens readable instead of at a fit-page zoom.
 */
const pdfSrc = (url: string) =>
  `${url}${url.includes("#") ? "&" : "#"}view=FitH&navpanes=0`;

export function FileViewer({ files, startIndex, onClose }: Props) {
  const [index, setIndex] = useState(startIndex);
  const [zoom, setZoom] = useState(1);
  const [fullWidth, setFullWidth] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const file = files[index];

  const isImage = isImageFile(file);
  const isPdf = isPdfFile(file);

  const goPrev = useCallback(() => {
    setZoom(1);
    setIndex((i) => (i - 1 + files.length) % files.length);
  }, [files.length]);

  const goNext = useCallback(() => {
    setZoom(1);
    setIndex((i) => (i + 1) % files.length);
  }, [files.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext, onClose]);

  // A zoomed image should start centred rather than pinned to the top-left.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [zoom, index]);

  if (!file) return null;

  const iconButton =
    "rounded-lg p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white";

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/85 backdrop-blur-sm">
      {/* Chrome is one slim bar — every other pixel belongs to the document. */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-2 text-white">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-tight">
            {file.name}
          </p>
          <p className="truncate text-[11px] leading-tight text-white/60">
            {file.uploadedBy} · {file.uploadedAt} · {file.category} ·{" "}
            {file.size}
            {files.length > 1 && ` · ${index + 1} of ${files.length}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isImage && (
            <>
              <button
                onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
                className={iconButton}
                title="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="w-11 text-center text-[11px] tabular-nums text-white/70">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(6, z + 0.25))}
                className={iconButton}
                title="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            </>
          )}
          {isPdf && (
            <button
              onClick={() => setFullWidth((f) => !f)}
              className={iconButton}
              title={
                fullWidth
                  ? "Reading width"
                  : "Full width (use the whole screen)"
              }
            >
              {fullWidth ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </button>
          )}
          <a
            href={file.url}
            download={file.name}
            className={iconButton}
            title="Download"
          >
            <Download className="h-4 w-4" />
          </a>
          <button onClick={onClose} className={iconButton} title="Close (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body. min-h-0 lets the document actually consume the remaining height
          instead of overflowing a flex parent that refuses to shrink. */}
      <div
        className={cn(
          "relative flex min-h-0 flex-1 items-stretch justify-center py-2",
          // Arrows sit in a gutter beside the page, never on top of it.
          files.length > 1 ? "px-14" : "px-3",
        )}
      >
        {files.length > 1 && (
          <button
            onClick={goPrev}
            className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/20"
            title="Previous (←)"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        {isImage ? (
          <div
            ref={scrollRef}
            className={cn(
              "flex h-full w-full items-center justify-center",
              zoom > 1 ? "overflow-auto" : "overflow-hidden",
            )}
          >
            <img
              src={file.url}
              alt={file.name}
              style={{ transform: `scale(${zoom})` }}
              className="max-h-full max-w-full flex-none object-contain transition-transform duration-150"
            />
          </div>
        ) : isPdf ? (
          <iframe
            src={pdfSrc(file.url)}
            title={file.name}
            className="h-full w-full rounded-lg border-0 bg-white shadow-2xl"
            style={
              fullWidth ? undefined : { maxWidth: `${READING_MAX_WIDTH}px` }
            }
          />
        ) : (
          <div className="my-auto flex flex-col items-center gap-4 self-center rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-white">
            <FileText className="h-16 w-16 text-white/50" />
            <div>
              <p className="text-sm font-bold">{file.name}</p>
              <p className="text-xs text-white/60">
                {file.size} · {file.type || "Unknown type"}
              </p>
            </div>
            <a
              href={file.url}
              download={file.name}
              className="rounded-lg bg-white px-4 py-2 text-xs font-bold text-black transition-colors hover:bg-white/90"
            >
              Open / Download
            </a>
          </div>
        )}

        {files.length > 1 && (
          <button
            onClick={goNext}
            className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/20"
            title="Next (→)"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}
