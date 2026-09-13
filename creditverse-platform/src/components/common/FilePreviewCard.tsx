/**
 * A document you can SEE without opening it.
 *
 * Dee, 2026-09-13: "I want all documents as preview and not just names. I
 * wanna see exactly what that document w/o clicking the file."
 *
 * A list of `Screenshot 2026-09-08 at 3.42.02 AM.png` five times over tells
 * nobody which one is the dispute letter and which is the bureau reply. The
 * filename is the worst available description of a screenshot, and screenshots
 * are most of what BES files.
 *
 * ── WHAT RENDERS, AND WHAT DOES NOT ─────────────────────────────────────────
 *
 * Images render as themselves. PDFs render their first page in a sandboxed,
 * non-interactive frame — no library, and the browser already knows how. Text
 * files show their first lines. Anything else keeps an icon, honestly: a
 * generic thumbnail that looked like a preview would be worse than none.
 *
 * The frame is `sandbox`-ed and pointer-events are off, so a stored document
 * cannot script anything or steal a click meant for the card.
 */
import { useEffect, useState } from "react";
import { FileSpreadsheet, FileText, FileType2, ImageIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { previewKindOf, sizeLabel } from "@/lib/data/use-file-previews";

const ICON: Record<string, typeof FileText> = {
  image: ImageIcon, pdf: FileType2, text: FileText, other: FileSpreadsheet,
};

export interface PreviewFile {
  id: string;
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
  caption?: string | null;
}

/** The first lines of a text file, fetched only when one is actually shown. */
function TextPeek({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch(url)
      .then((r) => r.text())
      .then((t) => { if (live) setText(t.slice(0, 800)); })
      .catch(() => { if (live) setText(null); });
    return () => { live = false; };
  }, [url]);
  if (text === null) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  return (
    <pre className="h-full w-full overflow-hidden whitespace-pre-wrap p-2 text-left text-[9px] leading-tight text-muted-foreground">
      {text}
    </pre>
  );
}

export function FilePreviewCard({
  file,
  url,
  onOpen,
  actions,
}: {
  file: PreviewFile;
  /** Signed URL, or undefined while it is being fetched or if signing failed. */
  url: string | undefined;
  onOpen: () => void;
  actions?: React.ReactNode;
}) {
  const kind = previewKindOf(file.name, file.mimeType);
  const Icon = ICON[kind] ?? FileText;
  const [broken, setBroken] = useState(false);

  return (
    <li className="overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40">
      <button
        type="button"
        onClick={onOpen}
        title={file.name}
        className="block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="flex h-36 w-full items-center justify-center overflow-hidden border-b border-border bg-muted/40">
          {!url || broken ? (
            <Icon className="h-8 w-8 text-muted-foreground" />
          ) : kind === "image" ? (
            <img
              src={url}
              alt={file.name}
              loading="lazy"
              onError={() => setBroken(true)}
              className="h-full w-full object-cover"
            />
          ) : kind === "pdf" ? (
            /* The browser's own renderer. Sandboxed with no allowances, and
               pointer-events off so the page beneath still owns the click. */
            <iframe
              src={`${url}#toolbar=0&navpanes=0&view=FitH`}
              title={file.name}
              sandbox=""
              loading="lazy"
              className="pointer-events-none h-full w-full border-0 bg-white"
            />
          ) : kind === "text" ? (
            <TextPeek url={url} />
          ) : (
            <Icon className="h-8 w-8 text-muted-foreground" />
          )}
        </span>
        <span className="block px-2.5 py-2 text-left">
          <span className="block truncate text-xs font-medium text-foreground">{file.name}</span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {[file.caption, sizeLabel(file.sizeBytes)].filter(Boolean).join(" · ")}
          </span>
        </span>
      </button>
      {actions && <div className="border-t border-border px-2.5 py-1.5">{actions}</div>}
    </li>
  );
}

/** The grid these sit in, so every document surface spaces them the same way. */
export function FilePreviewGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <ul className={cn("grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", className)}>
      {children}
    </ul>
  );
}
