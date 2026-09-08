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
import { useEffect, useMemo, useState } from "react";
import { Hash, Loader2, Plus, Users } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAgency } from "@/lib/agency-context";
import { useAuth } from "@/lib/auth/auth-context";
import { useChannelActions, useChannels } from "@/lib/data/use-channels";
import { ConversationPane } from "@/components/communication/ConversationPane";
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
  /* `?channel=` is how a partner record opens its own conversation. Read once
     and then dropped from the URL, so a later click in the sidebar is not
     dragged back to it on the next render. */
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
  const [newName, setNewName] = useState("");
  const [newPurpose, setNewPurpose] = useState("");

  /* Default to General so the page is never a blank column. */
  const current = useMemo(() => {
    const list = channels.data ?? [];
    return list.find((c) => c.id === openId) ?? list.find((c) => c.kind === "general") ?? list[0] ?? null;
  }, [channels.data, openId]);

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
          <ConversationPane
            channelId={current.id}
            name={current.name}
            purpose={current.purpose}
            notice={
              current.sharedWithBes ? (
                /* Said plainly, above the conversation. Somebody typing here
                   deserves to know who can read it. */
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-amber-700">
                  <Users className="h-3.5 w-3.5" />
                  Shared with the BES team while your service is active. They can read and reply here.
                </p>
              ) : null
            }
          />
        )}
      </section>
    </div>
  );
}
