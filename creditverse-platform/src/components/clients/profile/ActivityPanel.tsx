import { History } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import { formatDate } from "@/lib/format-date";
import type { ClientActivityEntry } from "@/lib/data/clients";

const SOURCE_LABEL: Record<string, string> = {
  fulfillment_client: "CreditOps",
  funding_client: "FundingOps",
};

/**
 * Cross-service history, filtered by the database rather than by this list.
 *
 * Every row here came back through `activity_events`' own policy, so a reader
 * who may see the funding side and not the credit side gets the funding half
 * and no hint that the other half exists. That is correct, and it is why the
 * empty state says "nothing visible to you" rather than "nothing happened".
 */
export const ActivityPanel = ({
  activity,
  hasLinks,
}: {
  activity: UseQueryResult<ClientActivityEntry[]>;
  hasLinks: boolean;
}) => {
  if (!hasLinks) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          No history yet. Activity is recorded against the work — a credit case or a funding file —
          and this client has neither.
        </p>
      </div>
    );
  }
  if (activity.isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading history…</p>;
  }
  if (activity.error) {
    return (
      <p className="p-6 text-sm text-status-danger">
        Could not load history: {(activity.error as Error).message}
      </p>
    );
  }
  const rows = activity.data ?? [];
  return (
    <div className="rounded-2xl border border-border bg-card">
      <h2 className="flex items-center gap-2 border-b border-border px-5 py-3.5 text-sm font-bold text-foreground">
        <History className="h-4 w-4 text-primary" /> Activity across services
      </h2>
      {rows.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground">Nothing visible to you yet.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {rows.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-5 py-3">
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-foreground">
                {SOURCE_LABEL[e.entityType] ?? e.entityType}
              </span>
              <span className="text-sm font-medium text-foreground">{e.action}</span>
              {e.detail && <span className="text-sm text-muted-foreground">{e.detail}</span>}
              <span className="ml-auto text-xs text-muted-foreground">
                {e.actorName ?? "System"} · {formatDate(e.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
