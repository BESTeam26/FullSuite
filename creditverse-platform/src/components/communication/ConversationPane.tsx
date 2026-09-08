/**
 * One conversation, wherever it is being read from.
 *
 * Dee: "one record only per channel, even DM's. And portal message."
 *
 * That rule is kept in the database — a partner conversation is a single
 * `channels` row with two audiences. This component is the other half of it:
 * ONE piece of UI for reading and replying, used by the BES Communication
 * screen and by the partner portal. Two copies of a message list is how a
 * reply ends up formatted, ordered or attributed differently depending on who
 * is looking at the same exchange.
 *
 * ── WHAT IT FETCHES ────────────────────────────────────────────────────────
 *
 * One call for the conversation (`channel_messages`, which brings reactions,
 * reply counts, pins and attachments with it), and one more only when somebody
 * opens a thread. Nothing else — rule 14, and §41–§43's requirement that
 * sending a message must not reload the application.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Hash, Loader2, Pin, Undo2, X } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useTypingPresence } from "@/lib/data/use-typing-presence";
import { TypingIndicator } from "./TypingIndicator";
import { useMessageActions, useRichMessages, useSendMessage, useThread } from "@/lib/data/use-messages";
import { useChannelMentionable } from "@/lib/data/use-channels";
import { useMessageRealtime } from "@/lib/data/use-message-realtime";
import type { MentionAttrs } from "@/lib/activity/mentions";
import { attachToMessage, type RichMessage } from "@/lib/data/messages";
import { MessageRow } from "./MessageRow";
import { MeetingPanel } from "./MeetingButton";
import { Composer } from "./Composer";
import type { ReactNode } from "react";

export interface ConversationPaneProps {
  channelId: string;
  name: string;
  purpose?: string | null;
  /** Said above the conversation: who else can read what you are about to type. */
  notice?: ReactNode;
  emptyLabel?: string;
  readOnly?: boolean;
  readOnlyReason?: string;
  hideHeader?: boolean;
  /** A manager may pin; §29 keeps that separate from being an administrator. */
  canPin?: boolean;
  /** For attachments: which tenant's storage prefix the files belong under. */
  organizationId?: string | null;
  onMeeting?: () => void;
}

