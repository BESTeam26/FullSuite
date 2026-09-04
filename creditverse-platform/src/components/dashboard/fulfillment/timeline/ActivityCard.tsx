/**
 * Activity entry card — renders a single timeline entry.
 * Human comments get rich formatting + attachments + pin/mark controls;
 * system events render as plain activity rows.
 */
import { User, FileText, Pin, PinOff } from "lucide-react";
import type {
  ActivityEntry,
  CommentMark,
} from "@/lib/fulfillment/creditops-client-store";
import { getMark } from "@/lib/fulfillment/creditops-client-store";
import { RichComment } from "./RichComment";
import { NoteContent } from "@/components/composer/NoteContent";
import {
  formatBytes,
  isImageAttachment,
  isPdfAttachment,
} from "@/lib/data/activity-attachments";
import type { TimelineAttachment } from "@/lib/data/use-activity-attachments";
import { isNoteDoc } from "@/lib/activity/note-body";
import { MarkMenu } from "./MarkMenu";
import { cn } from "@/lib/utils";
import { VisibilityBadge } from "@/components/dashboard/fulfillment/VisibilityControls";
import {
  isImageFile,
  isPdfFile,
  type CommentAttachment,
} from "@/lib/fulfillment/attachment-domain";

/** Parse a comment detail string that may embed attachments as a JSON tail. */
export function parseComment(detail: string): {
  text: string;
  attachments: CommentAttachment[];
} {
  const marker = "\n__ATTACHMENTS__:";
  const idx = detail.indexOf(marker);
  if (idx === -1) return { text: detail, attachments: [] };
  const text = detail.slice(0, idx).trimEnd();
  try {
    const attachments = JSON.parse(detail.slice(idx + marker.length));
    return { text, attachments };
  } catch {
    return { text: detail, attachments: [] };
  }
}

export function ActivityCard({
  entry,
  isHuman,
  attachments,
  onPin,
  onMark,
  onOpenAttachment,
  onOpenStored,
}: {
  entry: ActivityEntry;
  isHuman: boolean;
  /** Persisted attachments for this note, already signed. */
  attachments?: TimelineAttachment[];
  onPin: () => void;
  onMark: (mark: string | undefined) => void;
  onOpenAttachment: (att: CommentAttachment) => void;
  onOpenStored?: (att: TimelineAttachment) => void;
}) {
  const parsed = isHuman ? parseComment(entry.detail) : null;
  /* A structured body renders as formatted content; anything written before
     rich bodies existed falls back to the plain-text `detail`, which is why
     every note still reads correctly regardless of when it was posted. */
  const body = (entry as ActivityEntry & { body?: unknown }).body;
  const hasRichBody = isNoteDoc(body);
  const stored = attachments ?? [];
  const mark: CommentMark | undefined = getMark(entry.mark);

  return (
    <div
      className={cn(
        "relative space-y-1.5 overflow-hidden rounded-lg border p-3 text-xs transition-all",
        isHuman
          ? "border-primary/30 bg-primary/5"
          : "border-border/60 bg-muted/20",
        entry.pinned && "ring-1 ring-primary/40",
      )}
    >
      {mark && (
        <span
          className={cn("absolute left-0 top-0 h-full w-1", mark.bar)}
          aria-hidden
        />
      )}

      <div className="flex items-center justify-between text-[11px] font-bold text-foreground">
        <span className="flex items-center gap-1.5">
          <User className="h-3 w-3 text-primary" /> {entry.actor}
          {entry.pinned && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary">
              <Pin className="h-2.5 w-2.5" /> Pinned
            </span>
          )}
          {mark && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase",
                mark.chip,
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", mark.dot)} />
              {mark.label}
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          {/* Who can read this, stated on the entry itself — the timeline mixes
              BES-internal notes with partner-shared events, and they must not
              be indistinguishable at a glance. */}
          {entry.visibility && (
            <VisibilityBadge visibility={entry.visibility} />
          )}
          <span className="text-[10px] font-normal text-muted-foreground">
            {new Date(entry.timestamp).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        </span>
      </div>

      <p className="font-bold text-foreground">{entry.action}</p>

      {parsed ? (
        <>
          {hasRichBody ? (
            <NoteContent body={body} fallbackText={parsed.text} />
          ) : (
            parsed.text && <RichComment text={parsed.text} />
          )}

          {stored.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {stored.map((att) => (
                <button
                  key={att.id}
                  type="button"
                  onClick={() => onOpenStored?.(att)}
                  className="group flex items-center gap-2 overflow-hidden rounded-lg border border-border bg-background p-1.5 pr-3 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-muted/40">
                    {isImageAttachment(att) && att.url ? (
                      <img
                        src={att.url}
                        alt={att.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <FileText
                        className={cn(
                          "h-5 w-5",
                          isPdfAttachment(att)
                            ? "text-primary"
                            : "text-muted-foreground",
                        )}
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p
                      className="truncate text-[11px] font-bold text-foreground group-hover:text-primary"
                      title={att.name}
                    >
                      {att.name}
                    </p>
                    <p className="text-[9px] text-muted-foreground">
                      {formatBytes(att.sizeBytes)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {parsed.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {parsed.attachments.map((att) => (
                <button
                  key={att.id}
                  onClick={() => onOpenAttachment(att)}
                  className="group flex items-center gap-2 overflow-hidden rounded-lg border border-border bg-background p-1.5 pr-3 transition-colors hover:border-primary/40"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-muted/40">
                    {isImageFile(att) ? (
                      <img
                        src={att.url}
                        alt={att.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : isPdfFile(att) ? (
                      <FileText className="h-5 w-5 text-primary" />
                    ) : (
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p
                      className="truncate text-[11px] font-bold text-foreground group-hover:text-primary"
                      title={att.name}
                    >
                      {att.name}
                    </p>
                    <p className="text-[9px] text-muted-foreground">
                      {att.size}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
          {entry.detail}
        </p>
      )}

      <div className="flex items-center justify-end gap-1 border-t border-border/40 pt-1.5">
        <button
          onClick={onPin}
          className={cn(
            "rounded p-1.5 hover:bg-muted hover:text-foreground",
            entry.pinned ? "text-primary" : "text-muted-foreground",
          )}
          title={entry.pinned ? "Unpin comment" : "Pin comment"}
        >
          {entry.pinned ? (
            <PinOff className="h-3.5 w-3.5" />
          ) : (
            <Pin className="h-3.5 w-3.5" />
          )}
        </button>
        <MarkMenu current={entry.mark} onPick={onMark} />
      </div>
    </div>
  );
}
