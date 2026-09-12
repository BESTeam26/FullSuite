/**
 * One history, replacing Progress and Activity History.
 *
 * Dee, 2026-09-12: "Do not make agents search Progress AND Activity History to
 * understand what happened." They were two timelines over the same events —
 * completed work appeared in both, phrased differently, and neither was the
 * whole story.
 *
 * Filters rather than separate screens: All · Notes · Work · Changes. An agent
 * skimming for "what did we actually do" wants Work; somebody answering a
 * client wants Notes; a lead checking a handoff wants Changes. Splitting them
 * into separate screens is what produced two timelines in the first place.
 */
import { useMemo, useState } from "react";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { useClientHistory, type HistoryKind } from "@/lib/data/use-client-history";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "note", label: "Notes" },
  { id: "work", label: "Work" },
  { id: "change", label: "Changes" },
] as const;

const KINDS_FOR: Record<string, HistoryKind[]> = {
  all: [],
  note: ["note", "import"],
  work: ["work"],
  change: ["change", "assignment", "handoff", "partner"],
};

const TONE: Record<HistoryKind, string> = {
  work: "bg-emerald-500",
  note: "bg-blue-500",
  import: "bg-slate-400",
  assignment: "bg-violet-500",
  handoff: "bg-amber-500",
  partner: "bg-purple-500",
  change: "bg-muted-foreground",
};

export function ClientHistoryTab({ clientId }: { clientId: string }) {
  const { entries, isLoading, error } = useClientHistory(clientId);
  const [filter, setFilter] = useState<string>("all");

  const shown = useMemo(() => {
    const kinds = KINDS_FOR[filter] ?? [];
    return kinds.length === 0 ? entries : entries.filter((e) => kinds.includes(e.kind));
  }, [entries, filter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              filter === f.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-lg border border-status-danger/30 bg-status-danger/5 px-3 py-2 text-xs text-status-danger">
          Could not load the history: {error}
        </p>
      ) : isLoading ? (
        <p className="py-8 text-center text-xs text-muted-foreground">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted-foreground">
          {entries.length === 0 ? "Nothing recorded on this file yet." : "Nothing of that kind yet."}
        </p>
      ) : (
        <ol className="space-y-0">
          {shown.map((e, i) => (
            <li key={`${e.happenedAt}:${i}`} className="flex gap-3 border-l border-border pl-4 pb-4 last:pb-0">
              <span className={cn("-ml-[21px] mt-1.5 h-2 w-2 shrink-0 rounded-full ring-2 ring-background", TONE[e.kind])} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground">
                  {e.title}
                  {e.department && (
                    <span className="ml-1.5 font-normal text-muted-foreground">· {e.department}</span>
                  )}
                </p>
                {e.detail && (
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                    {e.detail}
                  </p>
                )}
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {formatDate(e.happenedAt)}
                  {e.actor ? ` · ${e.actor}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
