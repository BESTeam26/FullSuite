/**
 * Seats in use, and why each person is or is not one.
 *
 * The number comes from the same database function that refuses an invitation
 * over capacity, so the screen cannot disagree with the refusal. The reasons
 * are shown because "7 of 10" invites the question "why seven?" — and the
 * answer (the owner is free, BES staff are free, two people are archived) is
 * the part that stops a support conversation.
 */
import { useQuery } from "@tanstack/react-query";
import { Users, Info } from "lucide-react";
import { SectionCard } from "@/components/settings/shared";
import { fetchSeatHolders, fetchSeatSummary } from "@/lib/data/seats";

export function SeatUsageCard({ organizationId }: { organizationId: string }) {
  const summary = useQuery({
    queryKey: ["seats", "summary", organizationId],
    queryFn: () => fetchSeatSummary(organizationId),
    staleTime: 30_000,
  });
  const holders = useQuery({
    queryKey: ["seats", "holders", organizationId],
    queryFn: () => fetchSeatHolders(organizationId),
    staleTime: 30_000,
  });

  const s = summary.data;
  const free = (holders.data ?? []).filter((h) => !h.counts);

  return (
    <SectionCard
      icon={Users}
      title="Seats"
      description="Billable platform users. A seat is a commercial count — it decides nothing about what anyone may do."
    >
      {summary.isLoading ? (
        <div className="h-14 animate-pulse rounded-lg bg-muted/40" aria-busy="true" />
      ) : !s ? (
        <p className="text-xs text-muted-foreground">No seat information for this organization.</p>
      ) : (
        <>
          <p className="text-sm text-foreground">
            <span className="text-2xl font-bold">{s.seatsUsed}</span>
            {s.seatsIncluded === null ? (
              <span className="ml-2 text-muted-foreground">in use · no plan in force, so nothing to exceed</span>
            ) : (
              <span className="ml-2 text-muted-foreground">
                of {s.seatsIncluded} · {s.pendingInvitations} invitation
                {s.pendingInvitations === 1 ? "" : "s"} pending · {s.source}
              </span>
            )}
          </p>
          {s.overCapacity && (
            <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-status-danger">
              Over the plan's allowance. Further invitations are refused until a member is archived or the
              plan gains seats.
            </p>
          )}
          {s.seatsIncluded !== null && !s.overCapacity && s.seatsAvailable !== null && s.seatsAvailable <= 1 && (
            <p className="mt-2 rounded-lg border border-amber-600/30 bg-amber-500/10 p-2.5 text-xs text-status-warning">
              {s.seatsAvailable === 0 ? "No seats left." : "One seat left."} A pending invitation holds a
              seat until it is accepted or expires.
            </p>
          )}

          {free.length > 0 && (
            <div className="mt-3 rounded-lg border border-border bg-background p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <Info className="h-3 w-3" /> Not billed ({free.length})
              </p>
              <ul className="mt-1.5 space-y-1">
                {free.map((h) => (
                  <li key={h.userId} className="flex flex-wrap items-baseline gap-2 text-xs">
                    <span className="font-medium text-foreground">{h.fullName || h.email || "Unnamed"}</span>
                    <span className="text-muted-foreground">{h.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">
            Client portal users and GoHighLevel-only users hold no platform login here, so they never
            consume a seat.
          </p>
        </>
      )}
    </SectionCard>
  );
}