export function ConversationPane({
  channelId, name, purpose, notice, emptyLabel = "Nothing here yet. Say something.",
  readOnly = false, readOnlyReason, hideHeader = false, canPin = false,
  organizationId = null, onMeeting,
}: ConversationPaneProps) {
  const auth = useAuth();
  const messages = useRichMessages(channelId);
  const actions = useMessageActions(channelId);
  /* Ephemeral, on the socket, never in Postgres. The name is one the other
     participants already see on every message they have from this person, so
     it discloses nothing new. */
  const { typing, onInput: onTyping, stop: stopTyping } = useTypingPresence(
    channelId,
    auth.user?.id ? { userId: auth.user.id, name: auth.displayName || "Someone" } : null,
  );
  const [threadRoot, setThreadRoot] = useState<number | null>(null);
  const [replyTo, setReplyTo] = useState<RichMessage | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showPinned, setShowPinned] = useState(false);
  const [showMeeting, setShowMeeting] = useState(false);
  const pendingFiles = useRef<Map<string, File[]>>(new Map());
  const retryMentions = useRef<Map<string, MentionAttrs[]>>(new Map());

  const sender = useSendMessage(channelId);
  /* Who may be mentioned here — the set form of the predicate the notifier
     asks, so the picker cannot offer somebody the ping will skip (§27). */
  const mentionable = useChannelMentionable(channelId);
  /* Other people's messages arrive without a refresh, and our own optimistic
     row is recognised rather than duplicated (§55). */
  useMessageRealtime(channelId);

  /* A conversation opened is a conversation whose reply box should be usable
     without hunting for it, and whose newest message should be on screen. */
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const rows = messages.data ?? [];
  useEffect(() => {
    if (atBottom) bottomRef.current?.scrollIntoView?.({ block: "end" });
  }, [rows.length, atBottom]);
  useEffect(() => { setAtBottom(true); setReplyTo(null); setThreadRoot(null); }, [channelId]);

  const pinned = useMemo(() => rows.filter((m) => m.pinned && !m.deleted), [rows]);

  const send = async (text: string, files: File[], mentions: MentionAttrs[]): Promise<boolean> => {
    setSendError(null);
    const clientMessageId = crypto.randomUUID();
    if (files.length > 0) pendingFiles.current.set(clientMessageId, files);
    if (mentions.length > 0) retryMentions.current.set(clientMessageId, mentions);
    setAtBottom(true);
    try {
      const result = await sender.send.mutateAsync({
        clientMessageId, bodyText: text || "(attachment)",
        parentMessageId: null, replyToId: replyTo?.id ?? null, mentions,
      });
      setReplyTo(null);
      const queued = pendingFiles.current.get(clientMessageId);
      if (queued && result.id) {
        for (const file of queued) {
          await attachToMessage({
            messageId: result.id, channelId, organizationId,
            file, uploadedBy: auth.user?.id ?? "",
          });
        }
        pendingFiles.current.delete(clientMessageId);
        void messages.refetch();
      }
      retryMentions.current.delete(clientMessageId);
      return true;
    } catch (e) {
      /* The guard's refusal, or anything else. Returning false puts the draft
         back in the composer so the person can edit and send again (§38). */
      pendingFiles.current.delete(clientMessageId);
      setSendError(messageFor(e as Error, text));
      return false;
    }
  };

  return (
    <>
      {!hideHeader && (
        <header className="border-b border-border px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Hash className="h-4 w-4 text-muted-foreground" /> {name}
              </h2>
              {purpose && <p className="text-xs text-muted-foreground">{purpose}</p>}
            </div>
            {pinned.length > 0 && (
              <button type="button" onClick={() => setShowPinned((v) => !v)}
                aria-pressed={showPinned}
                className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <Pin className="h-3 w-3" /> {pinned.length} pinned
              </button>
            )}
          </div>
          {notice}
        </header>
      )}

      {showPinned && pinned.length > 0 && (
        <div className="border-b border-border bg-amber-500/5 px-4 py-2">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pinned</p>
          <ul className="space-y-1">
            {pinned.map((m) => (
              <li key={m.id} className="truncate text-xs text-foreground">
                <span className="font-semibold">{m.authorName}:</span> {m.bodyText}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div ref={scrollerRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
        }}
        className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        {messages.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : rows.length === 0 ? (
          <p className="p-1 text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          rows.map((m) => (
            <MessageRow key={m.clientMessageId ?? m.id} message={m}
              isMine={m.authorId === auth.user?.id}
              meUserId={auth.user?.id ?? null}
              canPin={canPin}
              onReact={(emoji, mine) => actions.react.mutate({ messageId: m.id, emoji, mine })}
              onReply={() => setReplyTo(m)}
              onOpenThread={() => setThreadRoot(m.id)}
              onPin={() => actions.pin.mutate({ messageId: m.id, pinned: m.pinned })}
              onDelete={() => actions.remove.mutate(m.id)}
              onEdit={(bodyText) => actions.edit.mutate({ messageId: m.id, bodyText })}
              onRetry={() => {
                if (!m.clientMessageId) return;
                /* Same idempotency key AND the same people, so a retry is
                   the same message rather than a similar one (§45). */
                void sender.send.mutateAsync({
                  clientMessageId: m.clientMessageId, bodyText: m.bodyText ?? "",
                  parentMessageId: null, replyToId: m.replyToId,
                  mentions: retryMentions.current.get(m.clientMessageId),
                }).catch(() => undefined);
              }}
              onDismissFailed={() => m.clientMessageId && sender.dismissFailed(m.clientMessageId)}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {!atBottom && rows.length > 0 && (
        /* §48 — never yank somebody who has scrolled up. Offer, don't jump. */
        <button type="button"
          onClick={() => { setAtBottom(true); bottomRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" }); }}
          className="mx-auto -mt-2 mb-1 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold text-primary shadow-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          Jump to latest
        </button>
      )}

      {sender.canUndo && !readOnly && (
        <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          Sent.
          <button type="button"
            onClick={() => sender.undo.mutate(sender.canUndo!)}
            className="inline-flex items-center gap-1 font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <Undo2 className="h-3 w-3" /> Unsend
          </button>
        </div>
      )}

      {showMeeting && !readOnly && <MeetingPanel onClose={() => setShowMeeting(false)} />}

      {readOnly ? (
        <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          {readOnlyReason ?? "You cannot post in this conversation."}
        </p>
      ) : (
        <>
          {/* Above the composer, below the messages — where Dee's reference
              puts it, and where it cannot push the conversation around. */}
          <TypingIndicator people={typing} className="border-t border-border pt-1" />
          <Composer name={name} sending={sender.send.isPending} error={sendError}
            replyingTo={replyTo ? { id: replyTo.id, author: replyTo.authorName, text: replyTo.bodyText ?? "" } : null}
            onCancelReply={() => setReplyTo(null)}
            onSend={send}
            mentionable={mentionable.data ?? []}
            onTyping={onTyping}
            onStopTyping={stopTyping}
            onMeeting={onMeeting ?? (() => setShowMeeting((v) => !v))} />
        </>
      )}

      {threadRoot !== null && (
        <ThreadPanel channelId={channelId} rootId={threadRoot}
          root={rows.find((m) => m.id === threadRoot) ?? null}
          canPin={canPin} onClose={() => setThreadRoot(null)} />
      )}
    </>
  );
}

/**
 * A thread.
 *
 * §22: "If a user cannot access the parent channel: they cannot access its
 * thread. No independent thread sharing." Nothing here checks that —
 * `thread_messages` is SECURITY INVOKER over `messages`, whose policy is the
 * channel's, so a thread cannot be reachable when its channel is not.
 */
function ThreadPanel({
  channelId, rootId, root, canPin, onClose,
}: {
  channelId: string; rootId: number; root: RichMessage | null;
  canPin: boolean; onClose: () => void;
}) {
  const auth = useAuth();
  const replies = useThread(rootId);
  const actions = useMessageActions(channelId);
  const sender = useSendMessage(channelId);
  /* Same channel, same list — a thread has no membership of its own (§22). */
  const mentionable = useChannelMentionable(channelId);
  const [error, setError] = useState<string | null>(null);

  return (
    <aside role="dialog" aria-label="Thread"
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-border bg-card shadow-xl md:static md:z-auto md:w-96 md:shadow-none">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-bold text-foreground">Thread</h2>
        <button type="button" onClick={onClose} aria-label="Close thread"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        {root && (
          <div className="mb-2 border-b border-border pb-2">
            <MessageRow message={root} isMine={root.authorId === auth.user?.id}
              meUserId={auth.user?.id ?? null} canPin={canPin} compact
              onReact={(emoji, mine) => actions.react.mutate({ messageId: root.id, emoji, mine })}
              onReply={() => undefined} onOpenThread={() => undefined}
              onPin={() => actions.pin.mutate({ messageId: root.id, pinned: root.pinned })}
              onDelete={() => actions.remove.mutate(root.id)}
              onEdit={(bodyText) => actions.edit.mutate({ messageId: root.id, bodyText })} />
          </div>
        )}
        {replies.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (replies.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No replies yet.</p>
        ) : (
          (replies.data ?? []).map((m) => (
            <MessageRow key={m.id} message={m} isMine={m.authorId === auth.user?.id}
              meUserId={auth.user?.id ?? null} canPin={false} compact
              onReact={(emoji, mine) => actions.react.mutate({ messageId: m.id, emoji, mine })}
              onReply={() => undefined} onOpenThread={() => undefined}
              onPin={() => undefined}
              onDelete={() => actions.remove.mutate(m.id)}
              onEdit={(bodyText) => actions.edit.mutate({ messageId: m.id, bodyText })} />
          ))
        )}
      </div>

      <Composer name="this thread" sending={sender.send.isPending} error={error}
        mentionable={mentionable.data ?? []}
        onSend={async (text, _files, mentions) => {
          setError(null);
          try {
            await sender.send.mutateAsync({
              clientMessageId: crypto.randomUUID(), bodyText: text,
              parentMessageId: rootId, replyToId: null, mentions,
            });
            return true;
          } catch (e) {
            setError(messageFor(e as Error, text));
            return false;
          }
        }} />
    </aside>
  );
}

/**
 * What to show somebody whose message was refused.
 *
 * The guard raises P0001 with wording written for the person reading it, so
 * that text is used verbatim. Anything else gets its own message plus the
 * draft, because a refusal you cannot act on is worse than no refusal at all.
 */
function messageFor(error: Error, draft: string): string {
  const text = error.message || "Could not send.";
  return draft ? `${text} Your message is back in the box — edit it and send again.` : text;
}
