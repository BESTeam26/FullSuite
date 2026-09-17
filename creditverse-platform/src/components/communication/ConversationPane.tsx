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
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2, FileText, Hash, Loader2, Lock, MessagesSquare, PanelRight, Pin,
  ShieldAlert, Star, Undo2, X,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useTypingPresence } from "@/lib/data/use-typing-presence";
import { TypingIndicator } from "./TypingIndicator";
import {
  useChannelFiles, useChannelTabCounts, useMessageActions, useRichMessages,
  useSendMessage, useThread,
} from "@/lib/data/use-messages";
import { ChannelTabs, type ChannelTab } from "@/components/communication/ChannelTabs";
import { SeenBy } from "@/components/communication/SeenBy";
import { ChannelDetails } from "@/components/communication/ChannelDetails";
import { dayBoundaries, dayLabel } from "@/lib/communication/day-groups";
import { formatDate } from "@/lib/format-date";
import {
  useChannelDetails, useChannelMembers, useChannelMentionable, useChannelPreferences,
  useChannelSeenBy, useChannels,
} from "@/lib/data/use-channels";
import { useMessageRealtime } from "@/lib/data/use-message-realtime";
import type { MentionAttrs } from "@/lib/activity/mentions";
import { attachToMessage, type RichMessage } from "@/lib/data/messages";
import { PageLoadError } from "@/components/common/QueryState";
import { useSavedMessages, useToggleSaved } from "@/lib/data/communication-home";
import { Avatar } from "@/components/common/Avatar";
import { cn } from "@/lib/utils";
import { usePanelWidth } from "@/lib/agency/use-panel-width";
import { PanelResizer } from "@/components/dashboard/PanelResizer";
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
  /**
   * Which glyph the heading wears, so a direct message stops announcing itself
   * with a hash the way the rail used to (Dee, 2026-09-16).
   */
  glyph?: "hash" | "person" | "private" | "audit";
  /**
   * Whose conversation this is — partner or organization, and the engagement
   * it is scoped to. Read off the channel the caller already has, so the
   * header costs no extra request (rule 14).
   */
  owner?: { name: string; service?: string | null } | null;
  emptyLabel?: string;
  readOnly?: boolean;
  readOnlyReason?: string;
  hideHeader?: boolean;
  /**
   * Both of these are READ FROM THE CHANNEL by default and are here only as an
   * override.
   *
   * Dee, 2026-09-17: "All Changes should be applied to all chat groups or
   * rooms, like the pins and the GIF and the seen/viewed." The partner portal
   * renders this same pane and passed neither, so pinning was off and the
   * Members tab said nobody — not because of a rule, but because a caller did
   * not know there was a prop to pass. Deriving it means every conversation
   * gets the same behaviour without anybody remembering.
   */
  openToScope?: boolean;
  /** A manager may pin; §29 keeps that separate from being an administrator. */
  canPin?: boolean;
  /** For attachments: which tenant's storage prefix the files belong under. */
  organizationId?: string | null;
  onMeeting?: () => void;
}

