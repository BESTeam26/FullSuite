/**
 * One message, and everything you can do to it.
 *
 * ── THE MENU IS THE SECURITY BOUNDARY'S SECOND HALF ────────────────────────
 *
 * Dee, §71: on somebody else's message there is "NO DELETE, NO EDIT, NO
 * UNSEND — Do not accidentally expose disabled Delete. Just do not show it."
 *
 * So those three are not rendered disabled; they are not rendered. The first
 * half is the database: `messages_update` says `author_id = auth.uid()` on
 * both USING and WITH CHECK, so an administrator calling the API directly is
 * refused (§31, §72). This component cannot grant what the policy denies, and
 * the policy does not care what this component draws.
 */
import { useState } from "react";
import {
  CornerUpLeft, Download, MessageSquare, Megaphone, MoreHorizontal, Paperclip,
  Pin, PinOff, SmilePlus, Trash2,
} from "lucide-react";
import { formatDate } from "@/lib/format-date";
import { signedAttachmentUrl, type Attachment, type RichMessage } from "@/lib/data/messages";
import { QUICK_REACTIONS } from "@/lib/communication/emoji";
import { cn } from "@/lib/utils";

export interface MessageRowProps {
  message: RichMessage;
  isMine: boolean;
  canPin: boolean;
  onReact: (emoji: string, mine: boolean) => void;
  onReply: () => void;
  onOpenThread: () => void;
  onPin: () => void;
  onDelete: () => void;
  onRetry?: () => void;
  onDismissFailed?: () => void;
  /** Threads have no threads (§21: one level). */
  compact?: boolean;
}

