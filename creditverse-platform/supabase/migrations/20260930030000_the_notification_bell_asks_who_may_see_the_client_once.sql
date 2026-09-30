-- The notification bell asks "who may see the client" once, not per row.
--
-- FullSuite performance audit, 2026-09-30. The bell polls
-- `notifications where read_at is null` on every page, for every user.
-- `notifications_select` called `entity_visible(entity_type, entity_id)`
-- per row — the same per-row client-policy rebuild the timeline, files
-- and custom-value policies had — and unread notifications are many:
--
--   Jet Manugas      496 unread   30,941 ms
--   Daniel           262 unread   17,337 ms
--   Allyssa          158 unread    8,831 ms
--   Alvaro            97 unread    4,940 ms
--   Dee (owner)       31 unread    2,629 ms
--
-- That is the "app feels slow" of the whole product: a 5–31 second query
-- on every screen, all day, and the database busy with it for everyone
-- else. Dee's rule: no known 10-second interaction may ship.
--
-- For fulfillment_client notifications (the great majority) the client
-- check is one hashed set per statement; every other entity type keeps
-- `entity_visible()`. recipient_id = auth.uid(), can_view_activity and
-- the 'unassigned' branch are untouched. Proven per account — old policy
-- against new, on the account's own rows, inside one transaction.
--
-- Cost impact: strictly less, everywhere, all day.

begin;

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
for select to authenticated
using (
  recipient_id = auth.uid()
  and (
    kind = 'unassigned'
    or (
      public.can_view_activity(agency_id, organization_id, visibility, entity_type)
      and (
        (entity_type = 'fulfillment_client'
          and entity_id in (select c.id::text from public.fulfillment_clients c))
        or (entity_type <> 'fulfillment_client'
          and public.entity_visible(entity_type, entity_id))
      )
    )
  )
);

commit;
