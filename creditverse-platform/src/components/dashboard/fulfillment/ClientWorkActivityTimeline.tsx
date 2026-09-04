/**
 * CreditOps client activity timeline — the shared ops timeline bound to the
 * CreditOps client store.
 */

import { useCreditOpsStore } from "@/lib/fulfillment/creditops-client-store";
import { OpsActivityTimeline } from "./OpsActivityTimeline";
import { useActivityVisibility } from "@/lib/data/use-activity-visibility";
import { useTimeline } from "@/lib/data/use-timeline";

const ACTOR = "Agent (BES HQ)";

export function ClientWorkActivityTimeline({ clientId }: { clientId: string }) {
  const store = useCreditOpsStore();
  /* Which audiences this user may post to — resolved centrally, not here. */
  const client = store.clients.find((c) => c.id === clientId);
  const { allowed } = useActivityVisibility(
    client?.organizationId ?? client?.outsourcingGroupId,
    "creditops",
  );

  /* Live entries come from the canonical table, already filtered by RLS to
     what this user may read. The store's own list is the demo fallback. */
  const timeline = useTimeline("fulfillment_client", clientId);
  const entries =
    timeline.source === "live" ? timeline.entries : store.getActivity(clientId);

  return (
    <OpsActivityTimeline
      entries={entries}
      actor={ACTOR}
      emptyMessage="No system activity logged yet."
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
