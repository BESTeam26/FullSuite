/**
 * Who has already seen it.
 *
 * Dee, 2026-09-17: "I still cant see the ones WHO ALREADY SEEN the message…
 * It should be the latest chat that has the typing effects be seen and the
 * ones who viewed the message already."
 *
 * So it sits where the typing indicator sits — under the last message, above
 * the composer — because that is the one place in a conversation that is about
 * right now rather than about the past.
 *
 * ── AGAINST THE LAST MESSAGE, NOT AGAINST THE CONVERSATION ────────────────
 *
 * `channel_reads` holds how far each person has read. Somebody has seen the
 * latest message when their mark is at or past it. Showing everybody who has
 * ever opened the conversation would say "seen by 10" under a message nobody
 * has read yet, which is worse than saying nothing.
 *
 * ── AND NEVER AN AUDITOR ──────────────────────────────────────────────────
 *
 * `mark_channel_read` does not record somebody who may only inspect the
 * conversation (§17), so an administrator's visit cannot appear here. Nothing
 * in this file has to know that — it is true at the source.
 */
import { Avatar } from "@/components/common/Avatar";
import { cn } from "@/lib/utils";
import type { SeenBy as Reader } from "@/lib/data/channels";

/** Names, then a count, then nothing — three ways to say it depending on how
 *  many there are, because "Seen by 9 people" tells you less than two names. */
const sentence = (names: string[]): string => {
  const first = names.map((n) => n.split(" ")[0]);
  if (first.length === 1) return `Seen by ${first[0]}`;
  if (first.length === 2) return `Seen by ${first[0]} and ${first[1]}`;
  if (first.length === 3) return `Seen by ${first[0]}, ${first[1]} and ${first[2]}`;
  return `Seen by ${first[0]}, ${first[1]} and ${first.length - 2} others`;
};

export function SeenBy({ readers, lastMessageAt, className }: {
  readers: Reader[];
  /** When the latest message was sent. Nothing is "seen" without one. */
  lastMessageAt: string | null;
  className?: string;
}) {
  if (!lastMessageAt) return null;

  const at = Date.parse(lastMessageAt);
  const seen = readers.filter((r) => {
    const mark = Date.parse(r.lastReadAt);
    return Number.isFinite(mark) && Number.isFinite(at) && mark >= at;
  });
  if (seen.length === 0) return null;

  return (
    <p className={cn("flex items-center gap-1.5 px-3 py-1 text-[11px] text-muted-foreground", className)}>
      <span className="flex -space-x-1.5">
        {seen.slice(0, 5).map((r) => (
          <Avatar key={r.userId} name={r.name} size="sm"
            className="h-4 w-4 text-[8px] ring-2 ring-card" />
        ))}
      </span>
      <span className="min-w-0 truncate">{sentence(seen.map((r) => r.name))}</span>
    </p>
  );
}
