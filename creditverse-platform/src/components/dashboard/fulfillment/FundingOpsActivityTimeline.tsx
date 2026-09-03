/**
 * FundingOps client activity timeline — the shared ops timeline bound to the
 * FundingOps client store.
 */

import { useFundingOpsStore } from "@/lib/fulfillment/fundingops-client-store";
import { OpsActivityTimeline } from "./OpsActivityTimeline";

const ACTOR = "Agent (BES HQ)";

export function FundingOpsActivityTimeline({ clientId }: { clientId: string }) {
  const store = useFundingOpsStore();

  return (
    <OpsActivityTimeline
      entries={store.getActivity(clientId)}
      actor={ACTOR}
      emptyMessage="No activity yet. Status changes, comments, and updates are logged here."
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
