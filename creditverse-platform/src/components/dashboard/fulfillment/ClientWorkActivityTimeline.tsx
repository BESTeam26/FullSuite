/**
 * CreditOps client activity timeline — the shared ops timeline bound to the
 * CreditOps client store.
 */

import { useCreditOpsStore } from "@/lib/fulfillment/creditops-client-store";
import { OpsActivityTimeline } from "./OpsActivityTimeline";

const ACTOR = "Agent (BES HQ)";

export function ClientWorkActivityTimeline({ clientId }: { clientId: string }) {
  const store = useCreditOpsStore();

  return (
    <OpsActivityTimeline
      entries={store.getActivity(clientId)}
      actor={ACTOR}
      emptyMessage="No system activity logged yet."
      onPostComment={(detail) =>
        store.addActivity({
          clientId,
          actor: ACTOR,
          action: "Comment posted",
          detail,
        })
      }
      onTogglePin={(id) => store.togglePin(id)}
      onSetMark={(id, mark) => store.setMark(id, mark)}
    />
  );
}
