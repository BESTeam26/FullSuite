/**
 * CreditOps client activity timeline — the shared ops timeline and the shared
 * composer, bound to the CreditOps client store.
 */
import { useMemo } from "react";
import { useCreditOpsStore } from "@/lib/fulfillment/creditops-client-store";
import { OpsActivityTimeline } from "./OpsActivityTimeline";
import { ActivityComposer } from "@/components/composer/ActivityComposer";
import { useActivityVisibility } from "@/lib/data/use-activity-visibility";
import { useTimeline } from "@/lib/data/use-timeline";
import { useActivityAttachments } from "@/lib/data/use-activity-attachments";
import { useAuth } from "@/lib/auth/auth-context";
import { linkAttachments } from "@/lib/data/activity-attachments";

const ACTOR = "Agent (BES HQ)";
const ENTITY = "fulfillment_client";

export function ClientWorkActivityTimeline({ clientId }: { clientId: string }) {
  const store = useCreditOpsStore();
  const auth = useAuth();
  /* Which audiences this user may post to — resolved centrally, not here. */
  const client = store.clients.find((c) => c.id === clientId);
  const { allowed } = useActivityVisibility(
    client?.organizationId ?? client?.outsourcingGroupId,
    "creditops",
  );

  /* Live entries come from the canonical table, already filtered by RLS to
     what this user may read. The store's own list is the demo fallback. */
  const timeline = useTimeline(ENTITY, clientId);
  const entries =
    timeline.source === "live" ? timeline.entries : store.getActivity(clientId);

  /* One query for every attachment on the visible notes, not one per note. */
  const activityIds = useMemo(() => entries.map((e) => e.id), [entries]);
  const { byActivity } = useActivityAttachments(activityIds);

  return (
    <OpsActivityTimeline
      entries={entries}
      actor={ACTOR}
      emptyMessage="No system activity logged yet."
      attachmentsByActivity={byActivity}
      onTogglePin={(id) => store.togglePin(id)}
      onSetMark={(id, mark) => store.setMark(id, mark)}
      composer={
        <ActivityComposer
          entityType={ENTITY}
          entityId={clientId}
          organizationId={client?.organizationId}
          allowedVisibilities={allowed}
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
            /* The note is already on screen; its attachments arrive with the
               next read of the attachment query, which this invalidates. */
            timeline.refresh();
          }}
        />
      }
    />
  );
}
