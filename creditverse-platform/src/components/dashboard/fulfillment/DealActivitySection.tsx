/**
 * Deal activity section — the shared ops timeline bound to the funding deal
 * store, so a deal's comments and system events read exactly like a client's.
 */

import { useFundingDealStore } from "@/lib/fulfillment/funding-deal-store";
import type { FundingActivityEntry } from "@/lib/fulfillment/fundingops-store-types";
import { OpsActivityTimeline } from "./OpsActivityTimeline";
import { ActivityComposer } from "@/components/composer/ActivityComposer";
import { useActivityVisibility } from "@/lib/data/use-activity-visibility";
import { docToPlainText } from "@/lib/activity/note-body";
import { useVisibilityAudience } from "@/lib/auth/use-visibility-audience";
import { useAuth } from "@/lib/auth/auth-context";

/* Who is actually doing it. Every activity entry used to be attributed to
   "Agent (BES HQ)" — a name nobody has — so history could not say who did the
   work (rules 4 and 10). Read from the session, per render. */
const useActor = () => useAuth().displayName ?? "BES staff";

/** The deal store's marks are a fixed set rather than the open mark palette. */
type DealMark = "urgent" | "resolved" | "flagged" | "info";

export function DealActivitySection({
  dealId,
  activity,
}: {
  dealId: string;
  activity: FundingActivityEntry[];
}) {
  const actor = useActor();
  const audience = useVisibilityAudience();
  const { allowed, fallback } = useActivityVisibility(undefined, "fundingops");
  const dealStore = useFundingDealStore();

  return (
    <OpsActivityTimeline
      entries={activity}
      actor={actor}
      emptyMessage="No activity yet. Status changes, comments, submissions, lender updates and attachments will appear here."
      /* The deal store keeps its own in-memory activity and its pin/mark
         handlers do change it, so these controls are real here. */
      canAnnotate
      onTogglePin={(entryId) => dealStore.togglePin(dealId, entryId)}
      onSetMark={(entryId, mark) =>
        dealStore.setMark(dealId, entryId, mark as DealMark)
      }
      composer={
        <ActivityComposer
          audience={audience}
          entityType="funding_deal"
          entityId={dealId}
          allowedVisibilities={allowed}
          defaultVisibility={fallback}
          /* The deal store keeps its own in-memory activity and does not yet
             write to `activity_events`, so there is no row to attach files to.
             `onAttach` is therefore omitted rather than stubbed — the composer
             hides nothing, it simply has no persistence to offer here yet. */
          onPost={async ({ body, visibility }) => {
            void visibility;
            dealStore.addDealActivity(
              dealId,
              "Comment posted",
              docToPlainText(body),
              actor,
            );
          }}
        />
      }
    />
  );
}
