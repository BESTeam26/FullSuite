/**
 * What has been done for this client.
 *
 * Dee, 2026-09-11: Department Progress "must not be a HANDOFF process but a
 * checklist reporting that will allow the team to see what are the things been
 * done for this client, and must be autofill by the complete work".
 *
 * So there is nothing to fill in and nothing to hand off. Completing work
 * already writes a production record carrying the department, the actions and
 * the notes; this reads them. A checklist beside that would be a second
 * account of the same events, and the two would disagree the first time
 * somebody ticked a box for work nobody logged.
 *
 * It sits at the top of the file because the first question anyone opening a
 * client asks is what has already happened to it.
 */
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Flag, Import } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { formatDate } from "@/lib/format-date";
import { fetchClientProgress, type ProgressKind } from "@/lib/data/client-progress";
import { cn } from "@/lib/utils";

const MARK: Record<ProgressKind, { icon: typeof CheckCircle2; tone: string; label: string }> = {
  work:      { icon: CheckCircle2, tone: "text-status-success", label: "Work completed" },
  milestone: { icon: Flag,         tone: "text-status-warning", label: "Milestone" },
  migrated:  { icon: Import,       tone: "text-muted-foreground", label: "From ClickUp" },
};

export function ClientProgressReport({ clientId }: { clientId: string }) {
  const q = useQuery({
    queryKey: ["client-progress", clientId],
    queryFn: () => fetchClientProgress(clientId),
    enabled: !!clientId,
    staleTime: 30_000,
  });

  const entries = q.data ?? [];
  const done = entries.filter((e) => e.kind === "work").length;

  return (
    <ContentCard
      title="Progress"
      action={
        <span className="text-[11px] text-muted-foreground">
          {done} {done === 1 ? "completion" : "completions"} recorded
        </span>
      }
    >
      <p className="mb-3 text-xs text-muted-foreground">
        Everything done for this client, filled in by the work itself. Nothing here is typed
        by hand.
      </p>

      {q.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
          Nothing recorded yet. Completing work on this file writes the first entry.
        </p>
      ) : (
        <ol className="space-y-2">
          {entries.map((e, i) => {
            const mark = MARK[e.kind];
            const Icon = mark.icon;
            return (
              <li
                key={`${e.at}-${i}`}
                className="flex gap-2.5 rounded-lg border border-border bg-card px-3 py-2"
              >
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", mark.tone)} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-xs font-medium text-foreground">{e.headline}</p>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatDate(e.at)}
                    </span>
                  </div>
                  {e.detail && (
                    <p className="mt-0.5 whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
                      {e.detail}
                    </p>
                  )}
                  <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {e.department !== "—" ? `${e.department} · ` : ""}{e.actor}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </ContentCard>
  );
}
