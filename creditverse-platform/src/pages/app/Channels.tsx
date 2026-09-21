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
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Archive, ArchiveRestore, Building2, Hash, Loader2, Lock, MessagesSquare, Paperclip, Plus, Search, Settings2, UserRound,
  ShieldAlert, Users, X,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAgency } from "@/lib/agency-context";
import { useAuth } from "@/lib/auth/auth-context";
import { useAgencyPermissions } from "@/lib/data/agency-permissions";
import { formatDate } from "@/lib/format-date";
import {
  useChannelActions, useChannels, useMarkRead,
} from "@/lib/data/use-channels";
import {
  useCommunicationSearch, type SearchKind,
} from "@/lib/data/communication-home";
import type { Channel } from "@/lib/data/channels";
import { ConversationPane } from "@/components/communication/ConversationPane";
import { ChannelPeoplePanel } from "@/components/communication/ChannelPeoplePanel";
import { NewChannelForm } from "@/components/communication/NewChannelForm";
import { NewConversationMenu } from "@/components/communication/NewConversationMenu";
import { glyphFor, groupChannels, totalUnread } from "@/lib/communication/channel-groups";
import {
  CommunicationHome, HOME_ITEMS, type HomeView,
} from "@/components/communication/CommunicationHome";
import { ConversationGroup } from "@/components/communication/ConversationRail";
import { PartnerContextPanel } from "@/components/communication/PartnerContextPanel";
import { useFoldedSections } from "@/lib/communication/use-folded-sections";
import { usePanelWidth } from "@/lib/agency/use-panel-width";
import { PanelResizer } from "@/components/dashboard/PanelResizer";
import { cn } from "@/lib/utils";

/* Both columns remember their width per person. The minimums are the "fixed
   space" Dee asked for: a rail below 220px stops showing a conversation's
   name, and a thread below 280px wraps every reply to three words — so
   neither can be dragged out of existence, only made smaller. */
const RAIL = { min: 220, max: 480, base: 288 };
const ASIDE = { min: 280, max: 620, base: 384 };

