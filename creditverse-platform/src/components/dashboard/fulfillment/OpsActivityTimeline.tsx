/**
 * OpsActivityTimeline — the activity list shared by every Managed Operations
 * division.
 *
 * Chronological timeline of human notes and system-generated activity. The
 * caller supplies the entries, the pin/mark mutations, and the composer to
 * render beneath them, so this component never reaches into a division-specific
 * store.
 *
 * The composer is a **slot**, not something built here. One canonical
 * `ActivityComposer` serves every module (rule 2); the timeline's job is to
 * display, not to write. It previously contained its own Markdown textarea,
 * which is how the composer came to differ from module to module.
 *
 * Layout, changed 2026-09-13. Dee: "with this design we're gonna end up having
 * a very long trail of activity history before we even get to the Comment
 * section."
 *
 * She is right, and it gets worse rather than better: three of the four
 * entries on the task she was looking at were system events — created, status,
 * status — around a single human comment. The audit trail grows forever and
 * the thing people came to do was write.
 *
 *   - The COMPOSER IS FIRST. You open a record to say something.
 *   - Newest entry directly beneath it, so the most recent context is the
 *     nearest thing to where you are typing.
 *   - Older entries are FOLDED, not dropped — a count and one click. Nothing
 *     is hidden from the record; `activity_events` is append-only and every
 *     row is still here (rule 10).
 *   - Pinned entries float above everything.
 */
import { useMemo, useState, type ReactNode } from "react";
import { History } from "lucide-react";
import { FileViewer } from "./FileViewer";
import type {
  AttachmentFile,
  CommentAttachment,
} from "@/lib/fulfillment/attachment-domain";
import type { OpsActivityEntry } from "@/lib/fulfillment/ops-activity-domain";
import { ActivityCard } from "./timeline/ActivityCard";
import { useVisibilityAudience } from "@/lib/auth/use-visibility-audience";
import type { TimelineAttachment } from "@/lib/data/use-activity-attachments";

interface OpsActivityTimelineProps {
  entries: OpsActivityEntry[];
  /** Attributed to attachments opened from this timeline. */
  actor: string;
  /** Shown when the timeline is empty — divisions word this differently. */
  emptyMessage: string;
  /** Persisted attachments keyed by activity id, fetched in one query. */
  attachmentsByActivity?: Record<string, TimelineAttachment[]>;
  /** Rendered ABOVE the list. The canonical `ActivityComposer`. */
  composer?: ReactNode;
  /** Whether pin / mark can be saved. False hides both controls (rule 3). */
  canAnnotate?: boolean;
  onTogglePin: (entryId: string) => void;
  onSetMark: (entryId: string, mark: string | undefined) => void;
}

const isHumanNote = (action: string) =>
  action === "Comment posted" || action === "Comment added";

/**
 * How many entries are shown before the fold.
 *
 * Enough to carry the current conversation — what just happened and who said
 * what about it — without the reader scrolling past six months of status
 * changes to reach it.
 */
const VISIBLE_BEFORE_FOLD = 5;

export function OpsActivityTimeline({
  entries: activity,
  actor,
  emptyMessage,
  attachmentsByActivity,
  composer,
  canAnnotate = false,
  onTogglePin,
  onSetMark,
}: OpsActivityTimelineProps) {
  const audience = useVisibilityAudience();
  const [viewerFiles, setViewerFiles] = useState<AttachmentFile[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);

  const { pinned, chronological } = useMemo(() => {
    const pinnedList = activity.filter((a) => a.pinned);
    const rest = activity.filter((a) => !a.pinned);
    /* Newest FIRST, now that the composer sits above the list. */
    rest.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    return { pinned: pinnedList, chronological: rest };
  }, [activity]);

  /** Legacy in-memory attachment (demo mode and pre-storage rows). */
  const openLegacy = (att: CommentAttachment) => {
    setViewerFiles([
      {
        id: att.id,
        name: att.name,
        size: att.size,
        type: att.type,
        category: "Client Correspondence",
        url: att.url,
        uploadedBy: actor,
        uploadedAt: "Just now",
      },
    ]);
    setViewerIndex(0);
  };

  /** Persisted attachment, opened through the existing in-app viewer. */
  const openStored = (att: TimelineAttachment) => {
    if (!att.url) return;
    setViewerFiles([
      {
        id: att.id,
        name: att.name,
        size: `${Math.max(1, Math.round(att.sizeBytes / 1024))} KB`,
        type: att.mimeType,
        category: "Client Correspondence",
        url: att.url,
        uploadedBy: actor,
        uploadedAt: "",
      },
    ]);
    setViewerIndex(0);
  };

  const card = (a: OpsActivityEntry) => (
    <ActivityCard
      key={a.id}
      entry={a}
      isHuman={isHumanNote(a.action)}
      attachments={attachmentsByActivity?.[a.id]}
      canAnnotate={canAnnotate}
      audience={audience}
      onPin={() => onTogglePin(a.id)}
      onMark={(m) => onSetMark(a.id, m)}
      onOpenAttachment={openLegacy}
      onOpenStored={openStored}
    />
  );

  const shown = expanded ? chronological : chronological.slice(0, VISIBLE_BEFORE_FOLD);
  const folded = chronological.length - shown.length;

  return (
    <div className="space-y-4">
      {composer}

      <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <h3 className="flex items-center gap-2 border-b border-border/50 pb-2 text-xs font-bold uppercase tracking-wider text-foreground">
          <History className="h-4 w-4 text-primary" /> Activity History (
          {activity.length})
        </h3>

        <div className="max-h-[500px] space-y-3 overflow-y-auto pr-1">
          {activity.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">
              {emptyMessage}
            </p>
          ) : (
            <>
              {pinned.length > 0 && (
                <div className="space-y-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-2">
                  <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                    Pinned ({pinned.length})
                  </p>
                  {pinned.map(card)}
                </div>
              )}
              {shown.map(card)}
              {folded > 0 && (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="w-full rounded-lg border border-dashed border-border py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Show {folded} earlier {folded === 1 ? "entry" : "entries"}
                </button>
              )}
              {expanded && chronological.length > VISIBLE_BEFORE_FOLD && (
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="w-full rounded-lg border border-dashed border-border py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Show less
                </button>
              )}
            </>
          )}
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
