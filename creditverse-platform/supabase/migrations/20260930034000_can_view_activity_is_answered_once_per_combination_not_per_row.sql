-- can_view_activity() is answered once per combination, not once per row.
--
-- Reporting audit, 2026-09-30. `can_view_activity(agency, organization,
-- visibility, entity_type)` costs 3.25 ms a call (it asks is_org_member,
-- is_staff_of and bes_may_fulfil), and the timeline and notification
-- policies call it per row. A statement that touches thousands of activity
-- rows — the reporting facts view's status-change arm, any long history —
-- pays seconds: 1,614 rows in 180 days as the owner was 5 s of it; a
-- looser scan was 33 s.
--
-- The function's answer depends only on its four arguments, and the whole
-- events table holds 33 distinct combinations (notifications: 20). Each
-- policy now asks the same function once per combination the table holds
-- and tests membership of the row's (agency, organization, visibility,
-- entity_type) in that set — the same predicate, evaluated ~33 times per
-- statement instead of ~20,000. Nothing else in either policy changes.
-- Proven per account, old policy against new, on sampled rows of both
-- tables inside one transaction.
--
-- `report_scope_options` gives the Reporting page its division and
-- department filter lists in one light statement instead of two KPI
-- pivots (same source, report_facts_scoped, same window and organization).
--
-- Cost impact: less on every activity or notification scan.

begin;

/* The combinations the caller may view. Definer, so the scan of the table
   does not re-enter the table's own policy (42P17); what leaves the function
   is never a row — only (agency, organization, visibility, entity_type)
   tuples that can_view_activity() already says yes to for this caller. */
create or replace function public.activity_view_combos()
returns table(agency_id uuid, organization_id uuid, visibility public.activity_visibility, entity_type text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select x.agency_id, x.organization_id, x.visibility, x.entity_type
    from (select distinct e.agency_id, e.organization_id, e.visibility, e.entity_type from public.activity_events e) x
   where public.can_view_activity(x.agency_id, x.organization_id, x.visibility, x.entity_type)
$$;
revoke all on function public.activity_view_combos() from public;
grant execute on function public.activity_view_combos() to authenticated;

create or replace function public.notification_view_combos()
returns table(agency_id uuid, organization_id uuid, visibility public.activity_visibility, entity_type text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select x.agency_id, x.organization_id, x.visibility, x.entity_type
    from (select distinct n.agency_id, n.organization_id, n.visibility, n.entity_type
            from public.notifications n where n.recipient_id = auth.uid()) x
   where public.can_view_activity(x.agency_id, x.organization_id, x.visibility, x.entity_type)
$$;
revoke all on function public.notification_view_combos() from public;
grant execute on function public.notification_view_combos() to authenticated;

drop policy if exists activity_events_select on public.activity_events;
create policy activity_events_select on public.activity_events
for select to authenticated
using (
  /* NULL-safe: a row comparison with a NULL organization is never TRUE, so
     the NULL is folded to a sentinel on both sides (it is a membership key
     here, never an authorization value). */
  (agency_id, coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), visibility, entity_type) in (
    select c.agency_id, coalesce(c.organization_id, '00000000-0000-0000-0000-000000000000'::uuid), c.visibility, c.entity_type
      from public.activity_view_combos() c)
  and case entity_type
    when 'fulfillment_client' then entity_id in (select c.id::text from public.fulfillment_clients c)
    when 'work_item'          then entity_id in (select w.id::text from public.work_items w)
    when 'channel'            then entity_id in (select ch.id::text from public.channels ch)
    when 'time_entry'         then entity_id in (select te.id::text from public.time_entries te)
    else public.entity_visible(entity_type, entity_id)
  end
  and (entity_type <> 'agency_member' or field is null
       or field <> all (array['member_document', 'signature_request'])
       or entity_id = (auth.uid())::text
       or public.agency_can('people.documents.manage') or public.agency_can('documents.manage'))
  and (coalesce(field, '') <> 'compensation' or public.reads_bes_cost(agency_id))
  and (coalesce(field, '') <> all (array['rate', 'adjustment'])
       or entity_id = (auth.uid())::text or public.reads_agent_rate(agency_id))
);

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
for select to authenticated
using (
  recipient_id = auth.uid()
  and (
    kind = 'unassigned'
    or (
      (agency_id, coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), visibility, entity_type) in (
        select c.agency_id, coalesce(c.organization_id, '00000000-0000-0000-0000-000000000000'::uuid), c.visibility, c.entity_type
          from public.notification_view_combos() c)
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

create or replace function public.report_scope_options(p_from date, p_to date, p_organization uuid default null)
returns table(division text, department text)
language sql
stable
set search_path to 'public'
as $$
  select distinct f.division, f.department_scoped
    from public.report_facts_scoped f
   where f.fact_date between p_from and p_to
     and (p_organization is null or f.organization_id = p_organization)
   order by 1, 2
$$;
revoke all on function public.report_scope_options(date, date, uuid) from public;
grant execute on function public.report_scope_options(date, date, uuid) to authenticated;

commit;