export default function Channels() {
  const { activeOrganization, viewMode } = useAgency();
  const auth = useAuth();
  const perms = useAgencyPermissions();
  const agencyView = viewMode === "agency";
  const channels = useChannels();
  const actions = useChannelActions();
  const markRead = useMarkRead();

  /* WHAT IS OPEN LIVES IN THE URL, and that is a mobile fix.
     `?channel=` was read once and then stripped, with the open conversation
     held in component state. On a phone that produced two failures Dee hit in
     the installed PWA (2026-09-21): the Android back gesture left FullSuite
     entirely instead of returning to the list, because opening a conversation
     pushed no history entry — and "All conversations" did nothing, because
     the main pane fell back to the first channel whenever nothing was
     explicitly open, so the list could never be the screen.
     One source of truth fixes both: opening pushes a history entry, so the
     system back button and the in-app Back are the same act, and a deep link
     from a partner record still works. */
  const [params, setParams] = useSearchParams();
  const openId = params.get("channel");
  const isMobile = useIsMobile();
  const setPane = (next: { channel?: string | null; home?: string | null }) => {
    const p = new URLSearchParams(params);
    if (next.channel !== undefined) { if (next.channel) p.set("channel", next.channel); else p.delete("channel"); }
    if (next.home !== undefined) { if (next.home) p.set("home", next.home); else p.delete("home"); }
    /* A push, not a replace: the phone's back button is how people leave a
       conversation, and it can only work if opening one was a navigation. */
    setParams(p);
  };

  const { folded, toggle: toggleSection } = useFoldedSections();
  /* HOME and a conversation are the same slot. Opening either closes the
     other, so the main pane always has exactly one occupant — and both live
     in the URL, so both answer the back button. */
  const homeParam = params.get("home");
  const homeView = (HOME_ITEMS.some((i) => i.key === homeParam) ? homeParam : null) as HomeView | null;
  const setHomeView = (view: HomeView | null) => setPane({ home: view, channel: null });
  /* Column 4. Off by default — Dee asked for it "optional", and a panel that
     is always there costs width on every conversation that has no partner. */
  const [showContext, setShowContext] = useState(false);
  const openChannel = (id: string) => setPane({ channel: id, home: null });
  const closeChannel = () => setPane({ channel: null });
  const [creating, setCreating] = useState(false);
  const railWidth = usePanelWidth({
    id: "communication-rail", userId: auth.user?.id ?? null,
    defaultWidth: RAIL.base, min: RAIL.min, max: RAIL.max,
  });
  const [showPeople, setShowPeople] = useState(false);
  const [query, setQuery] = useState("");
  const search = useCommunicationSearch(query);

  /* Its own memo: `channels.data ?? []` is a new array on every render, so
     three separate useMemos downstream recomputed every time and none of them
     could ever hit. */
  const list = useMemo(() => channels.data ?? [], [channels.data]);
  const groups = useMemo(() => groupChannels(list), [list]);
  const waiting = useMemo(() => totalUnread(list), [list]);

  /* A desktop pane needs an occupant, so it falls back to a sensible default.
     A PHONE MUST NOT: the fallback is exactly what made the conversation list
     unreachable, because "nothing open" still resolved to a conversation and
     the list stayed hidden behind it. */
  const current = useMemo(() => {
    const live = list.filter((c) => !c.archivedAt);
    const chosen = list.find((c) => c.id === openId) ?? null;
    if (chosen) return chosen;
    if (isMobile || homeView) return null;
    return live.find((c) => c.kind === "general") ?? live[0] ?? null;
  }, [list, openId, isMobile, homeView]);

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
  /*
   * `communication.channels.create`, not `communication.manage`.
   *
   * 0209 renamed the key and deleted the old one; this line kept asking for the
   * deleted name. An unknown key is not refused by the resolver — it falls
   * through to "owner or administrator by role", so New conversation has been
   * permanently admin-only and could not be granted to anybody, because the key
   * it asked for no longer existed to grant.
   */
  const canCreate = agencyView ? perms.can("communication.channels.create") : true;

  return (
    /* `dvh`, not `vh`: on Android the URL bar collapses and `100vh` keeps the
       old, taller viewport, which pushed the composer under the browser
       chrome. `pb-[env(safe-area-inset-bottom)]` keeps it clear of the home
       indicator in the installed PWA. */
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-[1600px] flex-col gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:flex-row md:p-6">
      {/* Phone: the list OR the conversation, never both squeezed side by side
          (Dee's mobile standard §26). Tablet and up: the two panes. */}
      <aside aria-label="Conversations"
        /* Dee, 2026-09-17: "allow the user to adjust the column just like how
           we can adjust the menu sidebar size… leave a fix space so the entire
           column wont be hidden." The minimum is that fixed space — the rail
           cannot be dragged away, only narrowed to where it still reads. */
        /* A CSS variable rather than an inline width, so the phone keeps
           `w-full` and only md upwards uses the dragged size. */
        style={{ "--rail-w": `${railWidth.width}px` } as React.CSSProperties}
        className={cn(
          "relative w-full shrink-0 flex-col md:flex md:w-[var(--rail-w)]",
          railWidth.dragging ? "" : "transition-[width] duration-150",
          current || homeView ? "hidden" : "flex",
        )}>
        {/* The handle sits on the rail's right edge, hidden on a phone where
            the rail IS the screen. */}
        <div className="absolute inset-y-0 right-0 hidden md:block">
          <PanelResizer
            label="Resize the conversation list"
            dragging={railWidth.dragging}
            onPointerDown={railWidth.onPointerDown}
            onNudge={(d) => railWidth.setWidth(railWidth.width + d)}
            onReset={railWidth.reset}
          />
        </div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h1 className="text-sm font-bold text-foreground">Communication</h1>
          {/* New asks WHAT kind first — a direct message, a group chat or a
              channel. Starting a conversation is not gated; only creating a
              CHANNEL needs communication.channels.create. */}
          {agencyView && (
            <NewConversationMenu
              canCreateChannel={canCreate}
              onChannel={() => setCreating(true)}
              onOpened={openChannel}
            />
          )}
          {!agencyView && canCreate && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
              onClick={() => setCreating((v) => !v)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New
            </Button>
          )}
        </div>

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-8 pl-8 pr-7" value={query} aria-label="Search conversations, people, files"
            placeholder="Search conversations, people, files" onChange={(e) => setQuery(e.target.value)} />
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
            onCreated={(id) => { openChannel(id); setCreating(false); }} />
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {query.trim().length < 2 && (
            <nav aria-label="Home" className="mb-3">
              <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Home
              </p>
              <ul className="space-y-0.5">
                {HOME_ITEMS.map((item) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => setHomeView(item.key)}
                      aria-current={homeView === item.key ? "page" : undefined}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        homeView === item.key
                          ? "bg-primary/10 font-semibold text-foreground"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted/70">
                        <item.icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {/* Only Inbox carries a count — it is the only one whose
                          number is already known without another request. */}
                      {item.key === "inbox" && waiting > 0 && (
                        <span aria-label={`${waiting} unread`}
                          className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground">
                          {waiting > 99 ? "99+" : waiting}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          {query.trim().length >= 2 ? (
            <SearchResults
              query={search}
              onOpen={(channelId) => { openChannel(channelId); setQuery(""); }}
            />
          ) : (
            <>
              {groups.map((group) => (
                <ConversationGroup
                  key={group.key}
                  group={group}
                  activeId={current?.id ?? null}
                  folded={folded}
                  onToggleSection={toggleSection}
                  onOpen={openChannel}
                />
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

      <section className={cn("min-h-0 flex-1 flex-col rounded-xl border border-border bg-card md:flex",
        current || homeView ? "flex" : "hidden")}>
        {/* HOME occupies the same slot as a conversation. Its own heading and a
            way back, because on a phone this IS the whole screen. */}
        {homeView && (
          <>
            <header className="flex h-11 shrink-0 items-center gap-1.5 border-b border-border px-3">
              <button type="button" onClick={() => setHomeView(null)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground md:hidden">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <h2 className="text-sm font-bold text-foreground">
                {HOME_ITEMS.find((i) => i.key === homeView)?.label}
              </h2>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <CommunicationHome view={homeView} channels={list} onOpenChannel={openChannel} />
            </div>
          </>
        )}
        {!homeView && current && (
          <button type="button" onClick={closeChannel}
            /* Tall enough to hit with a thumb, and the only way back on a
               phone besides the system gesture — which now does the same. */
            className="flex h-12 w-full items-center gap-1.5 border-b border-border px-3 text-left text-sm font-semibold text-foreground md:hidden">
            <ArrowLeft className="h-4 w-4 shrink-0" /> All conversations
          </button>
        )}
        {homeView ? null : !current ? (
          /* Dee, §"EMPTY STATES": not a large blank white area. */
          <div className="flex h-full flex-col items-center justify-center gap-1 p-8 text-center">
            <MessagesSquare className="h-6 w-6 text-muted-foreground/60" aria-hidden />
            <p className="text-sm font-semibold text-foreground">Pick a conversation</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Choose one from the list, or open your Inbox to see what is waiting.
            </p>
          </div>
        ) : current.auditOnly ? (
          <AuditOnlyView channel={current} />
        ) : (
          <>
            <div className="flex items-start justify-between gap-2 border-b border-border px-4 pt-3">
              <div className="min-w-0 flex-1">
                <ConversationHeaderExtras channel={current} />
              </div>
              <div className="flex shrink-0 items-center gap-1 pb-2">
                {/* Only where there IS a partner to describe, and only on a
                    screen wide enough for a fourth column. */}
                {current.partnerGroupId && (
                  <Button size="sm" variant="ghost" className="hidden h-7 px-2 text-xs lg:inline-flex"
                    aria-pressed={showContext}
                    onClick={() => setShowContext((v) => !v)}>
                    <Building2 className="mr-1 h-3.5 w-3.5" /> Partner
                  </Button>
                )}
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
              glyph={glyphFor(current)}
              owner={current.partnerName || current.organizationName
                ? { name: (current.partnerName ?? current.organizationName)!, service: current.serviceName }
                : null}
              canPin={current.isManager}
              openToScope={current.openToScope}
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

      {/* Column 4. Only for a partner conversation, only when asked for, and
          hidden on a phone where three columns already do not fit. */}
      {!homeView && current?.partnerGroupId && showContext && (
        <div className="hidden lg:flex">
          <PartnerContextPanel
            groupId={current.partnerGroupId}
            partnerId={current.partnerGroupId}
            onClose={() => setShowContext(false)}
          />
        </div>
      )}
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


/**
 * Search results.
 *
 * Nothing is filtered here. `search_messages` is SECURITY INVOKER and narrowed
 * to `channel_visible`, so a conversation this person cannot reach produces no
 * row, no snippet and no channel name (§24). An empty result for a real
 * message somebody else can see is the correct answer, not a bug.
 */
/**
 * Results, grouped by what they are.
 *
 * Dee: "Search should support messages, people, channels, Partners,
 * attachments. Results should jump directly to the message/conversation."
 *
 * A person and a partner are not conversations, so they carry no channel to
 * open and are shown as answers rather than links — better than a row that
 * looks clickable and goes nowhere.
 */
const HIT_LABEL: Record<SearchKind, string> = {
  message: "Messages", channel: "Conversations", person: "People",
  partner: "Partners", file: "Files",
};
const HIT_ORDER: SearchKind[] = ["message", "channel", "person", "partner", "file"];
const HIT_ICON: Record<SearchKind, typeof Hash> = {
  message: MessagesSquare, channel: Hash, person: UserRound,
  partner: Building2, file: Paperclip,
};

function SearchResults({
  query, onOpen,
}: {
  query: ReturnType<typeof useCommunicationSearch>;
  onOpen: (channelId: string) => void;
}) {
  if (query.isPending) {
    return <p className="px-1 py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></p>;
  }
  if (query.isError) {
    return <p className="px-1 py-2 text-xs text-muted-foreground" role="status">
      Search could not run just now. Refresh to try again.
    </p>;
  }
  const hits = query.data ?? [];
  if (hits.length === 0) {
    return <p className="px-1 py-2 text-xs text-muted-foreground">
      Nothing you can see matches that.
    </p>;
  }
  return (
    <div className="space-y-3">
      {HIT_ORDER.filter((k) => hits.some((h) => h.kind === k)).map((kind) => {
        const Icon = HIT_ICON[kind];
        return (
          <section key={kind}>
            <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {HIT_LABEL[kind]}
            </p>
            <ul className="space-y-0.5">
              {hits.filter((h) => h.kind === kind).map((h) => {
                const body = (
                  <>
                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-foreground">{h.title}</span>
                      {h.subtitle && (
                        <span className="block truncate text-[11px] text-muted-foreground">{h.subtitle}</span>
                      )}
                    </span>
                  </>
                );
                return (
                  <li key={`${h.kind}-${h.refId}`}>
                    {h.channelId ? (
                      <button type="button" onClick={() => onOpen(h.channelId!)}
                        className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                        {body}
                      </button>
                    ) : (
                      <div className="flex items-start gap-2 rounded-lg px-2 py-1.5">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
