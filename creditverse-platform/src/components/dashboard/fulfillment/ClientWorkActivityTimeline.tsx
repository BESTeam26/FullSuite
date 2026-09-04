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
      onPostComment={(detail, visibility) => {
        store.addActivity({
          clientId,
          actor: ACTOR,
          action: "Comment posted",
          detail,
          visibility,
        });
        // The store writes optimistically; refetch so the persisted row (and
        // its badge) replaces the local echo.
        timeline.refresh();
      }}
      onTogglePin={(id) => store.togglePin(id)}
      onSetMark={(id, mark) => store.setMark(id, mark)}
    />
  );
}
