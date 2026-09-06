/**
 * FundingOps client activity timeline — the shared ops timeline and the shared
 * composer, bound to the CreditOps client store.
 */
import { useMemo } from "react";
import { useFundingOpsStore } from "@/lib/fulfillment/fundingops-client-store";
import { OpsActivityTimeline } from "./OpsActivityTimeline";
import { ActivityComposer } from "@/components/composer/ActivityComposer";
import { useActivityVisibility } from "@/lib/data/use-activity-visibility";
import { useTimeline } from "@/lib/data/use-timeline";
import { useActivityAttachments } from "@/lib/data/use-activity-attachments";
import { useAuth } from "@/lib/auth/auth-context";
import { linkAttachments } from "@/lib/data/activity-attachments";
import type { VisibilityAudience } from "@/lib/auth/use-visibility-audience";
import { useMentionable } from "@/lib/data/use-mentionable";

const ACTOR = "Agent (BES HQ)";
const ENTITY = "funding_client";

export function FundingOpsActivityTimeline({ clientId }: { clientId: string }) {
  const store = useFundingOpsStore();
  const auth = useAuth();
  const audience: VisibilityAudience = auth.isAgencyStaff ? "bes" : "organization";
  /* Which audiences this user may post to — resolved centrally, not here. */
  const client = store.clients.find((c) => c.id === clientId);
  const mention = useMentionable(client?.organizationId);
  const { allowed, fallback } = useActivityVisibility(
    client?.organizationId ?? client?.outsourcingGroupId,
    "fundingops",
  );

  /* Live entries come from the canonical table, already filtered by RLS to
     what this user may read. The store's own list is the demo fallback. */
  const timeline = useTimeline(ENTITY, clientId);
  const entries =
    timeline.source === "live" ? timeline.entries : store.getActivity(clientId);

  /* One query for every attachment on the visible notes, not one per note. */
  const activityIds = useMemo(() => entries.map((e) => e.id), [entries]);
  const { byActivity, refresh: refreshAttachments } =
    useActivityAttachments(activityIds);

  return (
    <OpsActivityTimeline
      entries={entries}
      actor={ACTOR}
      emptyMessage="No activity yet. Status changes, comments, and updates are logged here."
      attachmentsByActivity={byActivity}
      canAnnotate={store.canAnnotate}
      onTogglePin={(id) => store.togglePin(id)}
      onSetMark={(id, mark) => store.setMark(id, mark)}
      composer={
        <ActivityComposer
          audience={audience}
          entityType={ENTITY}
          entityId={clientId}
          organizationId={client?.organizationId}
          mentionable={mention.mentionable}
          mentionAvatars={mention.mentionAvatars}
          allowedVisibilities={allowed}
          defaultVisibility={fallback}
          /* The store persists the note and places the returned row into the
             timeline cache, so nothing here refetches. */
          onPost={({ body, plainText, visibility }) =>
            store.addActivity({
              clientId,
              actor: ACTOR,
              action: "Comment posted",
              detail: plainText,
              visibility,
              body,
            })
          }
          onAttach={async (activityId, objects) => {
            if (!auth.agencyId || !auth.user) return;
            await linkAttachments({
              activityId,
              agencyId: auth.agencyId,
              organizationId: client?.organizationId,
              uploaderId: auth.user.id,
              objects,
            });
            /* The note is already on screen. Only the attachment query is
               stale, so only that is invalidated — refreshing the timeline
               would refetch every note to show a file on one of them. */
            refreshAttachments();
          }}
        />
      }
    />
  );
}
