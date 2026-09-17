/**
 * Channel details — the panel under the thread in Dee's reference.
 *
 * Description, who is in it, when it was made and by whom, how much it may
 * interrupt you, and whether you have starred it.
 *
 * ── TWO OF THESE ARE REAL SETTINGS, NOT LABELS ────────────────────────────
 *
 * The reference shows "Notifications · All messages" and a star. Neither
 * existed in the schema, so drawing them as text would have been a control
 * that does nothing — which CLAUDE.md forbids outright. Both were built:
 * starring is per-person and grants nothing, and the notification level
 * actually changes what `notify_message_recipients` writes. `mentions` still
 * hears when you are named; `none` hears nothing.
 *
 * ── AND THE MEMBER COUNT IS OF PEOPLE, NOT OF ROWS ────────────────────────
 *
 * An open conversation has no `channel_members` rows at all — everybody in
 * scope is in it. Counting the table would say nobody is here, under a list
 * of nine names. The count is who can actually be reached.
 */
import { useEffect, useState } from "react";
import {
  BellRing, Check, ChevronDown, ChevronUp, Clock, Info, Loader2, Pencil, Star, Users, X,
} from "lucide-react";
import { Avatar } from "@/components/common/Avatar";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { useChannelDetails, useChannelPreferences } from "@/lib/data/use-channels";
import type { NotificationLevel } from "@/lib/data/channels";

const LEVELS: { value: NotificationLevel; label: string; hint: string }[] = [
  { value: "all", label: "All messages", hint: "Tell me about everything here" },
  { value: "mentions", label: "Mentions only", hint: "Only when somebody names me" },
  { value: "none", label: "Nothing", hint: "Never notify me about this one" },
];

const Row = ({ icon: Icon, label, children }: {
  icon: typeof Info; label: string; children: React.ReactNode;
}) => (
  <div className="flex items-start gap-2.5 px-3 py-2">
    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    <div className="min-w-0 flex-1">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-xs text-foreground">{children}</div>
    </div>
  </div>
);

export function ChannelDetails({ channelId }: { channelId: string }) {
  const [open, setOpen] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const details = useChannelDetails(channelId);
  const prefs = useChannelPreferences(channelId);
  const d = details.data;

  /* A rename in progress belongs to the conversation it was started in. */
  useEffect(() => { setRenaming(false); setError(null); }, [channelId]);

  const submit = async () => {
    setError(null);
    try {
      await prefs.rename.mutateAsync(draft);
      setRenaming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That name was not accepted.");
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <h2 className="text-sm font-bold text-foreground">Channel details</h2>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        details.isPending ? (
          <p className="px-3 pb-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></p>
        ) : details.isError || !d ? (
          <p role="alert" className="px-3 pb-3 text-xs text-muted-foreground">
            We couldn't load the details for this conversation.
          </p>
        ) : (
          <div className="divide-y divide-border border-t border-border">
            <div className="flex items-start gap-2.5 px-3 py-2.5">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-bold text-muted-foreground">
                #
              </span>
              <div className="min-w-0 flex-1">
                {renaming ? (
                  <div className="space-y-1">
                    <input
                      autoFocus
                      value={draft}
                      maxLength={80}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") { setRenaming(false); setError(null); }
                        if (e.key === "Enter") { e.preventDefault(); void submit(); }
                      }}
                      aria-label="Conversation name"
                      className="w-full rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <p className="flex items-center gap-2 text-[11px]">
                      <button type="button" onClick={() => void submit()}
                        disabled={prefs.rename.isPending || !draft.trim()}
                        className="inline-flex items-center gap-1 font-bold text-primary hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                        {prefs.rename.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        Save
                      </button>
                      <button type="button" onClick={() => { setRenaming(false); setError(null); }}
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                        <X className="h-3 w-3" /> Cancel
                      </button>
                    </p>
                    {error && <p role="alert" className="text-[11px] text-status-danger">{error}</p>}
                  </div>
                ) : (
                  <>
                    <p className="truncate text-sm font-bold text-foreground">
                      {/* An unnamed direct conversation is DESCRIBED by who is
                          in it rather than named, so there is nothing to show
                          here and nothing to rename. */}
                      {d.name ?? "Named after who is in it"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {d.openToScope ? "Everyone with access" : "Members only"}
                    </p>
                  </>
                )}
              </div>
              {d.canRename && !renaming && (
                <button
                  type="button"
                  onClick={() => { setDraft(d.name ?? ""); setRenaming(true); }}
                  aria-label="Rename this conversation"
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => prefs.setFavourite.mutate(!d.favourite)}
                disabled={prefs.setFavourite.isPending}
                aria-pressed={d.favourite}
                aria-label={d.favourite ? "Remove star" : "Star this conversation"}
                className="rounded p-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Star className={cn("h-4 w-4",
                  d.favourite ? "fill-amber-400 text-amber-500" : "text-muted-foreground")} />
              </button>
            </div>

            {d.purpose && <Row icon={Info} label="About">{d.purpose}</Row>}

            <Row icon={Users} label={`Members · ${d.memberCount}`}>
              {d.members.length === 0 ? (
                <span className="text-muted-foreground">Nobody yet.</span>
              ) : (
                <span className="flex flex-wrap items-center gap-1">
                  <span className="flex -space-x-1.5">
                    {d.members.slice(0, 6).map((m) => (
                      <Avatar key={m.id} name={m.name} size="sm"
                        className="h-5 w-5 text-[8px] ring-2 ring-card" />
                    ))}
                  </span>
                  {d.memberCount > 6 && (
                    <span className="text-muted-foreground">+{d.memberCount - 6}</span>
                  )}
                </span>
              )}
            </Row>

            <Row icon={Clock} label="Created">
              {formatDate(d.createdAt)}{d.createdBy ? ` by ${d.createdBy}` : ""}
            </Row>

            <Row icon={BellRing} label="Notifications">
              <select
                value={d.notifications}
                disabled={prefs.setNotifications.isPending}
                onChange={(e) => prefs.setNotifications.mutate(e.target.value as NotificationLevel)}
                aria-label="How much this conversation may notify you"
                className="w-full rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {LEVELS.find((l) => l.value === d.notifications)?.hint}
              </p>
            </Row>
          </div>
        )
      )}
    </section>
  );
}
