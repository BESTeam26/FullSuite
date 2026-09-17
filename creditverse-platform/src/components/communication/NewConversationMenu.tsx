/**
 * "New" — and then what kind of new.
 *
 * Dee, 2026-09-17: "when I click New it should give me option to dm or send
 * group chat message to create a group chat something like that."
 *
 * Before this, New meant one thing — a channel — and starting a direct message
 * was a separate dropdown further down the rail that you had to know was
 * there. Two ways to begin a conversation, in two places, one of them
 * unlabelled.
 *
 * Now New asks first:
 *
 *   Direct message   one person
 *   Group chat       several, with no name and no administrator
 *   Channel          a named place with a purpose, for whoever joins it
 *
 * ── THE DISTINCTION THAT MATTERS ──────────────────────────────────────────
 *
 * A group chat and a channel are genuinely different things, and the menu says
 * why rather than making somebody guess. A group chat IS its people — the same
 * people always reach the same conversation, and it has no name because there
 * is nothing to name. A channel is a place: it has a subject, people come and
 * go, and somebody administers it.
 *
 * The database keeps that honest. `open_group_conversation` refuses above
 * twelve people and says to make a channel instead, because a thirteen-person
 * group chat is a channel nobody named.
 */
import { useEffect, useRef, useState } from "react";
import { AtSign, Hash, Loader2, Plus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-context";
import { useWorkforce } from "@/lib/data/use-workforce";
import { useChannelActions } from "@/lib/data/use-channels";
import { cn } from "@/lib/utils";

export type NewConversationKind = "direct" | "group" | "channel";

/** Above this the database refuses and says to make a channel. */
const MAX_GROUP = 12;

const CHOICES: { kind: NewConversationKind; label: string; hint: string; icon: typeof AtSign }[] = [
  { kind: "direct",  label: "Direct message", hint: "One person, just the two of you", icon: AtSign },
  { kind: "group",   label: "Group chat",     hint: "A few people, no name needed",    icon: Users },
  { kind: "channel", label: "Channel",        hint: "A named place with a purpose",    icon: Hash },
];

export function NewConversationMenu({
  canCreateChannel,
  onChannel,
  onOpened,
}: {
  /** Channels need `communication.channels.create`; conversations do not. */
  canCreateChannel: boolean;
  onChannel: () => void;
  onOpened: (channelId: string) => void;
}) {
  const auth = useAuth();
  const workforce = useWorkforce();
  const actions = useChannelActions();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState<"direct" | "group" | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const colleagues = (workforce.data?.people ?? []).filter((p) => p.userId !== auth.user?.id);

  /* Escape closes, and a click outside closes. A menu that can only be
     dismissed by completing it is a trap. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  });

  const close = () => { setOpen(false); setPicking(null); setChosen([]); setError(null); };

  const start = async (userIds: string[]) => {
    setError(null);
    try {
      /* One call for both: the database sends two people down the direct-
         message path itself, so this does not have to know where the line is. */
      const id = await actions.openGroup.mutateAsync(userIds);
      onOpened(id);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That conversation could not be opened.");
    }
  };

  const toggle = (userId: string) =>
    setChosen((s) => (s.includes(userId) ? s.filter((u) => u !== userId) : [...s, userId]));

  const busy = actions.openGroup.isPending;

  return (
    <div className="relative" ref={box}>
      <Button
        size="sm" variant="ghost" className="h-7 px-2 text-xs"
        aria-haspopup="menu" aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Plus className="mr-1 h-3.5 w-3.5" /> New
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-8 z-30 w-64 rounded-xl border border-border bg-popover p-1.5 shadow-lg"
        >
          {picking === null ? (
            <>
              {CHOICES.filter((c) => c.kind !== "channel" || canCreateChannel).map((c) => (
                <button
                  key={c.kind}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    if (c.kind === "channel") { onChannel(); close(); return; }
                    setPicking(c.kind);
                  }}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                    "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  )}
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted">
                    <c.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{c.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{c.hint}</span>
                  </span>
                </button>
              ))}
              {colleagues.length === 0 && (
                <p className="px-2.5 py-2 text-[11px] text-muted-foreground">
                  There is nobody else on the team yet to message.
                </p>
              )}
            </>
          ) : (
            <div className="p-1">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-foreground">
                  {picking === "direct" ? "Message someone" : "Who is in this chat?"}
                </p>
                <button
                  type="button" onClick={() => { setPicking(null); setChosen([]); setError(null); }}
                  aria-label="Back"
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {workforce.isPending ? (
                <p className="px-1 py-3 text-center text-[11px] text-muted-foreground">Loading…</p>
              ) : (
                <ul className="max-h-64 space-y-0.5 overflow-y-auto">
                  {colleagues.map((p) => {
                    const on = chosen.includes(p.userId);
                    return (
                      <li key={p.userId}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => (picking === "direct" ? void start([p.userId]) : toggle(p.userId))}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                            on ? "bg-primary/10 font-medium text-foreground" : "text-foreground hover:bg-muted",
                          )}
                        >
                          {picking === "group" && (
                            <span
                              aria-hidden
                              className={cn(
                                "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                                on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                              )}
                            >
                              {on ? "✓" : ""}
                            </span>
                          )}
                          <span className="min-w-0 flex-1 truncate">{p.name}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {picking === "group" && (
                <div className="mt-2 border-t border-border pt-2">
                  <p className="mb-1.5 text-[11px] text-muted-foreground">
                    {chosen.length === 0
                      ? "Pick at least one person."
                      : chosen.length + 1 > MAX_GROUP
                        ? `That is ${chosen.length + 1} people — make a channel instead.`
                        : `${chosen.length + 1} people, including you.`}
                  </p>
                  <Button
                    size="sm" className="w-full"
                    disabled={busy || chosen.length === 0 || chosen.length + 1 > MAX_GROUP}
                    onClick={() => void start(chosen)}
                  >
                    {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                    {chosen.length === 1 ? "Start direct message" : "Start group chat"}
                  </Button>
                  {chosen.length === 1 && (
                    /* Honest about what it will do: one other person is a DM,
                       and the same two people always land in the same one. */
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      One person is a direct message.
                    </p>
                  )}
                </div>
              )}

              {error && (
                <p role="alert" className="mt-2 text-[11px] text-status-danger">{error}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
