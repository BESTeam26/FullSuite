/**
 * The partner's Messages page.
 *
 * Dee, 2026-09-13: "DMs and channels — general, creditops, marketing, support
 * ... and the partner must be able to start the first conversation."
 *
 * ── WHAT CHANGED, AND WHAT DELIBERATELY DID NOT ─────────────────────────────
 *
 * What changed is that the partner is no longer waiting. The page used to say
 * "your BES contact will open one", which made the one screen whose job is
 * being reachable depend on somebody at BES remembering to open a door.
 *
 * What did not change is the conversation itself. `ConversationPane` is the
 * same component the BES Communication screen uses — threads in a right-side
 * drawer, mentions, reactions, attachments, unread, realtime — because two
 * copies of a message list is how one exchange ends up looking like two
 * different exchanges depending on who is reading it (0191: ONE record per
 * conversation, even DMs and portal messages).
 *
 * ── WHAT IS FETCHED ─────────────────────────────────────────────────────────
 *
 * The conversation list (one call, shared with the portal shell's unread
 * badge), the live engagements (one call, shared with the Services page) and
 * the account team (one call). The open conversation's messages are fetched by
 * the pane, and nothing else is — a partner with six conversations loads one.
 */
import { useMemo, useState } from "react";
import { Hash, Loader2, MessagesSquare, Plus, UserRound } from "lucide-react";
import { ConversationPane } from "@/components/communication/ConversationPane";
import { useChannels } from "@/lib/data/use-channels";
import {
  useMyPartnerServices, useMyPartnerTeam, usePartnerConversationActions,
} from "@/lib/data/use-portal-conversations";
import { topicsToShow, type PortalTopicKey } from "@/lib/portal/portal-conversations";
import { serviceIsLive, type ServiceStatus } from "@/lib/partners/partner-account";
import { cn } from "@/lib/utils";
import { PageLoadError } from "@/components/common/QueryState";

/** A row in the left rail, whether or not it exists in the database yet. */
interface Entry {
  key: string;
  label: string;
  hint: string | null;
  channelId: string | null;
  unread: number;
  /** Pressed when the conversation has not been opened before. */
  start: (() => void) | null;
}