export function ConversationPane({
  channelId, name, purpose, notice, glyph = "hash", owner = null,
  emptyLabel = "Start the conversation with your team.",
  readOnly = false, readOnlyReason, hideHeader = false, canPin = false, openToScope = false,
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
  const [sendError, setSendError] = useState<string | null>(null);
  const [showPinned, setShowPinned] = useState(false);
  const [tab, setTab] = useState<ChannelTab>("messages");
  /* Open by default, as the reference shows it — and remembered per person so
     somebody who closes it is not given it back on every conversation. */
  const [showDetails, setShowDetails] = useState(() => {
    try { return window.localStorage.getItem("bes.communication.details") !== "off"; }
    catch { return true; }
  });
  const tabCounts = useChannelTabCounts(channelId);
  /* Fetched only once the Files tab is opened — rule 14, do not preload a tab
     nobody asked for. */
  const files = useChannelFiles(channelId, tab === "files");
  /* The conversation's own row, from the list every caller has already
     fetched — so this costs no request and no caller has to pass it. */
  const channels = useChannels();
  const self = (channels.data ?? []).find((c) => c.id === channelId);
  const mayPin = canPin || self?.isManager === true;
  const openScope = openToScope || self?.openToScope === true;
  /* Read receipts. Polled rather than pushed: a receipt three seconds late
     costs nothing, and a socket per conversation to carry "somebody glanced at
     this" is not worth it. */
  const seenBy = useChannelSeenBy(channelId);
  const details = useChannelDetails(channelId);
  /* Remembered per person, like the sidebar. The minimum is the fixed space
     that stops the column being dragged away entirely. */
  const asideWidth = usePanelWidth({
    id: "communication-aside", userId: auth.user?.id ?? null,
    defaultWidth: 384, min: 280, max: 620, invert: true,
  });
  const prefs = useChannelPreferences(channelId);
  const [showMeeting, setShowMeeting] = useState(false);
  const pendingFiles = useRef<Map<string, File[]>>(new Map());
  const retryMentions = useRef<Map<string, MentionAttrs[]>>(new Map());

  /* Saved is per-reader and private. The list is small and already cached for
     the Saved view, so knowing whether a row is in it costs no request. */
  const savedList = useSavedMessages();
  const toggleSaved = useToggleSaved();
  const savedIds = useMemo(
    () => new Set((savedList.data ?? []).map((x) => x.messageId)),
    [savedList.data],
  );

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
  /* Its own memo: `data ?? []` is a new array each render, so the pinned memo
     below recomputed every time and could never hit. */
  const rows = useMemo(() => messages.data ?? [], [messages.data]);
  useEffect(() => {
    if (atBottom) bottomRef.current?.scrollIntoView?.({ block: "end" });
  }, [rows.length, atBottom]);
  useEffect(() => { setAtBottom(true); setThreadRoot(null); setTab("messages"); }, [channelId]);

  const toggleDetails = () => setShowDetails((v) => {
    const next = !v;
    try { window.localStorage.setItem("bes.communication.details", next ? "on" : "off"); } catch { /* private window */ }
    return next;
  });

  const pinned = useMemo(() => rows.filter((m) => m.pinned && !m.deleted), [rows]);
  /* Which rows start a new day, so the list stays flat and the divider is
     drawn above the row rather than the rows being nested per day. */
  const dividers = useMemo(() => dayBoundaries(rows.map((m) => m.createdAt)), [rows]);

  const send = async (text: string, files: File[], mentions: MentionAttrs[]): Promise<boolean> => {
    setSendError(null);
    const clientMessageId = crypto.randomUUID();
    if (files.length > 0) pendingFiles.current.set(clientMessageId, files);
    if (mentions.length > 0) retryMentions.current.set(clientMessageId, mentions);
    setAtBottom(true);
    try {
      const result = await sender.send.mutateAsync({
        clientMessageId, bodyText: text || "(attachment)",
        parentMessageId: null, replyToId: null, mentions,
      });
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
    /* A ROW, not a column.
       
       The thread used to be the last child of the conversation's flex-COLUMN,
       so `md:static` could only put it BELOW the composer — which is what Dee
       screenshotted. A thread is a second conversation happening beside the
       first, the way Slack shows it, so it has to be a SIBLING COLUMN. */
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
      {!hideHeader && (
        <header className="border-b border-border px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-2.5">
              {glyph === "person"
                ? <Avatar name={name} size="sm" className="mt-0.5" />
                : (
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                    {glyph === "audit" ? <ShieldAlert className="h-4 w-4 text-amber-600" />
                      : glyph === "private" ? <Lock className="h-4 w-4 text-muted-foreground" />
                      : <Hash className="h-4 w-4 text-muted-foreground" />}
                  </span>
                )}
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold text-foreground">{name}</h2>
                {/* Whose account this belongs to, and which engagement it is
                    scoped to — the two facts somebody needs before they type
                    into a partner conversation. */}
                {owner && (
                  <p className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                    <Building2 className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="font-medium text-foreground">{owner.name}</span>
                    {owner.service && <><span aria-hidden>·</span><span>{owner.service}</span></>}
                  </p>
                )}
                {purpose && <p className="truncate text-xs text-muted-foreground">{purpose}</p>}
              </div>
            </div>
            {/* From the reference: the star and who is in here, beside the
                name rather than buried in a panel. */}
            <div className="flex shrink-0 items-center gap-1">
              {details.data && (
                <button
                  type="button"
                  onClick={() => prefs.setFavourite.mutate(!details.data!.favourite)}
                  aria-pressed={details.data.favourite}
                  aria-label={details.data.favourite ? "Remove star" : "Star this conversation"}
                  className="rounded p-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <Star className={cn("h-4 w-4",
                    details.data.favourite ? "fill-amber-400 text-amber-500" : "text-muted-foreground")} />
                </button>
              )}
              {(details.data?.members.length ?? 0) > 0 && (
                <button type="button" onClick={() => setTab("members")}
                  aria-label={`${details.data!.memberCount} members`}
                  className="flex items-center gap-1 rounded-lg px-1 py-0.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <span className="flex -space-x-1.5">
                    {details.data!.members.slice(0, 4).map((m) => (
                      <Avatar key={m.id} name={m.name} size="sm"
                        className="h-6 w-6 text-[9px] ring-2 ring-card" />
                    ))}
                  </span>
                  {details.data!.memberCount > 4 && (
                    <span className="text-[11px] font-semibold text-muted-foreground">
                      +{details.data!.memberCount - 4}
                    </span>
                  )}
                </button>
              )}
              <button type="button" onClick={toggleDetails} aria-pressed={showDetails}
                aria-label="Channel details"
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <PanelRight className="h-4 w-4" />
              </button>
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

      {/* Messages · Files · Pins · Members, from Dee's reference. */}
      <ChannelTabs active={tab} onChange={setTab} counts={tabCounts.data} openToScope={openScope} />

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

      {tab !== "messages" ? (
        <ChannelTabPanel tab={tab} channelId={channelId} pinned={pinned}
          files={files} openToScope={openScope}
          onOpenThread={(id) => { setTab("messages"); setThreadRoot(id); }} />
      ) : (
      <div ref={scrollerRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
        }}
        className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        {messages.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : messages.isError ? (
          /* `rows` is `data ?? []`, so a failed fetch used to render the empty
             state — telling somebody a conversation with five hundred messages
             in it had never been started. The same shape as the Partner-folder
             bug, in the place people would notice it least. */
          <div className="flex h-full items-center justify-center p-6">
            <PageLoadError what="These messages" />
          </div>
        ) : rows.length === 0 ? (
          /* Dee, §"EMPTY STATES": not a large blank white area. */
          <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center">
            <MessagesSquare className="h-6 w-6 text-muted-foreground/60" aria-hidden />
            <p className="text-sm font-semibold text-foreground">No messages yet</p>
            <p className="max-w-xs text-xs text-muted-foreground">{emptyLabel}</p>
          </div>
        ) : (
          rows.map((m, i) => (
            <Fragment key={m.clientMessageId ?? m.id}>
            {dividers.has(i) && (
              /* "Today", as the reference shows. Sticky, so scrolling back
                 through a long day still says which day you are in. */
              <div className="sticky top-0 z-10 flex items-center gap-2 py-1.5">
                <span className="h-px flex-1 bg-border" />
                <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground shadow-sm">
                  {dayLabel(dividers.get(i)!)}
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>
            )}
            <MessageRow message={m}
              isMine={m.authorId === auth.user?.id}
              meUserId={auth.user?.id ?? null}
              canPin={canPin}
              saved={savedIds.has(m.id)}
              onToggleSave={() => toggleSaved.mutate({ messageId: m.id, saved: savedIds.has(m.id) })}
              onReact={(emoji, mine) => actions.react.mutate({ messageId: m.id, emoji, mine })}
              onReply={() => setThreadRoot(m.id)}
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
            </Fragment>
          ))
        )}
        {/* Attached to the LAST MESSAGE, not pinned to the bottom of the pane.
            Dee, 2026-09-17: "the SEEN by is showing at the very bottom" — a
            strip above the composer sits alone at the foot of an empty panel
            and reads as a property of the room. It belongs to the message it
            is about, so it lives in the scroll flow under it. */}
        <SeenBy readers={seenBy.data ?? []} className="pl-2"
          lastMessageAt={rows.length > 0 ? rows[rows.length - 1].createdAt : null} />
        <div ref={bottomRef} />
      </div>
      )}

      {tab === "messages" && !atBottom && rows.length > 0 && (
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

      {tab !== "messages" ? null : readOnly ? (
        <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          {readOnlyReason ?? "You cannot post in this conversation."}
        </p>
      ) : (
        <>
          {/* Typing stays pinned above the composer: it is about somebody
              writing right now, and it must not move the conversation. */}
          <TypingIndicator people={typing} className="border-t border-border pt-1" />
          <Composer name={name} draftKey={channelId} sending={sender.send.isPending} error={sendError}
            onSend={send}
            mentionable={mentionable.data ?? []}
            onTyping={onTyping}
            onStopTyping={stopTyping}
            onMeeting={onMeeting ?? (() => setShowMeeting((v) => !v))} />
        </>
      )}
      </div>

      {/* The right column. The thread when one is open, and the channel's
          details under it — the arrangement in Dee's reference. On a phone the
          thread is a full overlay and the details are reached from the
          Members tab instead, because there is room for one column. */}
      {(threadRoot !== null || showDetails) && (
        <div
          /* Resizable, with a minimum that keeps it readable — Dee, 2026-09-17:
             "leave a fix space so the entire column wont be hidden or gone by
             adjusting." Below ~280px a reply wraps to three words a line. */
          style={{ "--aside-w": `${asideWidth.width}px` } as React.CSSProperties}
          className={cn(
            "relative hidden min-h-0 shrink-0 flex-col gap-3 overflow-y-auto border-l border-border p-3 md:flex md:w-[var(--aside-w)]",
            asideWidth.dragging ? "" : "transition-[width] duration-150",
          )}>
          {/* The handle is on this column's LEFT edge, so the drag is
              inverted: moving left makes it wider. */}
          <div className="absolute inset-y-0 left-0">
            <PanelResizer
              label="Resize the thread and details column"
              dragging={asideWidth.dragging}
              onPointerDown={asideWidth.onPointerDown}
              onNudge={(d) => asideWidth.setWidth(asideWidth.width + d)}
              onReset={asideWidth.reset}
            />
          </div>
          {threadRoot !== null && (
            <ThreadPanel channelId={channelId} rootId={threadRoot}
              root={rows.find((m) => m.id === threadRoot) ?? null}
              canPin={mayPin} onClose={() => setThreadRoot(null)} />
          )}
          {showDetails && <ChannelDetails channelId={channelId} />}
        </div>
      )}
      {/* On a phone the thread still covers the conversation. */}
      {threadRoot !== null && (
        <div className="md:hidden">
          <ThreadPanel channelId={channelId} rootId={threadRoot}
            root={rows.find((m) => m.id === threadRoot) ?? null}
            canPin={mayPin} onClose={() => setThreadRoot(null)} />
        </div>
      )}
    </div>
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
  /* Saved is per-reader and private. The list is small and already cached for
     the Saved view, so knowing whether a row is in it costs no request. */
  const savedList = useSavedMessages();
  const toggleSaved = useToggleSaved();
  const savedIds = useMemo(
    () => new Set((savedList.data ?? []).map((x) => x.messageId)),
    [savedList.data],
  );

  const sender = useSendMessage(channelId);
  /* Same channel, same list — a thread has no membership of its own (§22). */
  const mentionable = useChannelMentionable(channelId);
  const [error, setError] = useState<string | null>(null);

  return (
    <aside role="dialog" aria-label="Thread"
      /* Phone: it covers the conversation, because there is room for one.
         From md up it is its own column beside it — `shrink-0` so the messages
         give way rather than the thread being squeezed to nothing. */
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-border bg-card shadow-xl
                 md:static md:z-auto md:w-80 md:shrink-0 md:shadow-none lg:w-96">
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
        ) : (<>
          {/* Said above them, as the reference shows — you can see how much
              conversation there is before scrolling through it. */}
          <p className="pb-1 text-xs font-semibold text-muted-foreground">
            {(replies.data ?? []).length} {(replies.data ?? []).length === 1 ? "reply" : "replies"}
          </p>
          {(replies.data ?? []).map((m) => (
            <MessageRow key={m.id} message={m} isMine={m.authorId === auth.user?.id}
              meUserId={auth.user?.id ?? null} canPin={false} compact
              onReact={(emoji, mine) => actions.react.mutate({ messageId: m.id, emoji, mine })}
              onReply={() => undefined} onOpenThread={() => undefined}
              onPin={() => undefined}
              onDelete={() => actions.remove.mutate(m.id)}
              onEdit={(bodyText) => actions.edit.mutate({ messageId: m.id, bodyText })} />
          ))}
        </>)}
      </div>

      <Composer name="this thread" placeholder="Reply in thread…" draftKey={`thread:${rootId}`} sending={sender.send.isPending} error={error}
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

/**
 * What the Files, Pins and Members tabs show.
 *
 * Each is a view of the SAME conversation — no separate store, no second
 * membership. Files are the attachments already on its messages, pins are the
 * messages already pinned in it, and members are its members. Opening one of
 * these and clicking a row takes you back to the message it came from, which
 * is the point of having them: they are a way to find a message, not a place
 * to keep things.
 */
function ChannelTabPanel({
  tab, channelId, pinned, files, openToScope, onOpenThread,
}: {
  tab: Exclude<ChannelTab, "messages">;
  channelId: string;
  pinned: RichMessage[];
  files: ReturnType<typeof useChannelFiles>;
  openToScope: boolean;
  onOpenThread: (messageId: number) => void;
}) {
  /* `channel_mentionable` IS the member list with names on it, and the
     composer has already fetched and cached it — so the Members tab costs no
     request at all (rule 14). `channel_members` carries ids only. */
  const members = useChannelMentionable(channelId);
  const managers = useChannelMembers(tab === "members" ? channelId : null);
  const managerIds = new Set((managers.data ?? []).filter((m) => m.isManager).map((m) => m.userId));

  const Empty = ({ children }: { children: ReactNode }) => (
    <p className="py-10 text-center text-sm text-muted-foreground">{children}</p>
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      {tab === "files" && (
        files.isPending ? (
          <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
        ) : files.isError ? (
          <p role="alert" className="py-10 text-center text-sm text-status-danger">
            We couldn't load the files in this conversation.
          </p>
        ) : (files.data ?? []).length === 0 ? (
          <Empty>Nothing has been shared here yet. Files attached to a message appear here.</Empty>
        ) : (
          <ul className="space-y-1">
            {(files.data ?? []).map((f) => (
              <li key={f.id}>
                <button type="button" onClick={() => onOpenThread(f.messageId)}
                  className="flex w-full items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{f.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {f.authorName ?? "Someone"} · {formatDate(f.createdAt)}
                      {f.sizeBytes ? ` · ${Math.max(Math.round(f.sizeBytes / 1024), 1)} KB` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}

      {tab === "pins" && (
        pinned.length === 0 ? (
          <Empty>Nothing is pinned. Pin a message to keep it here.</Empty>
        ) : (
          <ul className="space-y-1">
            {pinned.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => onOpenThread(m.id)}
                  className="flex w-full items-start gap-2.5 rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-semibold text-foreground">
                      {m.authorName} · {formatDate(m.createdAt)}
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">{m.bodyText}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}

      {tab === "members" && (
        members.isPending ? (
          <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
        ) : (members.data ?? []).length === 0 ? (
          <Empty>
            {openToScope
              /* Not "no members" — an open conversation has no member rows
                 BECAUSE everybody in scope is already in it. */
              ? "This conversation is open to everyone with access, so it has no member list."
              : "Nobody has been added yet."}
          </Empty>
        ) : (
          <ul className="space-y-1">
            {(members.data ?? []).map((p) => (
              <li key={p.userId}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                <Avatar name={p.name} size="sm" className="h-7 w-7" />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{p.name}</span>
                {managerIds.has(p.userId) && (
                  <span className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Manager
                  </span>
                )}
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
