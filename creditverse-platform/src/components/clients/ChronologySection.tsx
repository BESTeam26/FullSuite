/**
 * The report-history section, wired to this client's stored snapshots.
 *
 * Kept apart from the timeline itself so the chronology can be rendered from
 * any source — the stored imports here, a comparison during import later —
 * without the timeline knowing where its snapshots came from.
 */
import { Loader2 } from "lucide-react";
import { AccountTimelineSection } from "@/components/clients/AccountTimeline";
import { useChronology } from "@/lib/data/use-chronology";
import { accountRefsIn } from "@/lib/credit-report/chronology";

export function ChronologySection({ clientId }: { clientId: string }) {
  const { snapshots, snapshotCount, isLoading, error, live } = useChronology(clientId);
  if (!live) return null;

  if (isLoading) {
    return (
      <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading report history…
      </p>
    );
  }
  if (error) {
    return <p className="text-xs text-status-danger">Report history could not be loaded: {error}</p>;
  }

  /* Below two snapshots there is nothing to compare, and the section says so
     rather than showing an empty frame. */
  if (snapshotCount < 2) {
    return <AccountTimelineSection snapshots={[]} refs={[]} />;
  }

  const refs = accountRefsIn(snapshots).map((accountRef) => ({
    accountRef,
    name:
      [...snapshots]
        .sort((a, b) => b.pulledAt.localeCompare(a.pulledAt))
        .find((s) => s.items[accountRef])?.items[accountRef]?.name ?? accountRef,
  }));

  return <AccountTimelineSection snapshots={snapshots} refs={refs} />;
}
