/**
 * OpsActivityTimeline — the activity & rich-comment timeline shared by every
 * Managed Operations division.
 *
 * Chronological timeline containing human comments, replies, pasted images,
 * uploaded attachments, links, and all system-generated activity.
 *
 * The caller supplies the entries and the three mutations (post, pin, mark) so
 * this component never reaches into a division-specific store.
 *
 * Features (ClickUp / Slack-style):
 *   - Latest comments appear at the BOTTOM (ascending chronological) so the
 *     most recent context sits right above the composer.
 *   - Any comment can be PINNED — pinned comments float to the top.
 *   - Any comment can be MARKED with a colored tag.
 *   - Rich comment formatting: headings, quotes, code blocks, lists, indent.
 *   - Inline attachment previews (never plain "image.png" text).
 */
import { useState, useRef, useEffect, useMemo } from "react";
import {
  History,
  MessageSquare,
  Paperclip,
  Send,
  FileText,
  X,
  Pin,
  Quote,
  Code,
  Heading,
  List,
  Loader2,
} from "lucide-react";
import { FileViewer } from "./FileViewer";
import {
  isImageFile,
  isPdfFile,
  type AttachmentFile,
  type CommentAttachment,
} from "@/lib/fulfillment/attachment-domain";
import type { OpsActivityEntry } from "@/lib/fulfillment/ops-activity-domain";
import { ActivityCard } from "./timeline/ActivityCard";
import {
  DEFAULT_VISIBILITY,
  type ActivityVisibility,
} from "@/lib/data/activity";
import {
  VisibilityPicker,
  VisibilityBadge,
} from "@/components/dashboard/fulfillment/VisibilityControls";

interface OpsActivityTimelineProps {
  entries: OpsActivityEntry[];
  /** Recorded as the author of new comments. */
  actor: string;
  /** Shown when the timeline is empty — divisions word this differently. */
  emptyMessage: string;
  /**
   * Resolves when the note is persisted, rejects when it is not. The composer
   * clears only on resolve — a rejected post keeps what the author typed.
   */
  onPostComment: (
    detail: string,
    visibility: ActivityVisibility,
  ) => Promise<void> | void;
  /**
   * Levels this author may create, computed centrally by
   * `allowedVisibilities()`. The timeline never derives them (rule 13).
   */
  allowedVisibilities: ActivityVisibility[];
  onTogglePin: (entryId: string) => void;
  onSetMark: (entryId: string, mark: string | undefined) => void;
}

