/**
 * The canonical comment / internal-note composer.
 *
 * ONE composer for every module — CreditOps, FundingOps, Work Items, and the
 * Custom Workspace / TalentOps / BES CRM surfaces still to come. Context comes
 * in as props; nothing here knows which division it is serving (rule 2, rule 5).
 *
 * What it guarantees:
 *   - the note is persisted before the composer clears
 *   - a failure keeps the text, the attachments and the chosen audience
 *   - a second click while posting is a no-op, so one click is one note
 *   - attachments are uploaded to the private bucket and linked to the note
 *   - the audience is chosen explicitly, defaults to the most restrictive
 *     level, and is never remembered between notes
 */
import { lazy, Suspense, useCallback, useRef, useState } from "react";
import { Paperclip, Send, Loader2, X, FileText, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_VISIBILITY,
  type ActivityVisibility,
} from "@/lib/data/activity";
import { VisibilityPicker } from "@/components/dashboard/fulfillment/VisibilityControls";
import {
  discardUpload,
  formatBytes,
  isImageAttachment,
  rejectionReason,
  uploadAttachment,
  type UploadedObject,
} from "@/lib/data/activity-attachments";
import { errorMessage } from "@/lib/data/error-message";
import {
  docToPlainText,
  EMPTY_DOC,
  isDocEmpty,
  type NoteDoc,
} from "@/lib/activity/note-body";

/* The editor is ~the size of the rest of this screen put together, and most
   screens never render a composer. Split so they do not pay for it (rule 14). */
const RichTextEditor = lazy(() => import("./RichTextEditor"));

/** One file the author has added but not yet posted. */
interface PendingAttachment {
  key: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  /** Object URL for the local preview. Revoked when removed or posted. */
  previewUrl?: string;
  state: "uploading" | "ready" | "failed";
  error?: string;
  uploaded?: UploadedObject;
  file: File;
}

export interface ActivityComposerProps {
  /** Canonical record this note hangs off, e.g. "fulfillment_client". */
  entityType: string;
  entityId: string;
  /** Tenancy for the attachment path. Absent for agency-scope records. */
  organizationId?: string;
  /** Levels this author may create, computed centrally (rule 13). */
  allowedVisibilities: ActivityVisibility[];
  /**
   * Persist the note. Resolves with the created activity id so attachments can
   * be linked to it; rejects so the composer can keep the author's work.
   */
  onPost: (input: {
    body: NoteDoc;
    plainText: string;
    visibility: ActivityVisibility;
  }) => Promise<string | void>;
  /** Attach uploaded objects to the note the post just created. */
  onAttach?: (
    activityId: string,
    objects: UploadedObject[],
    visibility: ActivityVisibility,
  ) => Promise<void>;
}

