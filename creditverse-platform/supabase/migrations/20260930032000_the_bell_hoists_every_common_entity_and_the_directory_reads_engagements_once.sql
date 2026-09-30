-- The bell hoists every common entity; the directory reads engagements once.
--
-- After 20260930030000 the bell still took ~2 s for the owner: her unread
-- rows are channel mentions, and `entity_visible('channel', id)` per row
-- re-runs the channels policy per notification. The same set-based check
-- now covers the entity types that make up the notifications table —
-- fulfillment_client, channel, work_item, time_entry — and only the rare
-- rest still call entity_visible(). Same rows, proven per account.
--
-- `my_visible_client_ids()` (20260930031000) asked bes_may_fulfil() twice
-- per distinct scope pair: 26 pairs × 2 × 28 ms ≈ the 850 ms it cost. The
-- predicate is the same — a live engagement for creditops or fundingops
-- with an agency the caller is staff of — restated as ONE set of
-- (organization, partner) scopes the caller may fulfil for, joined to the
-- clients. Proven per account, every row.
--
-- Cost impact: less, on every page (the bell) and every client list.

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
      and case entity_type
        when 'fulfillment_client' then entity_id in (select c.id::text from public.fulfillment_clients c)
        when 'channel'            then entity_id in (select ch.id::text from public.channels ch)
        when 'work_item'          then entity_id in (select w.id::text from public.work_items w)
        when 'time_entry'         then entity_id in (select te.id::text from public.time_entries te)
        else public.entity_visible(entity_type, entity_id)
      end
    )
  )
);

create or replace function public.my_visible_client_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  with fulfil as (
    /* Every (organization, partner) scope BES may fulfil for, for a caller
       who is staff of the engagement's agency — bes_may_fulfil() as a set. */
    select distinct e.organization_id, e.outsourcing_group_id
      from public.fulfillment_engagements e
     where e.service in ('creditops', 'fundingops')
       and public.engagement_is_live(e.status, e.effective_from, e.effective_to)
       and public.is_staff_of(e.agency_id)
  ),
  orgs as (
    select distinct c.organization_id from public.clients c
     where c.organization_id is not null and public.is_org_member(c.organization_id)
  )
  select c.id
    from public.clients c
   where c.portal_user_id = auth.uid()
      or (c.organization_id is not null and c.organization_id in (select organization_id from orgs))
      or (public.is_staff_of(c.agency_id)
          and ((c.organization_id is not null and c.organization_id in (select f.organization_id from fulfil f where f.organization_id is not null))
               or (c.outsourcing_group_id is not null and c.outsourcing_group_id in (select f.outsourcing_group_id from fulfil f where f.outsourcing_group_id is not null))))
$$;

commit;
