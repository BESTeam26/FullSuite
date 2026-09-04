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
 * Layout:
 *   - Latest entries at the BOTTOM (ascending), so the newest context sits
 *     directly above the composer.
 *   - Pinned entries float to the top.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { History } from "lucide-react";
import { FileViewer } from "./FileViewer";
import type {
  AttachmentFile,
  CommentAttachment,
} from "@/lib/fulfillment/attachment-domain";
import type { OpsActivityEntry } from "@/lib/fulfillment/ops-activity-domain";
import { ActivityCard } from "./timeline/ActivityCard";
import type { TimelineAttachment } from "@/lib/data/use-activity-attachments";

interface OpsActivityTimelineProps {
  entries: OpsActivityEntry[];
  /** Attributed to attachments opened from this timeline. */
  actor: string;
  /** Shown when the timeline is empty — divisions word this differently. */
  emptyMessage: string;
  /** Persisted attachments keyed by activity id, fetched in one query. */
  attachmentsByActivity?: Record<string, TimelineAttachment[]>;
  /** Rendered beneath the list. The canonical `ActivityComposer`. */
  composer?: ReactNode;
  onTogglePin: (entryId: string) => void;
  onSetMark: (entryId: string, mark: string | undefined) => void;
}

const isHumanNote = (action: string) =>
  action === "Comment posted" || action === "Comment added";

export function OpsActivityTimeline({
  entries: activity,
  actor,
  emptyMessage,
  attachmentsByActivity,
  composer,
  onTogglePin,
  onSetMark,
}: OpsActivityTimelineProps) {
  const [viewerFiles, setViewerFiles] = useState<AttachmentFile[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { pinned, chronological } = useMemo(() => {
    const pinnedList = activity.filter((a) => a.pinned);
    const rest = activity.filter((a) => !a.pinned);
    rest.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    return { pinned: pinnedList, chronological: rest };
  }, [activity]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chronological.length, pinned.length]);

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
      onPin={() => onTogglePin(a.id)}
      onMark={(m) => onSetMark(a.id, m)}
      onOpenAttachment={openLegacy}
      onOpenStored={openStored}
    />
  );

  return (
    <div className="space-y-4">
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
                  <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                    Pinned ({pinned.length})
                  </p>
                  {pinned.map(card)}
                </div>
              )}
              {chronological.map(card)}
            </>
          )}
        </div>
      </div>

      {composer}

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