export function ActivityComposer({
  entityType,
  entityId,
  organizationId,
  allowedVisibilities,
  onPost,
  onAttach,
}: ActivityComposerProps) {
  const [doc, setDoc] = useState<NoteDoc>(EMPTY_DOC);
  const [empty, setEmpty] = useState(true);
  const [visibility, setVisibility] =
    useState<ActivityVisibility>(DEFAULT_VISIBILITY);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  /* The real double-submit guard: state is not applied until the next render,
     so clicks dispatched in the same tick would all pass a state-based check. */
  const postingRef = useRef(false);

  const addFiles = useCallback(
    (files: File[]) => {
      for (const file of files) {
        const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const reason = rejectionReason(file);
        const preview = file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : undefined;

        setAttachments((prev) => [
          ...prev,
          {
            key,
            name: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
            previewUrl: preview,
            state: reason ? "failed" : "uploading",
            error: reason ?? undefined,
            file,
          },
        ]);
        if (reason) continue;

        /* Uploaded while the author keeps writing, so Post is not waiting on
           the network. Until the note exists the object is readable by nobody
           — the storage policy for this path requires a `files` row. */
        void uploadAttachment({
          file,
          entityType,
          entityId,
          organizationId,
          visibility,
        })
          .then((uploaded) =>
            setAttachments((prev) =>
              prev.map((a) =>
                a.key === key ? { ...a, state: "ready", uploaded } : a,
              ),
            ),
          )
          .catch((err: unknown) =>
            setAttachments((prev) =>
              prev.map((a) =>
                a.key === key
                  ? {
                      ...a,
                      state: "failed",
                      error: errorMessage(err, "Upload failed."),
                    }
                  : a,
              ),
            ),
          );
      }
    },
    [entityType, entityId, organizationId, visibility],
  );

  const removeAttachment = (key: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.key === key);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      // Do not leave the object behind in the bucket.
      if (target?.uploaded) void discardUpload(target.uploaded.path);
      return prev.filter((a) => a.key !== key);
    });
  };

  const retryAttachment = (key: string) => {
    const target = attachments.find((a) => a.key === key);
    if (!target) return;
    setAttachments((prev) => prev.filter((a) => a.key !== key));
    addFiles([target.file]);
  };

  const uploading = attachments.some((a) => a.state === "uploading");
  const ready = attachments.filter((a) => a.state === "ready");
  const canPost = (!empty || ready.length > 0) && !posting && !uploading;

  const handlePost = async () => {
    if (!canPost || postingRef.current) return;
    postingRef.current = true;
    setPosting(true);
    setError(null);

    const plainText = isDocEmpty(doc)
      ? `(${ready.length} attachment${ready.length === 1 ? "" : "s"})`
      : docToPlainText(doc);

    try {
      const activityId = await onPost({ body: doc, plainText, visibility });
      if (activityId && ready.length > 0 && onAttach) {
        await onAttach(
          String(activityId),
          ready.map((a) => a.uploaded!),
          visibility,
        );
      }
      for (const a of attachments) {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      }
      setAttachments([]);
      setDoc(EMPTY_DOC);
      setEmpty(true);
      setVisibility(DEFAULT_VISIBILITY);
      setResetToken((n) => n + 1);
    } catch (err) {
      setError(errorMessage(err, "Could not post this note."));
    } finally {
      postingRef.current = false;
      setPosting(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
        Post Comment / Internal Note
      </h3>

      <Suspense
        fallback={
          <div className="min-h-[118px] rounded-lg border border-border bg-background" />
        }
      >
        <RichTextEditor
          resetToken={resetToken}
          disabled={posting}
          onChange={(next, isEmpty) => {
            setDoc(next);
            setEmpty(isEmpty);
          }}
          onSubmit={() => void handlePost()}
          onFiles={addFiles}
        />
      </Suspense>

      {attachments.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {attachments.map((a) => (
            <li
              key={a.key}
              className={cn(
                "relative flex items-center gap-2 rounded-lg border bg-muted/30 p-1.5 pr-2",
                a.state === "failed"
                  ? "border-destructive/50"
                  : "border-border",
              )}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded bg-muted/50">
                {a.state === "uploading" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : a.previewUrl && isImageAttachment(a) ? (
                  <img
                    src={a.previewUrl}
                    alt={a.name}
                    className="h-full w-full object-cover"
                  />
                ) : a.state === "failed" ? (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                ) : (
                  <FileText className="h-4 w-4 text-primary" />
                )}
              </div>
              <div className="min-w-0">
                <p className="max-w-[150px] truncate text-[11px] font-medium text-foreground">
                  {a.name}
                </p>
                <p
                  className={cn(
                    "text-[10px]",
                    a.state === "failed"
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {a.state === "uploading"
                    ? "Uploading…"
                    : a.state === "failed"
                      ? (a.error ?? "Upload failed")
                      : formatBytes(a.sizeBytes)}
                </p>
              </div>
              {a.state === "failed" && (
                <button
                  type="button"
                  onClick={() => retryAttachment(a.key)}
                  className="rounded px-1.5 py-0.5 text-[10px] font-bold text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                >
                  Retry
                </button>
              )}
              <button
                type="button"
                aria-label={`Remove ${a.name}`}
                onClick={() => removeAttachment(a.key)}
                className="rounded-full bg-muted p-0.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] font-medium text-destructive"
        >
          {error} Your note has been kept — try posting again.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <input
            type="file"
            multiple
            ref={fileInput}
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(Array.from(e.target.files));
              e.target.value = "";
            }}
          />
          <button
            type="button"
            title="Attach a file"
            aria-label="Attach a file"
            disabled={posting}
            onClick={() => fileInput.current?.click()}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <span className="text-[10px] text-muted-foreground">
            Paste or drop images · Ctrl+Enter to post
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {/* The picker renders its own one-line explanation of the selected
              audience; a second copy here said the same thing twice. */}
          <VisibilityPicker
            value={visibility}
            onChange={setVisibility}
            options={allowedVisibilities}
          />
          <button
            type="button"
            onClick={() => void handlePost()}
            disabled={!canPost}
            aria-busy={posting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:bg-emerald-700/50 disabled:text-white/80"
          >
            {posting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {posting ? "Posting…" : uploading ? "Uploading…" : "Post Comment"}
          </button>
        </div>
      </div>
    </div>
  );
}
