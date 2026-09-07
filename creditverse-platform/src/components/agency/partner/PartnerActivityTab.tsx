/**
 * Everything that happened to this partner, newest first.
 *
 * Written by database triggers on the changes that matter — lifecycle, health,
 * and the financial events — so history cannot be skipped by a client that
 * forgot to log. There is no second audit engine: these are `activity_events`,
 * the same append-only table the rest of the platform writes to.
 */
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { ContentCard } from "@/components/dashboard/DivisionLayout";
import { Empty } from "@/components/agency/partner/partner-ui";
import { fetchTimeline } from "@/lib/data/activity";
import { useAuth } from "@/lib/auth/auth-context";
import { formatDateTime } from "@/lib/format-date";

export function PartnerActivityTab({ groupId }: { groupId: string }) {
  const auth = useAuth();
  const timeline = useQuery({
    queryKey: ["partner", "activity", groupId],
    queryFn: () => fetchTimeline("partner", groupId),
    enabled: auth.mode === "live" && auth.status === "signed-in",
    staleTime: 30_000,
  });

  return (
    <ContentCard title="Activity">
      {timeline.isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : (timeline.data ?? []).length === 0 ? (
        <Empty title="Nothing recorded yet"
          hint="Lifecycle changes, health judgements and financial events are written here automatically as they happen." />
      ) : (
        <ol className="space-y-2.5">
          {(timeline.data ?? []).map((e) => (
            <li key={e.id} className="border-l-2 border-border pl-3">
              <p className="text-sm text-foreground">
                <span className="font-medium">{e.action}</span>
                {e.previousValue && e.newValue && (
                  <span className="text-muted-foreground"> — {e.previousValue} → {e.newValue}</span>
                )}
                {!e.previousValue && e.newValue && (
                  <span className="text-muted-foreground"> — {e.newValue}</span>
                )}
              </p>
              {e.detail && <p className="text-xs text-muted-foreground">{e.detail}</p>}
              <p className="text-[11px] text-muted-foreground">
                {formatDateTime(e.timestamp)}{e.actor && ` · ${e.actor}`}
              </p>
            </li>
          ))}
        </ol>
      )}
    </ContentCard>
  );
}