export function OpsActivityTimeline({
  entries: activity,
  actor,
  emptyMessage,
  onPostComment,
  allowedVisibilities: allowed,
  onTogglePin,
  onSetMark,
}: OpsActivityTimelineProps) {
  const [commentText, setCommentText] = useState("");
  /* Never remembered between posts. A composer that keeps the last audience
     is how a one-off client-visible note becomes the accidental default. */
  const [visibility, setVisibility] =
    useState<ActivityVisibility>(DEFAULT_VISIBILITY);
  const [pendingAttachments, setPendingAttachments] = useState<
    CommentAttachment[]
  >([]);
  const [isPosting, setIsPosting] = useState(false);
  /**
   * The real double-submit guard.
   *
   * `isPosting` drives the button's label and disabled attribute, but React
   * state is not applied synchronously: several clicks dispatched before the
   * next render all read the stale `false` and all post. Measured — three
   * rapid clicks produced three activity rows. A ref flips on the current
   * tick, so the second click returns immediately.
   */
  const postingRef = useRef(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [viewerFiles, setViewerFiles] = useState<AttachmentFile[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Pinned comments float to the top; the rest is ASCENDING (oldest first,
  // latest at the bottom, right above the composer).
  const { pinned, chronological } = useMemo(() => {
    const pinnedList = activity.filter((a) => a.pinned);
    const rest = activity.filter((a) => !a.pinned);
    rest.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    return { pinned: pinnedList, chronological: rest };
  }, [activity]);

  // Auto-scroll to the latest comment at the bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chronological.length, pinned.length]);

  const addPendingFiles = (files: FileList | File[]) => {
    Array.from(files).forEach((file) => {
      const url = URL.createObjectURL(file);
      setPendingAttachments((prev) => [
        ...prev,
        {
          id: `catt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          size:
            file.size > 1024 * 1024
              ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
              : `${Math.round(file.size / 1024)} KB`,
          type: file.type || "application/octet-stream",
          url,
        },
      ]);
    });
  };

  // Clipboard paste inside the textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const f = items[i].getAsFile();
          if (f) imageFiles.push(f);
        }
      }
      if (imageFiles.length) {
        e.preventDefault();
        addPendingFiles(imageFiles);
      }
    };
    el.addEventListener("paste", onPaste);
    return () => el.removeEventListener("paste", onPaste);
  }, []);

  const canPost =
    (commentText.trim().length > 0 || pendingAttachments.length > 0) &&
    !isPosting;

  /**
   * Post, then clear — in that order, and only on success.
   *
   * The composer used to clear synchronously beside a fire-and-forget write,
   * so a failed post looked identical to a successful one and took the text
   * with it. `isPosting` also makes a second click a no-op, which is what
   * stops an impatient double-click becoming two activity rows.
   */
  const handlePostComment = async () => {
    if (!canPost || postingRef.current) return;
    postingRef.current = true;
    const attachmentPayload =
      pendingAttachments.length > 0
        ? `\n__ATTACHMENTS__:${JSON.stringify(pendingAttachments)}`
        : "";
    setIsPosting(true);
    setPostError(null);
    try {
      await onPostComment(
        `${commentText.trim() || "(attachment only)"}${attachmentPayload}`,
        visibility,
      );
      setCommentText("");
      setPendingAttachments([]);
      setVisibility(DEFAULT_VISIBILITY);
    } catch (err) {
      setPostError(
        err instanceof Error ? err.message : "Could not post this note.",
      );
    } finally {
      postingRef.current = false;
      setIsPosting(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void handlePostComment();
    }
  };

  const openAttachment = (att: CommentAttachment) => {
    const file: AttachmentFile = {
      id: att.id,
      name: att.name,
      size: att.size,
      type: att.type,
      category: "Client Correspondence",
      url: att.url,
      uploadedBy: actor,
      uploadedAt: "Just now",
    };
    setViewerFiles([file]);
    setViewerIndex(0);
  };

  // Composer formatting helpers (insert markdown syntax at cursor).
  const prefixLines = (prefix: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = commentText.slice(start, end) || "text";
    const next = `${commentText.slice(0, start)}${prefix}${selected}${commentText.slice(
      end,
    )}`;
    setCommentText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = start + prefix.length;
      el.selectionEnd = start + prefix.length + selected.length;
    });
  };

  const fmtBtn = (icon: React.ReactNode, title: string, fn: () => void) => (
    <button
      onClick={fn}
      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      title={title}
      type="button"
    >
      {icon}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Activity Timeline */}
      <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <h3 className="flex items-center gap-2 border-b border-border/50 pb-2 text-xs font-bold uppercase tracking-wider text-foreground">
          <History className="h-4 w-4 text-primary" /> Activity History (
          {activity.length})
        </h3>

        <div
          ref={scrollRef}
          className="max-h-[500px] space-y-3 overflow-y-auto pr-1"
        >
          {activity.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">
              {emptyMessage}
            </p>
          ) : (
            <>
              {pinned.length > 0 && (
                <div className="space-y-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-2">
                  <p className="flex items-center gap-1 px-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                    <Pin className="h-3 w-3" /> Pinned ({pinned.length})
                  </p>
                  {pinned.map((a) => (
                    <ActivityCard
                      key={a.id}
                      entry={a}
                      isHuman={
                        a.action === "Comment posted" ||
                        a.action === "Comment added"
                      }
                      onPin={() => onTogglePin(a.id)}
                      onMark={(m) => onSetMark(a.id, m)}
                      onOpenAttachment={openAttachment}
                    />
                  ))}
                </div>
              )}

              {chronological.map((a) => (
                <ActivityCard
                  key={a.id}
                  entry={a}
                  isHuman={
                    a.action === "Comment posted" ||
                    a.action === "Comment added"
                  }
                  onPin={() => onTogglePin(a.id)}
                  onMark={(m) => onSetMark(a.id, m)}
                  onOpenAttachment={openAttachment}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Rich Comment Composer */}
      <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground">
          <MessageSquare className="h-4 w-4 text-primary" /> Post Comment /
          Internal Note
        </h3>

        <div className="flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-muted/20 p-1">
          {fmtBtn(<Heading className="h-4 w-4" />, "Heading (#)", () =>
            prefixLines("# "),
          )}
          {fmtBtn(<Quote className="h-4 w-4" />, "Quote (>)", () =>
            prefixLines("> "),
          )}
          {fmtBtn(<Code className="h-4 w-4" />, "Code block", () =>
            prefixLines("```\n"),
          )}
          {fmtBtn(<List className="h-4 w-4" />, "Bullet list (-)", () =>
            prefixLines("- "),
          )}
          <div className="mx-1 h-4 w-px bg-border" />
          <span className="px-1 text-[10px] text-muted-foreground">
            Indent with spaces to nest · Ctrl+Enter to post
          </span>
        </div>

        <textarea
          ref={textareaRef}
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            "Type your comment…\n# Heading\n> Quote\n```code block```\n- bullet\n  - nested"
          }
          rows={5}
          className="w-full rounded-lg border border-border bg-background p-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />

        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pendingAttachments.map((att) => (
              <div
                key={att.id}
                className="relative flex items-center gap-2 overflow-hidden rounded-lg border border-border bg-muted/30 p-1.5 pr-2"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded bg-muted/40">
                  {isImageFile(att) ? (
                    <img
                      src={att.url}
                      alt={att.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <FileText className="h-5 w-5 text-primary" />
                  )}
                </div>
                <span className="max-w-[120px] truncate text-[11px] font-medium text-foreground">
                  {att.name}
                </span>
                <button
                  onClick={() =>
                    setPendingAttachments((prev) =>
                      prev.filter((p) => p.id !== att.id),
                    )
                  }
                  className="rounded-full bg-muted p-0.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {postError && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] font-medium text-destructive"
          >
            {postError} Your text has been kept — try posting again.
          </p>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <input
              type="file"
              multiple
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files) addPendingFiles(e.target.files);
                e.target.value = "";
              }}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded p-1.5 hover:bg-muted hover:text-foreground"
              title="Attach file"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <span className="text-[10px]">
              Tip: Ctrl+V to paste screenshots
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <VisibilityPicker
              value={visibility}
              onChange={setVisibility}
              options={allowed}
            />
            <button
              onClick={() => void handlePostComment()}
              disabled={!canPost}
              aria-busy={isPosting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 font-bold text-white shadow transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:bg-emerald-700/50 disabled:text-white/80"
            >
              {isPosting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {isPosting ? "Posting…" : "Post Comment"}
            </button>
          </div>
        </div>
      </div>

      {viewerIndex !== null && viewerFiles.length > 0 && (
        <FileViewer
          files={viewerFiles}
          startIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  );
}
