/**
 * Messages · Files · Pins · Members — the strip under a conversation's name.
 *
 * Dee's reference, 2026-09-17. Everything on it already existed in the data
 * and nowhere in the interface: files were only findable by scrolling back to
 * the message that carried them, pins were behind a button that appeared only
 * when there were some, and the member count was not shown at all.
 *
 * ── THE COUNTS COME FROM ONE QUERY ────────────────────────────────────────
 *
 * `channel_tab_counts` answers all three in one round trip. Three questions
 * asked separately, once per conversation opened, is the waterfall rule 14
 * names — and it would be paid on every click in the rail.
 *
 * ── AND A TAB ONLY FETCHES WHEN IT IS OPENED ──────────────────────────────
 *
 * The Files list is not loaded until somebody asks for it. Rule 14 again: do
 * not preload a tab nobody opened.
 */
import { FileText, Hash, Pin, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChannelTab = "messages" | "files" | "pins" | "members";

const TABS: { key: ChannelTab; label: string; icon: typeof Hash }[] = [
  { key: "messages", label: "Messages", icon: Hash },
  { key: "files", label: "Files", icon: FileText },
  { key: "pins", label: "Pins", icon: Pin },
  { key: "members", label: "Members", icon: Users },
];

export function ChannelTabs({
  active, onChange, counts, openToScope,
}: {
  active: ChannelTab;
  onChange: (tab: ChannelTab) => void;
  counts: { files: number; pins: number; members: number } | undefined;
  /** An open conversation has no explicit member rows — everybody in scope is
   *  in it — so a count of 0 would be a lie. */
  openToScope: boolean;
}) {
  const countFor = (key: ChannelTab): string | null => {
    if (!counts) return null;
    if (key === "files") return counts.files > 0 ? String(counts.files) : null;
    if (key === "pins") return counts.pins > 0 ? String(counts.pins) : null;
    if (key === "members") {
      if (openToScope && counts.members === 0) return "Everyone";
      return counts.members > 0 ? String(counts.members) : null;
    }
    return null;
  };

  return (
    <nav aria-label="Conversation sections"
      className="flex gap-1 overflow-x-auto border-b border-border px-3">
      {TABS.map((t) => {
        const on = active === t.key;
        const count = countFor(t.key);
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2 text-xs font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              on
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
            {count && (
              <span className={cn("rounded px-1 text-[10px] font-bold tabular-nums",
                on ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
