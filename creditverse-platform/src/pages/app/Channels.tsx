/**
 * The organization's channels.
 *
 * Private by default: a person sees the channels they were added to, and a BES
 * staff member sees only what the organization explicitly shared while a
 * qualifying engagement is live. None of that is decided here — the database
 * decides it, and this screen renders whatever arrives. Deleting this file
 * would not widen anybody's access by a single row.
 *
 * What the screen does add is honesty about the boundary. A shared channel
 * says so, in the list and above the conversation, because somebody typing in
 * a channel deserves to know BES can read it. And a message from BES is
 * labelled, because "who am I talking to" should never be a guess.
 */
import { useMemo, useState } from "react";
import { Hash, Loader2, Plus, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAgency } from "@/lib/agency-context";
import { useAuth } from "@/lib/auth/auth-context";
import { formatDate } from "@/lib/format-date";
import { useChannelActions, useChannels, useMessages, usePostMessage } from "@/lib/data/use-channels";
import type { Channel } from "@/lib/data/channels";
import { cn } from "@/lib/utils";

/**
 * ── ONE CONVERSATION SPACE ─────────────────────────────────────────────────
 *
 * Dee: "It's gonna be like GHL that has one central communication/conversation
 * space" — replacing Slack, WhatsApp and Teams, with ONE RECORD ONLY PER
 * CHANNEL, even DMs and portal messages.
 *
 * So this list is grouped by WHO the conversation is with, not by which system
 * it came from. A partner conversation shows here and in that partner's portal
 * because it is the same row: an agent's reply is the message the partner
 * reads, not a copy of it.
 */
const GROUPS: { label: string; match: (c: Channel) => boolean }[] = [
  { label: "BES team", match: (c) => !!c.agencyId && c.kind !== "direct" },
  { label: "Partners", match: (c) => !!c.partnerGroupId },
  { label: "Organizations", match: (c) => !!c.organizationId },
  { label: "Direct messages", match: (c) => c.kind === "direct" && !c.partnerGroupId && !c.organizationId },
];

export default function Channels() {
  const { activeOrganization, viewMode } = useAgency();
  const auth = useAuth();
  const orgId = activeOrganization?.id ?? null;
  /* In Agency HQ this asks for everything RLS allows: BES's own channels,
     organization channels shared with BES, and partner conversations. One
     canonical row each — an agent answering a partner writes into the same
     channel the partner reads in their portal (0190, 0191). */
  const agencyView = viewMode === "agency";
  const channels = useChannels(orgId, agencyView ? (auth.agencyId ?? null) : null);
  const actions = useChannelActions({
    organizationId: agencyView ? null : orgId,
    agencyId: agencyView ? (auth.agencyId ?? null) : null,
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPurpose, setNewPurpose] = useState("");

  /* Default to General so the page is never a blank column. */
  const current = useMemo(() => {
    const list = channels.data ?? [];
    return list.find((c) => c.id === openId) ?? list.find((c) => c.kind === "general") ?? list[0] ?? null;
  }, [channels.data, openId]);

  const messages = useMessages(current?.id ?? null);
  const post = usePostMessage(current?.id ?? null, auth.user?.id ?? null);
  const [draft, setDraft] = useState("");

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    /* Same rich-text shape as an activity note, so mentions work unchanged. */
    post.mutate(
      { body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] }, bodyText: text },
      { onSuccess: () => setDraft("") },
    );
  };

  if (channels.isLoading) {
    return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-[1600px] flex-col gap-4 p-4 md:flex-row md:p-6">
      <aside className="w-full shrink-0 md:w-72">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h1 className="text-sm font-bold text-foreground">Communication</h1>
          {agencyView && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
              onClick={() => setCreating((v) => !v)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New
            </Button>
          )}
        </div>

        {creating && agencyView && (
          <div className="mb-3 space-y-2 rounded-lg border border-border bg-muted/30 p-2.5">
            <Input className="h-8" value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="Channel name" aria-label="Channel name" />
            <Input className="h-8" value={newPurpose} onChange={(e) => setNewPurpose(e.target.value)}
              placeholder="What it is for (optional)" aria-label="Channel purpose" />
            <div className="flex gap-2">
              <Button size="sm" disabled={!newName.trim() || actions.create.isPending}
                onClick={async () => {
                  await actions.create.mutateAsync({ name: newName, kind: "topic", purpose: newPurpose });
                  setNewName(""); setNewPurpose(""); setCreating(false);
                }}>
                {actions.create.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Create
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              A BES team channel. Conversations WITH a partner are opened from that partner's
              record, so the same channel appears in their portal.
            </p>
          </div>
        )}

        {GROUPS.map((group) => {
          const rows = (channels.data ?? []).filter(group.match);
          if (rows.length === 0) return null;
          return (
            <div key={group.label} className="mb-3">
              <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {rows.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(c.id)}
                      aria-current={current?.id === c.id ? "page" : undefined}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        current?.id === c.id
                          ? "bg-primary/10 font-semibold text-foreground"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      <Hash className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{c.name}</span>
                        {/* Whose conversation it is. The same row appears in
                            their portal or their workspace — naming the owner
                            here is what stops it reading as a BES channel that
                            happens to mention them. */}
                        {(c.partnerName || c.organizationName) && (
                          <span className="block truncate text-[10px] text-muted-foreground">
                            {c.partnerName ?? c.organizationName}
                          </span>
                        )}
                      </span>
                      {c.sharedWithBes && (
                        <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                          BES
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {(channels.data ?? []).length === 0 && (
          <p className="px-1 text-xs text-muted-foreground">You are not in any channel yet.</p>
        )}
      </aside>

      <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card">
        {!current ? (
          <p className="p-6 text-sm text-muted-foreground">Pick a channel.</p>
        ) : (
          <>
            <header className="border-b border-border px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Hash className="h-4 w-4 text-muted-foreground" /> {current.name}
              </h2>
              {current.purpose && <p className="text-xs text-muted-foreground">{current.purpose}</p>}
              {current.sharedWithBes && (
                /* Said plainly, above the conversation. Somebody typing here
                   deserves to know who can read it. */
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-amber-700">
                  <Users className="h-3.5 w-3.5" />
                  Shared with the BES team while your service is active. They can read and reply here.
                </p>
              )}
            </header>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {messages.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (messages.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing here yet. Say something.</p>
              ) : (
                (messages.data ?? []).map((m) => (
                  <article key={m.id} className="text-sm">
                    <p className="flex flex-wrap items-baseline gap-2">
                      <span className="font-semibold text-foreground">{m.authorName}</span>
                      {m.fromBes && (
                        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                          BES team
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground">{formatDate(m.createdAt)}</span>
                    </p>
                    <p className="whitespace-pre-wrap text-foreground">{m.bodyText}</p>
                  </article>
                ))
              )}
            </div>

            <div className="border-t border-border p-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  rows={2}
                  placeholder={`Message ${current.name}`}
                  aria-label={`Message ${current.name}`}
                  className="min-h-[44px] flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <Button size="sm" onClick={send} disabled={post.isPending || !draft.trim()}>
                  {post.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  <span className="sr-only">Send</span>
                </Button>
              </div>
              {post.isError && (
                <p role="alert" className="mt-1.5 text-xs text-status-danger">
                  {(post.error as Error).message}
                </p>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