function Rail({
  title, entries, selected, onSelect, busy, empty,
}: {
  title: string;
  entries: Entry[];
  selected: string | null;
  onSelect: (e: Entry) => void;
  busy: boolean;
  empty?: string;
}) {
  return (
    <div className="mb-3">
      <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {entries.length === 0 && empty ? (
        <p className="px-1 pb-1 text-[11px] text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-0.5">
          {entries.map((e) => {
            const active = selected === e.key;
            return (
              <li key={e.key}>
                <button
                  type="button"
                  disabled={busy && !e.channelId}
                  onClick={() => onSelect(e)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted",
                  )}
                >
                  {e.key.startsWith("dm:")
                    ? <UserRound className={cn("h-3.5 w-3.5 shrink-0", active ? "text-primary-foreground" : "text-muted-foreground")} />
                    : <Hash className={cn("h-3.5 w-3.5 shrink-0", active ? "text-primary-foreground" : "text-muted-foreground")} />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">{e.label}</span>
                    {e.hint && (
                      <span className={cn("block truncate text-[10px]",
                        active ? "text-primary-foreground/80" : "text-muted-foreground")}>
                        {e.hint}
                      </span>
                    )}
                  </span>
                  {e.unread > 0 && !active && (
                    <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                      {e.unread}
                    </span>
                  )}
                  {!e.channelId && (
                    <Plus className={cn("h-3 w-3 shrink-0", active ? "text-primary-foreground" : "text-muted-foreground")} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function PortalMessages({ partnerGroupId }: { partnerGroupId: string }) {
  const channels = useChannels();
  const services = useMyPartnerServices();
  const team = useMyPartnerTeam();
  const actions = usePartnerConversationActions(partnerGroupId);
  const [selected, setSelected] = useState<string | null>(null);
  const busy = actions.openTopic.isPending || actions.openDirect.isPending;

  const mine = useMemo(
    () => (channels.data ?? []).filter((c) => c.partnerGroupId === partnerGroupId && !c.archivedAt),
    [channels.data, partnerGroupId],
  );

  /* Which topics to offer: relevant to a live engagement, plus every one that
     already exists — a conversation is never hidden because the service that
     started it ended (portal-conversations.ts). */
  const topics = useMemo(() => {
    const liveModules = (services.data ?? [])
      .filter((s) => serviceIsLive(s.status.toLowerCase() as ServiceStatus))
      .map((s) => s.module);
    return topicsToShow(liveModules, mine.map((c) => c.partnerTopic).filter(Boolean) as string[]);
  }, [services.data, mine]);

  const topicEntries: Entry[] = topics.map((t) => {
    const existing = mine.find((c) => c.partnerTopic === t.key) ?? null;
    return {
      key: `topic:${t.key}`,
      label: t.label,
      /* The channel's own purpose once it exists — an agent may have said
         something more useful about it than the default ever could. */
      hint: existing?.purpose ?? t.purpose,
      channelId: existing?.id ?? null,
      unread: existing?.unread ?? 0,
      start: existing ? null : () => open(`topic:${t.key}`, () => actions.openTopic.mutateAsync(t.key as PortalTopicKey)),
    };
  });

  /* A direct conversation per person on the account team, whether or not it
     has been used. Somebody the partner may write to but never has is the
     normal case, not an edge one. */
  const directEntries: Entry[] = (team.data ?? []).map((p) => {
    const existing = mine.find((c) => c.kind === "direct" && c.directUserId === p.userId) ?? null;
    return {
      key: `dm:${p.userId}`,
      label: p.name,
      hint: p.roleLabel ?? (p.isPrimary ? "Your BES contact" : null),
      channelId: existing?.id ?? null,
      unread: existing?.unread ?? 0,
      start: existing ? null : () => open(`dm:${p.userId}`, () => actions.openDirect.mutateAsync(p.userId)),
    };
  });

  /* A conversation BES opened that is not one of the four and not a DM — a
     service-scoped one, say. Shown rather than dropped: it is a real
     conversation somebody expects to find here. */
  const otherEntries: Entry[] = mine
    .filter((c) => !c.partnerTopic && c.kind !== "direct")
    .map((c) => ({
      key: `ch:${c.id}`, label: c.displayName, hint: c.serviceName ?? c.purpose,
      channelId: c.id, unread: c.unread, start: null,
    }));

  async function open(key: string, create: () => Promise<string>) {
    try {
      await create();
      setSelected(key);
    } catch {
      /* The mutation carries the error; the rail stays where it was. */
    }
  }

  const all = [...topicEntries, ...directEntries, ...otherEntries];
  /* Default to the conversation with something to read, then the first one. */
  const current = all.find((e) => e.key === selected)
    ?? all.find((e) => e.channelId && e.unread > 0)
    ?? all.find((e) => e.channelId)
    ?? null;

  if (channels.isLoading) {
    return <p className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></p>;
  }
  /* Without this the rail draws its "no conversation yet" copy over a failed
     load, inviting a partner to start a conversation they may already have. */
  if (channels.isError) return <PageLoadError what="Your conversations" />;

  const failure = actions.openTopic.error ?? actions.openDirect.error;

  return (
    <div className="grid gap-3 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="rounded-xl border border-border bg-card p-2">
        <Rail title="Channels" entries={topicEntries} selected={current?.key ?? null}
          busy={busy} onSelect={(e) => (e.channelId ? setSelected(e.key) : e.start?.())} />
        <Rail title="Direct messages" entries={directEntries} selected={current?.key ?? null}
          busy={busy} onSelect={(e) => (e.channelId ? setSelected(e.key) : e.start?.())}
          empty="Your BES team appears here once somebody is assigned to your account." />
        {otherEntries.length > 0 && (
          <Rail title="Other" entries={otherEntries} selected={current?.key ?? null}
            busy={busy} onSelect={(e) => setSelected(e.key)} />
        )}
        {failure && (
          <p role="alert" className="px-1 text-[11px] text-status-danger">
            {(failure as Error).message}
          </p>
        )}
      </aside>

      <section className="flex min-h-[28rem] flex-col overflow-hidden rounded-xl border border-border bg-card">
        {current?.channelId ? (
          <ConversationPane
            key={current.channelId}
            channelId={current.channelId}
            name={current.label}
            purpose={current.hint}
            emptyLabel="No messages yet. Write to your BES team here."
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
            <MessagesSquare className="mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Start a conversation</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Pick a channel on the left and write — BES sees it straight away. Anything about the
              account can go in General; Support is for access, billing and anything that is not
              working.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
