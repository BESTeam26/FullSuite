/**
 * This funding file's history.
 *
 * `entity_visible()` knows `funding_file`, so these rows are gated by the same
 * policy that gates the file itself. Nothing is written from here — stage
 * moves, dispositions and lender decisions are written by the database
 * functions that perform them, which is why the timeline cannot disagree with
 * what happened.
 */
import { History, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { formatDateTime } from "@/lib/format-date";
import { fetchTimeline } from "@/lib/data/activity";

export function FileActivityTab({ fileId }: { fileId: string }) {
  const timeline = useQuery({
    queryKey: ["timeline", "funding_file", fileId],
    queryFn: () => fetchTimeline("funding_file", fileId, 100),
    staleTime: 30_000,
  });

  if (timeline.isLoading) {
    return (
      <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading history…
      </p>
    );
  }
  if (timeline.error) {
    return <p role="alert" className="text-xs text-status-danger">Could not load the history.</p>;
  }
  const rows = timeline.data ?? [];
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">Nothing recorded on this file yet.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {rows.map((e) => (
        <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 rounded-lg border border-border bg-background px-3 py-2">
          <History className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">{e.action}</span>
          {e.detail && <span className="text-xs text-muted-foreground">{e.detail}</span>}
          <span className="ml-auto text-[10px] text-muted-foreground">
            {e.actor} · {formatDateTime(e.timestamp)}
          </span>
        </li>
      ))}
    </ul>
  );
}
