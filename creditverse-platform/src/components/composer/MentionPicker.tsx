/**
 * The "@" picker.
 *
 * It offers only the people the caller was given — the scoped list the
 * surface already holds (a work item's assignable people, an organization's
 * directory, a channel's members). There is no global user search here, and
 * there must never be one: a picker that can find people outside your scope
 * tells you they exist (rule 1, default deny).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/common/Avatar";
import { rankMentionCandidates } from "@/lib/activity/mentions";
import { cn } from "@/lib/utils";

export interface MentionCandidate {
  userId: string;
  name: string;
  email?: string | null;
  avatarPath?: string | null;
  /** e.g. "Processing" or "Credit Processor" — helps tell two Sams apart. */
  hint?: string | null;
}

export function MentionPicker({
  query,
  people,
  avatarUrls,
  onPick,
  onDismiss,
}: {
  query: string;
  people: MentionCandidate[];
  avatarUrls?: Record<string, string>;
  onPick: (person: MentionCandidate) => void;
  onDismiss: () => void;
}) {
  const matches = useMemo(() => rankMentionCandidates(people.map((p) => ({ ...p })), query), [people, query]);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => setActive(0), [query, people]);

  /* Keys are handled here rather than in the editor so the list owns its own
     behaviour; the editor only tells us the picker is open. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (matches.length === 0) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % matches.length); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + matches.length) % matches.length); }
      else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); onPick(matches[active]); }
      else if (e.key === "Escape") { e.preventDefault(); onDismiss(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [matches, active, onPick, onDismiss]);

  if (matches.length === 0) {
    return (
      <div className="absolute bottom-full left-3 z-30 mb-1 w-72 rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground shadow-lg">
        Nobody here matches “{query}”. You can only mention people you work with.
      </div>
    );
  }

  return (
    <ul
      ref={listRef}
      role="listbox"
      aria-label="Mention someone"
      className="absolute bottom-full left-3 z-30 mb-1 w-72 overflow-hidden rounded-lg border border-border bg-card shadow-lg"
    >
      {matches.map((p, i) => (
        <li key={p.userId}>
          <button
            type="button"
            role="option"
            aria-selected={i === active}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(e) => { e.preventDefault(); onPick(p); }}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors",
              i === active ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            <Avatar name={p.name} url={p.avatarPath ? avatarUrls?.[p.avatarPath] : null} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-foreground">{p.name}</span>
              {p.hint && <span className="block truncate text-[10px]">{p.hint}</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
