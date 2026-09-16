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
import { Bookmark, FileEdit, Inbox as InboxIcon, AtSign, MessageSquare } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import { Avatar } from "@/components/common/Avatar";
import { PanelState } from "@/components/common/QueryState";
import { hasRows } from "@/lib/ui/query-rows";
import {
  useCommunicationActivity, useSavedMessages, useToggleSaved,
} from "@/lib/data/communication-home";
import { inboxBuckets } from "@/lib/communication/inbox";
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
    const buckets = inboxBuckets(channels).filter((b) => b.channels.length > 0);
    if (buckets.length === 0) {
      return <Empty icon={InboxIcon} title="Nothing in your inbox"
        detail="Conversations you are part of appear here as they arrive." />;
    }
    return (
      <div className="space-y-4 p-3">
        {buckets.map((b) => (
          <section key={b.key}>
            <p className="mb-1 flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {b.label}
              {b.waiting > 0 && (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground">
                  {b.waiting}
                </span>
              )}
            </p>
            <ul className="space-y-0.5">
              {b.channels.slice(0, 12).map((c) => (
                <li key={c.id}>
                  <Line onClick={() => onOpenChannel(c.id)}>
                    <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-sm",
                        c.unread > 0 ? "font-bold text-foreground" : "text-foreground")}>
                        {c.displayName}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {[c.partnerName ?? c.organizationName, c.lastMessageAt
                          ? formatDate(c.lastMessageAt.slice(0, 10)) : "No messages yet"]
                          .filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    {c.unread > 0 && (
                      <span aria-label={`${c.unread} unread`}
                        className="mt-0.5 shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground">
                        {c.unread}
                      </span>
                    )}
                  </Line>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
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
