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
import type { VisibilityAudience } from "@/lib/auth/use-visibility-audience";
import { useMentionable } from "@/lib/data/use-mentionable";

/* Who is actually doing it. Every activity entry used to be attributed to
   "Agent (BES HQ)" — a name nobody has — so history could not say who did the
   work (rules 4 and 10). Read from the session, per render. */
const useActor = () => useAuth().displayName ?? "BES staff";
const ENTITY = "fulfillment_client";

export function ClientWorkActivityTimeline({ clientId }: { clientId: string }) {
  const actor = useActor();
  const store = useCreditOpsStore();
  const auth = useAuth();
  const audience: VisibilityAudience = auth.isAgencyStaff ? "bes" : "organization";
  /* Which audiences this user may post to — resolved centrally, not here. */
  const client = store.clients.find((c) => c.id === clientId);
  const mention = useMentionable(client?.organizationId);
  const { allowed, fallback } = useActivityVisibility(
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
  const { byActivity, refresh: refreshAttachments } =
    useActivityAttachments(activityIds);

  return (
    <OpsActivityTimeline
      entries={entries}
      actor={actor}
      emptyMessage="No system activity logged yet."
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
              actor: actor,
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
