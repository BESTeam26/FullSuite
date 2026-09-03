/**
 * Deal activity section — the shared ops timeline bound to the funding deal
 * store, so a deal's comments and system events read exactly like a client's.
 */

import { useFundingDealStore } from "@/lib/fulfillment/funding-deal-store";
import type { FundingActivityEntry } from "@/lib/fulfillment/fundingops-store-types";
import { OpsActivityTimeline } from "./OpsActivityTimeline";

const ACTOR = "Agent (BES HQ)";

/** The deal store's marks are a fixed set rather than the open mark palette. */
type DealMark = "urgent" | "resolved" | "flagged" | "info";

export function DealActivitySection({
  dealId,
  activity,
}: {
  dealId: string;
  activity: FundingActivityEntry[];
}) {
  const dealStore = useFundingDealStore();

  return (
    <OpsActivityTimeline
      entries={activity}
      actor={ACTOR}
      emptyMessage="No activity yet. Status changes, comments, submissions, lender updates and attachments will appear here."
      onPostComment={(detail) =>
        dealStore.addDealActivity(dealId, "Comment posted", detail, ACTOR)
      }
      onTogglePin={(entryId) => dealStore.togglePin(dealId, entryId)}
      onSetMark={(entryId, mark) =>
        dealStore.setMark(dealId, entryId, mark as DealMark)
      }
    />
  );
}
