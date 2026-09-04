/**
 * FundingOps client activity timeline — the shared ops timeline bound to the
 * FundingOps client store.
 */

import { useFundingOpsStore } from "@/lib/fulfillment/fundingops-client-store";
import { OpsActivityTimeline } from "./OpsActivityTimeline";
import { useActivityVisibility } from "@/lib/data/use-activity-visibility";
import { useTimeline } from "@/lib/data/use-timeline";

const ACTOR = "Agent (BES HQ)";

export function FundingOpsActivityTimeline({ clientId }: { clientId: string }) {
  const store = useFundingOpsStore();
  /* Which audiences this user may post to — resolved centrally, not here. */
  const client = store.clients.find((c) => c.id === clientId);
  const { allowed } = useActivityVisibility(
    client?.organizationId ?? client?.outsourcingGroupId,
    "fundingops",
  );

  /* Live entries come from the canonical table, already filtered by RLS to
     what this user may read. The store's own list is the demo fallback. */
  const timeline = useTimeline("funding_client", clientId);
  const entries =
    timeline.source === "live" ? timeline.entries : store.getActivity(clientId);

  return (
    <OpsActivityTimeline
      entries={entries}
      actor={ACTOR}
      emptyMessage="No activity yet. Status changes, comments, and updates are logged here."
      allowedVisibilities={allowed}
      /* Returns the store's promise so the composer can await persistence.
         It used to call `timeline.refresh()` immediately after a
         fire-and-forget write: the refetch beat the insert and returned the
         timeline as it was, so the new note simply did not appear. The store
         now places the persisted row into the timeline cache itself. */
      onPostComment={(detail, visibility) =>
        store.addActivity({
          clientId,
          actor: ACTOR,
          action: "Comment posted",
          detail,
          visibility,
        })
      }
      onTogglePin={(id) => store.togglePin(id)}
      onSetMark={(id, mark) => store.setMark(id, mark)}
    />
  );
}
