/**
 * HOME — Inbox, Mentions & Reactions, Saved, Drafts.
 *
 * All four, now that the composer persists what you were typing. Drafts was
 * held back in the first pass because the composer lost its text the moment
 * you clicked another conversation, and an item that opens on nothing every
 * time is worse than an absent one.
 *
 * None of these is a new store, and only one touches the database. Inbox is
 * computed from the channel list the rail already holds; Mentions and Saved
 * are reads over canonical messages; Drafts is this browser's localStorage,
 * because unsent typing on one device is nobody else's record.
 */
import { useMemo, useState } from "react";
import { Bookmark, FileEdit, Inbox as InboxIcon, AtSign, Hash, Search, Star, Users } from "lucide-react";
import { formatDate, formatTimeAgo } from "@/lib/format-date";
import { Input } from "@/components/ui/input";
import { OpsSelect } from "@/components/ui/ops-select";
import { Avatar } from "@/components/common/Avatar";
import { PanelState } from "@/components/common/QueryState";
import { hasRows } from "@/lib/ui/query-rows";
import {
  useCommunicationActivity, useSavedMessages, useToggleSaved,
} from "@/lib/data/communication-home";
import {
  chipCounts, DEFAULT_INBOX_QUERY, filterInbox, INBOX_CHIPS, type InboxChip, type InboxQuery,
} from "@/lib/communication/inbox";
import { listDrafts } from "@/lib/communication/drafts";
import type { Channel } from "@/lib/data/channels";
import { cn } from "@/lib/utils";

export type HomeView = "inbox" | "activity" | "saved" | "drafts";

export const HOME_ITEMS: { key: HomeView; label: string; icon: typeof InboxIcon }[] = [
  { key: "inbox", label: "Inbox", icon: InboxIcon },
  { key: "activity", label: "Mentions & reactions", icon: AtSign },
  { key: "saved", label: "Saved", icon: Bookmark },
  { key: "drafts", label: "Drafts", icon: FileEdit },
];

const Empty = ({ icon: Icon, title, detail }: { icon: typeof InboxIcon; title: string; detail: string }) => (
  <div className="flex h-full flex-col items-center justify-center gap-1 p-8 text-center">
    <Icon className="h-6 w-6 text-muted-foreground/60" aria-hidden />
    <p className="text-sm font-semibold text-foreground">{title}</p>
    <p className="max-w-xs text-xs text-muted-foreground">{detail}</p>
  </div>
);

/** One tappable line, shared by all three views so they read as one surface. */
const Line = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick}
    className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
    {children}
  </button>
);

/* The chip a person left the Inbox on is theirs to keep, on this device.
   Browser storage can be absent or refuse; the Inbox works either way. */
const CHIP_KEY = "bes.communication.inbox.chip";
const readChip = (): InboxChip => {
  try {
    const v = localStorage.getItem(CHIP_KEY);
    return INBOX_CHIPS.some((c) => c.key === v) ? (v as InboxChip) : DEFAULT_INBOX_QUERY.chip;
  } catch { return DEFAULT_INBOX_QUERY.chip; }
};
const rememberChip = (chip: InboxChip) => { try { localStorage.setItem(CHIP_KEY, chip); } catch { /* per-viewer convenience only */ } };

const KIND_LABEL = (c: Channel) => c.kind === "direct" ? "Direct message" : c.partnerGroupId ? "Partner" : c.organizationId ? "Organization" : "Channel";

/**
 * The Inbox list to Dee's 2026-09-21 mockup: chips Unread · All · Recent ·
 * Starred, a kind filter, a sort and a search, then one row per conversation
 * with who wrote last and what they said. Everything is the conversation
 * summary the rail already loaded — nothing here fetches (see inbox.ts).
 */
