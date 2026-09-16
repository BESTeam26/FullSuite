/**
 * Column 2 — the conversation rail.
 *
 * Dee, 2026-09-16: *"The information architecture is too flat. Channels, DMs,
 * partner channels, threads and activity all look almost identical. Partner
 * grouping exists, but it still reads like a list of chat rooms."*
 *
 * All true, and all one cause: every row was the same row. A person, a topic,
 * a members-only channel and an audit record each rendered a hash and a name,
 * so the only way to tell them apart was to read the words. Three changes fix
 * that, and none of them is decoration:
 *
 *   A DIRECT MESSAGE IS A FACE. Avatar, not `#`. This is the one Dee named
 *   outright, and it is the difference between scanning for a person and
 *   reading a list.
 *
 *   A PARTNER FOLDS AWAY. Collapsible, and the heading carries the unread and
 *   the last activity of everything inside it — otherwise folding a partner
 *   becomes a way to miss that they are waiting for a reply.
 *
 *   A CHANNEL SAYS WHAT KIND IT IS. Hash for all-hands, lock for members-only,
 *   shield for an audit row you may read but are not in.
 *
 * Grouping itself is NOT decided here. `groupChannels` owns that rule and is
 * tested on its own; this file draws what it is handed (rule 5).
 */
import { ChevronRight, Hash, Lock, ShieldAlert } from "lucide-react";
import { Avatar } from "@/components/common/Avatar";
import { formatDate } from "@/lib/format-date";
import {
  glyphFor, summariseSection, type ChannelGroup, type ChannelSection,
} from "@/lib/communication/channel-groups";
import type { Channel } from "@/lib/data/channels";
import { cn } from "@/lib/utils";

const UnreadBadge = ({ count }: { count: number }) => (
  <span aria-label={`${count} unread`}
    className="ml-auto shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground">
    {count > 99 ? "99+" : count}
  </span>
);

/**
 * One conversation. The glyph is decided by `glyphFor`, so "what kind of thing
 * is this" stays a tested rule rather than a chain of ternaries in JSX.
 */
export function ConversationRow({
  channel, active, hideOwner = false, onOpen,
}: {
  channel: Channel;
  active: boolean;
  /** True when a section heading above already names the owner. */
  hideOwner?: boolean;
  onOpen: () => void;
}) {
  const glyph = glyphFor(channel);
  const context = hideOwner ? null : (channel.partnerName ?? channel.organizationName);
  const subtitle = [context, channel.serviceName].filter(Boolean).join(" · ");
  const bold = channel.unread > 0 && !active && !channel.auditOnly;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        active
          ? "bg-primary/10 font-semibold text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        channel.archivedAt && "opacity-70",
      )}
    >
      {glyph === "person" ? (
        /* A face, not a hash. `displayName` on a direct row is already the
           other person — paired by id upstream, never by name (0336). */
        <Avatar name={channel.displayName} size="sm" className="h-6 w-6 text-[9px]" />
      ) : (
        <span className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
          active ? "bg-primary/15" : "bg-muted/70 group-hover:bg-muted",
        )}>
          {glyph === "audit" ? <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
            : glyph === "private" ? <Lock className="h-3.5 w-3.5" />
            : <Hash className="h-3.5 w-3.5" />}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className={cn("block truncate", bold && "font-bold text-foreground")}>
          {channel.displayName}
        </span>
        {subtitle && (
          <span className="block truncate text-[10px] text-muted-foreground">{subtitle}</span>
        )}
      </span>

      {channel.sharedWithBes && (
        <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
          BES
        </span>
      )}
      {channel.unread > 0 && !channel.auditOnly && <UnreadBadge count={channel.unread} />}
    </button>
  );
}

/**
 * A partner (or organization) and its conversations, foldable.
 *
 * The heading is a real button with `aria-expanded`, so the fold is reachable
 * by keyboard and announced — a disclosure that only works with a mouse is not
 * a disclosure.
 */
function FoldableSection({
  section, folded, onToggle, activeId, onOpen,
}: {
  section: ChannelSection;
  folded: boolean;
  onToggle: () => void;
  activeId: string | null;
  onOpen: (id: string) => void;
}) {
  const { unread, lastMessageAt } = summariseSection(section);
  return (
    <div className="mb-1.5 last:mb-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!folded}
        className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ChevronRight className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform",
          !folded && "rotate-90")} />
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-foreground">
          {section.label}
        </span>
        {/* Folded away, the heading is the only thing left to carry these. */}
        {folded && lastMessageAt && (
          <span className="shrink-0 text-[10px] font-normal text-muted-foreground">
            {formatDate(lastMessageAt.slice(0, 10))}
          </span>
        )}
        {unread > 0 && <UnreadBadge count={unread} />}
      </button>
      {!folded && (
        <ul className="mt-0.5 space-y-0.5 border-l border-border/70 pl-2">
          {section.channels.map((c) => (
            <li key={c.id}>
              <ConversationRow channel={c} active={activeId === c.id} hideOwner
                onOpen={() => onOpen(c.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ConversationGroup({
  group, activeId, folded, onToggleSection, onOpen,
}: {
  group: ChannelGroup;
  activeId: string | null;
  folded: Set<string>;
  onToggleSection: (key: string) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="mb-3">
      <p className="mb-1 flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {group.key === "administration" && <ShieldAlert className="h-3 w-3 text-amber-600" />}
        {group.label}
      </p>
      {group.key === "administration" && (
        /* Said once, at the top of the group, rather than implied. These are
           not this person's conversations. */
        <p className="mb-1 px-1 text-[10px] leading-snug text-muted-foreground">
          You can read these for administration. You are not in them and cannot reply.
        </p>
      )}
      {group.sections ? (
        group.sections.map((section) => (
          <FoldableSection
            key={section.key}
            section={section}
            folded={folded.has(section.key)}
            onToggle={() => onToggleSection(section.key)}
            activeId={activeId}
            onOpen={onOpen}
          />
        ))
      ) : (
        <ul className="space-y-0.5">
          {group.channels.map((c) => (
            <li key={c.id}>
              <ConversationRow channel={c} active={activeId === c.id} onOpen={() => onOpen(c.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
