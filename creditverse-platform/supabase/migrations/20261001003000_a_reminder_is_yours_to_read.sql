-- A reminder is addressed to you, about you (Dee, 2026-10-01: clock in,
-- clock out, submit your EOD). The select policy's catch-all asks
-- entity_visible() about the reminder's subject — a day, a clock — which it
-- does not know, so recipients could not read their own reminders and the
-- live stream never delivered them (found while testing delivery). Like a
-- notice that you were unassigned, a reminder needs no record authorization
-- beyond recipient_id = auth.uid(). Everything else in the policy is
-- unchanged.
begin;

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
for select to authenticated
using (
((recipient_id = auth.uid()) AND ((kind = ANY (ARRAY['unassigned'::text, 'reminder'::text])) OR (((agency_id, COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), visibility, entity_type) IN ( SELECT c.agency_id,
    COALESCE(c.organization_id, '00000000-0000-0000-0000-000000000000'::uuid) AS "coalesce",
    c.visibility,
    c.entity_type
   FROM notification_view_combos() c(agency_id, organization_id, visibility, entity_type))) AND
CASE entity_type
    WHEN 'fulfillment_client'::text THEN (entity_id IN ( SELECT (c.id)::text AS id
       FROM fulfillment_clients c))
    WHEN 'channel'::text THEN (entity_id IN ( SELECT (ch.id)::text AS id
       FROM channels ch))
    WHEN 'work_item'::text THEN (entity_id IN ( SELECT (w.id)::text AS id
       FROM work_items w))
    WHEN 'time_entry'::text THEN (entity_id IN ( SELECT (te.id)::text AS id
       FROM time_entries te))
    ELSE entity_visible(entity_type, entity_id)
END)))
);

commit;