export function MessageRow({
  message: m, isMine, canPin, onReact, onReply, onOpenThread, onPin, onDelete,
  onRetry, onDismissFailed, compact = false,
}: MessageRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (m.messageType === "announcement") {
    return <AnnouncementCard message={m} />;
  }

  return (
    <article className={cn("group relative rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted/40",
                            m.pinned && "bg-amber-500/5")}>
      {m.replyToId && m.replyToText && (
        /* §23 — the quote is context, not a second copy of the record. */
        <p className="mb-0.5 flex items-center gap-1.5 truncate border-l-2 border-border pl-2 text-[11px] text-muted-foreground">
          <CornerUpLeft className="h-3 w-3 shrink-0" />
          <span className="font-semibold">{m.replyToAuthor}</span>
          <span className="truncate">{m.replyToText}</span>
        </p>
      )}

      <p className="flex flex-wrap items-baseline gap-2">
        <span className="font-semibold text-foreground">{m.authorName}</span>
        {m.fromBes && (
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
            BES team
          </span>
        )}
        <span className="text-[11px] text-muted-foreground">{formatDate(m.createdAt)}</span>
        {m.editedAt && <span className="text-[10px] text-muted-foreground">edited</span>}
        {m.pinned && <Pin className="h-3 w-3 text-amber-600" aria-label="Pinned" />}
        {m.pending && <span className="text-[10px] text-muted-foreground">Sending…</span>}
      </p>

      {m.deleted ? (
        /* §32 — the row survives so the thread keeps its shape. */
        <p className="italic text-muted-foreground">Message removed</p>
      ) : (
        <p className="whitespace-pre-wrap break-words text-foreground">{m.bodyText}</p>
      )}

      {m.attachments.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {m.attachments.map((a) => <li key={a.id}><AttachmentRow attachment={a} /></li>)}
        </ul>
      )}

      {m.reactions.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-1">
          {m.reactions.map((r) => (
            <li key={r.emoji}>
              <button type="button" onClick={() => onReact(r.emoji, r.mine)}
                aria-pressed={r.mine}
                aria-label={`${r.emoji} ${r.count}${r.mine ? ", including you" : ""}`}
                className={cn(
                  "rounded-full border px-1.5 py-0.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  r.mine
                    ? "border-primary/40 bg-primary/10 font-bold text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-muted",
                )}>
                {r.emoji} {r.count}
              </button>
            </li>
          ))}
        </ul>
      )}

      {!compact && m.replyCount > 0 && (
        <button type="button" onClick={onOpenThread}
          className="mt-1 inline-flex items-center gap-1.5 rounded px-1 text-[11px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <MessageSquare className="h-3 w-3" />
          {m.replyCount} {m.replyCount === 1 ? "reply" : "replies"}
          {m.lastReplyAt && <span className="font-normal text-muted-foreground">
            · last {formatDate(m.lastReplyAt)}
          </span>}
        </button>
      )}

      {m.failed && (
        <p role="alert" className="mt-1 flex items-center gap-2 text-[11px] text-status-danger">
          Failed to send.
          <button type="button" onClick={onRetry}
            className="font-bold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            Retry
          </button>
          <button type="button" onClick={onDismissFailed}
            className="underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            Remove
          </button>
        </p>
      )}

      {/* Actions. Visible on hover and on keyboard focus — a menu you can only
          reach with a mouse is a menu half the team cannot use (§22). */}
      {!m.deleted && !m.pending && (
        <div className="absolute right-1 top-1 flex items-center gap-0.5 rounded-md border border-border bg-card opacity-0 shadow-sm transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button type="button" aria-label="Add a reaction" onClick={() => setPickerOpen((v) => !v)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <SmilePlus className="h-3.5 w-3.5" />
          </button>
          <button type="button" aria-label="Reply" onClick={onReply}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <CornerUpLeft className="h-3.5 w-3.5" />
          </button>
          {!compact && (
            <button type="button" aria-label="Reply in thread" onClick={onOpenThread}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <MessageSquare className="h-3.5 w-3.5" />
            </button>
          )}
          <button type="button" aria-label="More actions" onClick={() => setMenuOpen((v) => !v)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {pickerOpen && (
        <div className="absolute right-1 top-8 z-10 flex gap-0.5 rounded-md border border-border bg-card p-1 shadow-md">
          {QUICK_REACTIONS.map((e) => (
            <button key={e} type="button" aria-label={`React ${e}`}
              onClick={() => { onReact(e, m.reactions.find((r) => r.emoji === e)?.mine ?? false); setPickerOpen(false); }}
              className="rounded px-1 py-0.5 text-base hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              {e}
            </button>
          ))}
        </div>
      )}

      {menuOpen && (
        <div className="absolute right-1 top-8 z-10 min-w-[10rem] rounded-md border border-border bg-card p-1 shadow-md">
          {canPin && (
            <MenuItem icon={m.pinned ? PinOff : Pin} label={m.pinned ? "Unpin" : "Pin to channel"}
              onClick={() => { onPin(); setMenuOpen(false); }} />
          )}
          {/* Only on your own. Not disabled — absent (§71). */}
          {isMine && (
            <MenuItem icon={Trash2} label="Delete" tone="danger"
              onClick={() => { onDelete(); setMenuOpen(false); }} />
          )}
          {!canPin && !isMine && (
            <p className="px-2 py-1.5 text-[11px] text-muted-foreground">Nothing else to do here.</p>
          )}
        </div>
      )}
    </article>
  );
}

function MenuItem({
  icon: Icon, label, onClick, tone,
}: { icon: typeof Pin; label: string; onClick: () => void; tone?: "danger" }) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        tone === "danger"
          ? "text-status-danger hover:bg-status-danger/10"
          : "text-foreground hover:bg-muted",
      )}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

/**
 * An announcement, rendered FROM the announcement.
 *
 * The message row carries no title and no body (0200). When the reader is not
 * authorized for the announcement, the join returns nothing and this says so —
 * it never received the content and chose not to draw it (§15).
 */
function AnnouncementCard({ message: m }: { message: RichMessage }) {
  if (!m.announcementTitle) {
    return (
      <article className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
        An announcement was posted here that is not addressed to you.
      </article>
    );
  }
  return (
    <article className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
      <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
        <Megaphone className="h-3 w-3" /> Announcement
      </p>
      <h3 className="text-sm font-bold text-foreground">{m.announcementTitle}</h3>
      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{m.announcementBody}</p>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {m.authorName}
        {m.announcementPublishedAt && ` · ${formatDate(m.announcementPublishedAt)}`}
      </p>
    </article>
  );
}

/** A private object, opened through a short-lived signed link (§26). */
function AttachmentRow({ attachment }: { attachment: Attachment }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kb = attachment.size ? Math.max(1, Math.round(attachment.size / 1024)) : null;

  const open = async () => {
    setBusy(true); setError(null);
    try {
      const url = await signedAttachmentUrl(attachment.path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => void open()} disabled={busy}
        className="flex w-full max-w-sm items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60">
        <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-foreground">{attachment.name}</span>
        {kb && <span className="shrink-0 text-[10px] text-muted-foreground">{kb} KB</span>}
        <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
      {error && <p role="alert" className="text-[11px] text-status-danger">{error}</p>}
    </>
  );
}
