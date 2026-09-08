/**
 * Communication — one central space, many authorized surfaces.
 *
 * ── THE PRODUCT PRINCIPLE THIS SCREEN EXISTS TO KEEP ───────────────────────
 *
 * Dee, 2026-09-08 §45: "ONE CENTRAL BES COMMUNICATION SPACE. A conversation
 * has ONE canonical record. It may be visible through different authorized
 * contexts. Visibility follows membership, assignment, share, scope, RLS —
 * not duplication. The same reply should never need to be copied into Slack,
 * WhatsApp, Teams, Partner Portal, Organization Portal, Agency HQ for BES to
 * know what happened."
 *
 * So this screen does almost nothing. It asks `visible_channels()` for
 * everything the caller may reach and sorts the answer into groups. There is
 * no per-owner query, no filtering for privacy, no "if agency then". Delete
 * this file and nobody's access changes by one row — which is the test of
 * whether the rule is in the right place.
 *
 * ── WHAT IT DOES ADD ───────────────────────────────────────────────────────
 *
 * Honesty about the boundary, in three places:
 *
 *   A conversation an ADMINISTRATOR can inspect but is not part of appears
 *   under Administration and says so (§17). It is never mixed into their own
 *   conversations and never counted as unread, because being able to read
 *   something is not the same as owing it a reply.
 *
 *   A shared organization channel is labelled, above the conversation, because
 *   somebody typing there deserves to know BES can read it.
 *
 *   A message from BES is labelled, because "who am I talking to" should never
 *   be a guess.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Archive, ArchiveRestore, Hash, Loader2, Lock, Plus, Search, Settings2,
  ShieldAlert, Users, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAgency } from "@/lib/agency-context";
import { useAuth } from "@/lib/auth/auth-context";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { formatDate } from "@/lib/format-date";
import {
  useChannelActions, useChannels, useMarkRead, useMessageSearch,
} from "@/lib/data/use-channels";
import type { Channel } from "@/lib/data/channels";
import { ConversationPane } from "@/components/communication/ConversationPane";
import { ChannelPeoplePanel } from "@/components/communication/ChannelPeoplePanel";
import { NewChannelForm } from "@/components/communication/NewChannelForm";
import { StartDirectMessage } from "@/components/communication/StartDirectMessage";
import { groupChannels } from "@/lib/communication/channel-groups";
import { cn } from "@/lib/utils";

export default function Channels() {
  const { activeOrganization, viewMode } = useAgency();
  const auth = useAuth();
  const perms = useAgencyPermissions();
  const agencyView = viewMode === "agency";
  const channels = useChannels();
  const actions = useChannelActions();
  const markRead = useMarkRead();

  /* `?channel=` is how a partner record opens its own conversation. Read once
     and then dropped from the URL, so a later click in the list is not dragged
     back to it on the next render. */
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(params.get("channel"));
  useEffect(() => {
    const requested = params.get("channel");
    if (!requested) return;
    setOpenId(requested);
    const next = new URLSearchParams(params);
    next.delete("channel");
    setParams(next, { replace: true });
  }, [params, setParams]);

  const [creating, setCreating] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const [query, setQuery] = useState("");
  const search = useMessageSearch(query);

  const list = channels.data ?? [];
  const groups = useMemo(() => groupChannels(list), [list]);

  const current = useMemo(() => {
    const live = list.filter((c) => !c.archivedAt);
    return list.find((c) => c.id === openId)
      ?? live.find((c) => c.kind === "general")
      ?? live[0] ?? null;
  }, [list, openId]);

  /* Opening a conversation marks it read. Not on every render — only when the
     open conversation changes and there is actually something unread, so a
     person reading one channel does not write a row per keystroke. */
  useEffect(() => {
    if (current && current.unread > 0 && !current.auditOnly) {
      markRead.mutate(current.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, current?.unread]);

  if (channels.isLoading) {
    return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const owner = agencyView
    ? { agencyId: auth.agencyId ?? null, organizationId: null }
    : { agencyId: null, organizationId: activeOrganization?.id ?? null };
  const canCreate = agencyView ? perms.can("communication.manage") : true;

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-[1600px] flex-col gap-4 p-4 md:flex-row md:p-6">
      <aside className="flex w-full shrink-0 flex-col md:w-72">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h1 className="text-sm font-bold text-foreground">Communication</h1>
          {canCreate && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
              onClick={() => setCreating((v) => !v)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New
            </Button>
          )}
        </div>

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-8 pl-8 pr-7" value={query} aria-label="Search messages"
            placeholder="Search messages" onChange={(e) => setQuery(e.target.value)} />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {creating && canCreate && (
          <NewChannelForm owner={owner} agencyView={agencyView}
            onDone={() => setCreating(false)}
            onCreated={(id) => { setOpenId(id); setCreating(false); }} />
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {agencyView && query.trim().length < 2 && (
            <StartDirectMessage onOpened={setOpenId} />
          )}
          {query.trim().length >= 2 ? (
            <SearchResults
              loading={search.isLoading}
              hits={search.data ?? []}
              onOpen={(channelId) => { setOpenId(channelId); setQuery(""); }}
            />
          ) : (
            <>
              {groups.map((group) => (
                <div key={group.label} className="mb-3">
                  <p className="mb-1 flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {group.key === "administration" && <ShieldAlert className="h-3 w-3 text-amber-600" />}
                    {group.label}
                  </p>
                  {group.key === "administration" && (
                    /* Said once, at the top of the group, rather than implied.
                       These are not this person's conversations. */
                    <p className="mb-1 px-1 text-[10px] leading-snug text-muted-foreground">
                      You can read these for administration. You are not in them and cannot reply.
                    </p>
                  )}
                  <ul className="space-y-0.5">
                    {group.channels.map((c) => (
                      <li key={c.id}>
                        <ChannelRow channel={c} active={current?.id === c.id}
                          onOpen={() => setOpenId(c.id)} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {list.length === 0 && (
                <p className="px-1 text-xs text-muted-foreground">
                  You are not in any conversation yet.
                </p>
              )}
            </>
          )}
        </div>
      </aside>

      <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card">
        {!current ? (
          <p className="p-6 text-sm text-muted-foreground">Pick a conversation.</p>
        ) : current.auditOnly ? (
          <AuditOnlyView channel={current} />
        ) : (
          <>
            <div className="flex items-start justify-between gap-2 border-b border-border px-4 pt-3">
              <div className="min-w-0 flex-1">
                <ConversationHeaderExtras channel={current} />
              </div>
              <div className="flex shrink-0 items-center gap-1 pb-2">
                {current.isManager && !current.archivedAt && (
                  <>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                      aria-pressed={showPeople}
                      onClick={() => setShowPeople((v) => !v)}>
                      <Settings2 className="mr-1 h-3.5 w-3.5" /> People
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                      onClick={() => actions.archive.mutate(current.id)}>
                      <Archive className="mr-1 h-3.5 w-3.5" /> Archive
                    </Button>
                  </>
                )}
                {current.isManager && current.archivedAt && (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                    onClick={() => actions.restore.mutate(current.id)}>
                    <ArchiveRestore className="mr-1 h-3.5 w-3.5" /> Restore
                  </Button>
                )}
              </div>
            </div>

            {showPeople && current.isManager && (
              <ChannelPeoplePanel channel={current} onClose={() => setShowPeople(false)} />
            )}

            <ConversationPane
              channelId={current.id}
              name={current.displayName}
              purpose={current.purpose}
              canPin={current.isManager}
              organizationId={current.organizationId}
              readOnly={!!current.archivedAt}
              readOnlyReason="This conversation is archived. Its history is kept; nobody can add to it."
              notice={
                current.sharedWithBes ? (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-amber-700">
                    <Users className="h-3.5 w-3.5" />
                    Shared with the BES team while your service is active. They can read and reply here.
                  </p>
                ) : null
              }
            />
          </>
        )}
      </section>
    </div>
  );
}

/** Where the conversation sits, said above it rather than guessed from a name. */
function ConversationHeaderExtras({ channel }: { channel: Channel }) {
  const context = channel.partnerName ?? channel.organizationName;
  return (
    <div className="pb-1">
      <p className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        {context && <span className="font-semibold text-foreground">{context}</span>}
        {channel.serviceName && (
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-bold text-primary">
            {channel.serviceName}
          </span>
        )}
        {channel.openToScope ? (
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3" /> Everyone with access
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <Lock className="h-3 w-3" /> Members and teams only
          </span>
        )}
        {channel.archivedAt && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 font-bold text-muted-foreground">
            Archived {formatDate(channel.archivedAt)}
          </span>
        )}
      </p>
    </div>
  );
}

/**
 * A conversation an administrator may inspect.
 *
 * Read-only, and labelled as administration rather than presented as theirs.
 * Dee, §17: "Do not silently insert Admin into the conversation. If
 * administrative audit access exists, label it as such."
 */
function AuditOnlyView({ channel }: { channel: Channel }) {
  return (
    <>
      <header className="border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <ShieldAlert className="h-4 w-4 text-amber-600" /> {channel.displayName}
        </h2>
        <p className="mt-1 text-[11px] font-semibold text-amber-700">
          Administrative access. You are not a member of this conversation and cannot post in it.
          {channel.partnerName && ` Partner: ${channel.partnerName}.`}
        </p>
      </header>
      <ConversationPane
        channelId={channel.id}
        name={channel.displayName}
        purpose={channel.purpose}
        readOnly
        readOnlyReason="You are reading this for administration. Ask to be added if you need to take part."
        hideHeader
      />
    </>
  );
}

function ChannelRow({
  channel, active, onOpen,
}: { channel: Channel; active: boolean; onOpen: () => void }) {
  const context = channel.partnerName ?? channel.organizationName;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        active
          ? "bg-primary/10 font-semibold text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        channel.archivedAt && "opacity-70",
      )}
    >
      {channel.auditOnly
        ? <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
        : <Hash className="h-4 w-4 shrink-0" />}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate", channel.unread > 0 && !active && "font-bold text-foreground")}>
          {channel.displayName}
        </span>
        {/* Whose conversation it is. The same row appears in their portal or
            their workspace — naming the owner here is what stops it reading as
            a BES channel that happens to mention them. */}
        {(context || channel.serviceName) && (
          <span className="block truncate text-[10px] text-muted-foreground">
            {[context, channel.serviceName].filter(Boolean).join(" · ")}
          </span>
        )}
      </span>
      {channel.sharedWithBes && (
        <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
          BES
        </span>
      )}
      {channel.unread > 0 && !channel.auditOnly && (
        <span aria-label={`${channel.unread} unread`}
          className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
          {channel.unread}
        </span>
      )}
    </button>
  );
}

/**
 * Search results.
 *
 * Nothing is filtered here. `search_messages` is SECURITY INVOKER and narrowed
 * to `channel_visible`, so a conversation this person cannot reach produces no
 * row, no snippet and no channel name (§24). An empty result for a real
 * message somebody else can see is the correct answer, not a bug.
 */
function SearchResults({
  loading, hits, onOpen,
}: {
  loading: boolean;
  hits: { messageId: number; channelId: string; channelName: string; authorName: string; bodyText: string; createdAt: string }[];
  onOpen: (channelId: string) => void;
}) {
  if (loading) return <p className="px-1 py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></p>;
  if (hits.length === 0) {
    return <p className="px-1 py-2 text-xs text-muted-foreground">
      Nothing in the conversations you can see.
    </p>;
  }
  return (
    <ul className="space-y-1">
      {hits.map((h) => (
        <li key={h.messageId}>
          <button type="button" onClick={() => onOpen(h.channelId)}
            className="w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-xs font-semibold text-foreground">{h.channelName}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">{formatDate(h.createdAt)}</span>
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
              {h.authorName}: {h.bodyText}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
