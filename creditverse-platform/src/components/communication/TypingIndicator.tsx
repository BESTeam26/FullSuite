/**
 * "Somebody is typing" — the dots above the composer.
 *
 * Rule 15 shapes every decision here:
 *
 *   NO LAYOUT SHIFT. The row reserves its height whether or not anybody is
 *   typing, so the message list does not jump up and down while a colleague
 *   thinks. An indicator that moves the conversation is worse than none.
 *
 *   READABLE, NOT DECORATIVE. The dots animate, and the NAME is written out
 *   for anybody who cannot tell three grey circles apart — including a screen
 *   reader, which gets the sentence through `aria-live="polite"` rather than a
 *   stream of dot changes.
 *
 *   RESPECTS REDUCED MOTION. `motion-reduce:animate-none` leaves the dots
 *   visible and still.
 */
import { cn } from "@/lib/utils";
import type { TypingPerson } from "@/lib/data/use-typing-presence";

/** "Ally is typing", "Ally and Laz are typing", "3 people are typing". */
export function typingLabel(people: readonly TypingPerson[]): string {
  const names = people.map((p) => p.name.trim()).filter(Boolean);
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} is typing`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
  return `${names.length} people are typing`;
}

const Dot = ({ delay }: { delay: string }) => (
  <span
    className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70 animate-bounce motion-reduce:animate-none"
    style={{ animationDelay: delay, animationDuration: "1.1s" }}
  />
);

export function TypingIndicator({
  people,
  className,
}: {
  people: readonly TypingPerson[];
  className?: string;
}) {
  const label = typingLabel(people);
  return (
    /* Always rendered, so the height is reserved. `aria-live` announces the
       sentence when it changes and says nothing while it is empty. */
    <div
      className={cn("flex h-5 items-center gap-2 px-1", className)}
      aria-live="polite"
      aria-atomic="true"
    >
      {label && (
        <>
          <span className="flex items-center gap-1" aria-hidden="true">
            <Dot delay="0ms" />
            <Dot delay="150ms" />
            <Dot delay="300ms" />
          </span>
          <span className="truncate text-[11px] text-muted-foreground">{label}</span>
        </>
      )}
    </div>
  );
}