function InboxList({ channels, onOpenChannel }: { channels: readonly Channel[]; onOpenChannel: (channelId: string) => void }) {
  const [query, setQuery] = useState<InboxQuery>(() => ({ ...DEFAULT_INBOX_QUERY, chip: readChip() }));
  const setChip = (chip: InboxChip) => { rememberChip(chip); setQuery((q) => ({ ...q, chip })); };
  const counts = useMemo(() => chipCounts(channels, { kind: query.kind, search: query.search }), [channels, query.kind, query.search]);
  const rows = useMemo(() => filterInbox(channels, query), [channels, query]);
  const narrowed = query.kind !== "all" || query.search.trim() !== "";

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-border px-3 py-2">
        <div role="tablist" aria-label="Inbox view" className="flex flex-wrap gap-1">
          {INBOX_CHIPS.map((c) => {
            const active = query.chip === c.key;
            return (
              <button key={c.key} type="button" role="tab" aria-selected={active} onClick={() => setChip(c.key)}
                className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  active ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                {c.label}
                {counts[c.key] > 0 && (
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none",
                    active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{counts[c.key]}</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OpsSelect aria-label="Conversation kind" size="sm" value={query.kind} onValueChange={(v) => setQuery({ ...query, kind: v as InboxQuery["kind"] })}
            options={[{ value: "all", label: "All kinds" }, { value: "channels", label: "Channels" }, { value: "partners", label: "Partners" }, { value: "direct", label: "Direct messages" }]} />
          <OpsSelect aria-label="Sort" size="sm" value={query.sort} onValueChange={(v) => setQuery({ ...query, sort: v as InboxQuery["sort"] })}
            options={[{ value: "newest", label: "Newest" }, { value: "unread", label: "Most unread" }, { value: "name", label: "Name" }]} />
          <label className="relative min-w-[10rem] flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={query.search} onChange={(e) => setQuery({ ...query, search: e.target.value })} placeholder="Search conversations…" aria-label="Search conversations" className="h-8 pl-7 text-sm" />
          </label>
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty icon={InboxIcon}
          title={narrowed ? "No conversations match" : query.chip === "unread" ? "You're all caught up" : query.chip === "starred" ? "Nothing starred" : "Nothing here yet"}
          detail={narrowed ? "Try another kind, or clear the search." : query.chip === "unread" ? "Nothing is waiting on you." : query.chip === "starred" ? "Star a conversation from the rail to keep it here." : "Conversations you are part of appear here as they arrive."} />
      ) : (
        <ul className="space-y-0.5 p-2">
          {rows.map((c) => {
            const waiting = c.unread > 0;
            return (
              <li key={c.id}>
                <Line onClick={() => onOpenChannel(c.id)}>
                  {c.kind === "direct" ? (
                    <Avatar name={c.displayName} size="sm" className="mt-0.5 h-8 w-8 text-[10px]" />
                  ) : (
                    <span aria-hidden className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", c.partnerGroupId ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                      {c.partnerGroupId ? <span className="text-sm font-bold">{c.displayName.slice(0, 1).toUpperCase()}</span> : c.kind === "department" ? <Users className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className={cn("min-w-0 flex-1 truncate text-sm", waiting ? "font-bold text-foreground" : "font-medium text-foreground")}>{c.displayName}</span>
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{KIND_LABEL(c)}</span>
                      {c.favourite && <Star className="h-3 w-3 shrink-0 fill-current text-amber-500" aria-label="Starred" />}
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{formatTimeAgo(c.lastMessageAt)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className={cn("min-w-0 flex-1 truncate text-[12px]", waiting ? "text-foreground" : "text-muted-foreground")}>
                        {c.lastMessageText
                          ? <>{c.lastMessageAuthor && <span className="font-medium">{c.lastMessageAuthor}: </span>}{c.lastMessageText}</>
                          : c.lastMessageAt ? formatDate(c.lastMessageAt.slice(0, 10)) : "No messages yet"}
                      </span>
                      {waiting && (
                        <span aria-label={`${c.unread} unread`} className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground">{c.unread}</span>
                      )}
                    </span>
                  </span>
                </Line>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function CommunicationHome({
  view, channels, onOpenChannel,
}: {
  view: HomeView;
  channels: readonly Channel[];
  onOpenChannel: (channelId: string) => void;
}) {
  const activity = useCommunicationActivity();
  const saved = useSavedMessages();
  const unsave = useToggleSaved();

  if (view === "inbox") {
    return <InboxList channels={channels} onOpenChannel={onOpenChannel} />;
  }

  if (view === "activity") {
    if (!hasRows(activity)) {
      return (
        <div className="h-full">
          <PanelState query={activity} empty={
            <Empty icon={AtSign} title="No mentions or reactions yet"
              detail="When somebody @mentions you, or reacts to something you wrote, it appears here." />
          } />
        </div>
      );
    }
    return (
      <ul className="space-y-0.5 p-3">
        {(activity.data ?? []).map((a) => (
          <li key={`${a.kind}-${a.messageId}-${a.actorId}-${a.emoji ?? ""}`}>
            <Line onClick={() => onOpenChannel(a.channelId)}>
              <Avatar name={a.actorName} size="sm" className="mt-0.5 h-6 w-6 text-[9px]" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-foreground">
                  <span className="font-semibold">{a.actorName}</span>{" "}
                  {a.kind === "mention"
                    ? "mentioned you"
                    : <>reacted <span aria-hidden>{a.emoji}</span></>}
                  <span className="text-muted-foreground"> in {a.channelName}</span>
                </span>
                {a.bodyText && (
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{a.bodyText}</span>
                )}
                <span className="block text-[10px] text-muted-foreground">
                  {formatDate(a.happenedAt.slice(0, 10))}
                </span>
              </span>
            </Line>
          </li>
        ))}
      </ul>
    );
  }

  if (view === "drafts") {
    const drafts = listDrafts();
    if (drafts.length === 0) {
      return <Empty icon={FileEdit} title="No drafts"
        detail="Anything you start typing and leave unsent is kept here, on this device." />;
    }
    const nameOf = (id: string) =>
      channels.find((c) => c.id === id)?.displayName ?? "A conversation you can no longer open";
    return (
      <ul className="space-y-0.5 p-3">
        {drafts.map((d) => (
          <li key={d.channelId}>
            <Line onClick={() => onOpenChannel(d.channelId)}>
              <FileEdit className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {nameOf(d.channelId)}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{d.text}</span>
                <span className="block text-[10px] text-muted-foreground">
                  Saved {formatDate(d.savedAt.slice(0, 10))}
                </span>
              </span>
            </Line>
          </li>
        ))}
      </ul>
    );
  }

  if (!hasRows(saved)) {
    return (
      <div className="h-full">
        <PanelState query={saved} empty={
          <Empty icon={Bookmark} title="Nothing saved"
            detail="Save a message from its hover menu to keep it here." />
        } />
      </div>
    );
  }
  return (
    <ul className="space-y-0.5 p-3">
      {(saved.data ?? []).map((s) => (
        <li key={s.messageId} className="group flex items-start gap-1">
          <Line onClick={() => onOpenChannel(s.channelId)}>
            <Bookmark className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-foreground">
                <span className="font-semibold">{s.authorName}</span>
                <span className="text-muted-foreground"> in {s.channelName}</span>
              </span>
              {s.bodyText && (
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{s.bodyText}</span>
              )}
              <span className="block text-[10px] text-muted-foreground">
                Saved {formatDate(s.savedAt.slice(0, 10))}
              </span>
            </span>
          </Line>
          <button type="button" aria-label={`Remove ${s.authorName}'s message from Saved`}
            onClick={() => unsave.mutate({ messageId: s.messageId, saved: true })}
            className="mt-2 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary group-hover:opacity-100">
            <Bookmark className="h-3.5 w-3.5 fill-current" />
          </button>
        </li>
      ))}
    </ul>
  );
}
