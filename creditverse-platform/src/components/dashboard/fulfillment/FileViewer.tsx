/**
 * FileViewer — in-app file preview / lightbox.
 *
 * Renders images as a zoomable lightbox with next/prev navigation, and PDFs
 * in an embedded in-app viewer (no download required). Other file types show
 * a clear file card with an Open/Download action.
 *
 * Kept dependency-free: images use native <img> + CSS zoom; PDFs use <iframe>
 * pointing at the blob URL (works for local object URLs and remote URLs).
 */

import { useEffect, useState, useCallback } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Download,
  FileText,
} from "lucide-react";
import {
  isImageFile,
  isPdfFile,
  type AttachmentFile,
} from "@/lib/fulfillment/attachment-domain";

interface Props {
  files: AttachmentFile[];
  startIndex: number;
  onClose: () => void;
}

export function FileViewer({ files, startIndex, onClose }: Props) {
  const [index, setIndex] = useState(startIndex);
  const [zoom, setZoom] = useState(1);

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

  if (!file) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/80 backdrop-blur-sm">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-white">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{file.name}</p>
          <p className="text-[11px] text-white/60">
            {file.uploadedBy} · {file.uploadedAt} · {file.category} ·{" "}
            {file.size}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {isImage && (
            <>
              <button
                onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
                className="rounded-lg p-2 text-white/80 hover:bg-white/10"
                title="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="w-10 text-center text-[11px] tabular-nums text-white/70">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
                className="rounded-lg p-2 text-white/80 hover:bg-white/10"
                title="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            </>
          )}
          <a
            href={file.url}
            download={file.name}
            className="rounded-lg p-2 text-white/80 hover:bg-white/10"
            title="Download"
          >
            <Download className="h-4 w-4" />
          </a>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-white/80 hover:bg-white/10"
            title="Close (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4">
        {files.length > 1 && (
          <button
            onClick={goPrev}
            className="absolute left-3 z-10 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20"
            title="Previous (←)"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        {isImage ? (
          <img
            src={file.url}
            alt={file.name}
            style={{ transform: `scale(${zoom})` }}
            className="max-h-full max-w-full object-contain transition-transform duration-150"
          />
        ) : isPdf ? (
          <iframe
            src={file.url}
            title={file.name}
            className="h-full w-full max-w-4xl rounded-lg bg-white"
          />
        ) : (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-white">
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
              className="rounded-lg bg-white px-4 py-2 text-xs font-bold text-black hover:bg-white/90"
            >
              Open / Download
            </a>
          </div>
        )}

        {files.length > 1 && (
          <button
            onClick={goNext}
            className="absolute right-3 z-10 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20"
            title="Next (→)"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Counter */}
      {files.length > 1 && (
        <div className="border-t border-white/10 px-4 py-2 text-center text-[11px] text-white/60">
          {index + 1} of {files.length}
        </div>
      )}
    </div>
  );
}
