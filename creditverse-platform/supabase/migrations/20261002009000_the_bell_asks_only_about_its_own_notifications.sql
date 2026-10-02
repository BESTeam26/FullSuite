-- The bell asks only about its own notifications (Go-Live NEEDS FIX:
-- "Notification bell … 1.14 s per poll (every page, every minute)").
--
-- The unread badge polls `count(*) from notifications where read_at is null`
-- once a minute on every page. Its read rule checked a notification's subject
-- with `entity_id IN (select id::text from fulfillment_clients)` — and the
-- same for channels, work items and time entries. Postgres answers that by
-- building the caller's ENTIRE visible set first: 2,144 clients through the
-- clients row rule (87 ms for Allyssa) and every channel through
-- channel_auditable() (111 ms), before looking at a single notification. A
-- fixed ~280 ms per poll for 16 unread rows, whatever the count.
--
-- Now each subject is looked up by its primary key — `exists (select 1 from
-- fulfillment_clients c where c.id = try_uuid(entity_id))` — so the client's
-- own row rule runs only for the clients the caller's notifications are
-- about. The same row rules decide; only the order of work changes. The
-- per-combination check from 20260930034000 and the reminder/unassigned
-- branch from 20261001003000 are kept as they were.
--
-- entity_visible(), the catch-all the same rule (and the activity history and
-- files rules) asks about any other subject, compared `id::text = p_entity_id`
-- — a text comparison no index can serve, so each call read the whole table
-- through its own row rule: 40 ms for one EOD notification. Each branch now
-- compares `id = try_uuid(p_entity_id)`, the primary key. Same rows match: an
-- id written as text is the uuid's own text, and try_uuid() returns null —
-- no match — for anything that is not a uuid, exactly as the text compare
-- found nothing.
--
-- Proven per account, old against new, inside one transaction: the same
-- notification ids, and the same rows of sampled activity history and files,
-- visible to each.
--
-- Cost impact: less database time on every page for every signed-in person.

begin;

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
for select to authenticated
using (
  recipient_id = auth.uid()
  and (
    kind = any (array['unassigned'::text, 'reminder'::text])
    or (
      (agency_id, coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), visibility, entity_type) in (
        select c.agency_id,
               coalesce(c.organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
               c.visibility,
               c.entity_type
          from public.notification_view_combos() c(agency_id, organization_id, visibility, entity_type))
      and case entity_type
            when 'fulfillment_client' then exists (select 1 from public.fulfillment_clients c where c.id = public.try_uuid(entity_id))
            when 'channel'            then exists (select 1 from public.channels ch where ch.id = public.try_uuid(entity_id))
            when 'work_item'          then exists (select 1 from public.work_items w where w.id = public.try_uuid(entity_id))
            when 'time_entry'         then exists (select 1 from public.time_entries te where te.id = public.try_uuid(entity_id))
            else public.entity_visible(entity_type, entity_id)
          end
    )
  )
);

CREATE OR REPLACE FUNCTION public.entity_visible(p_entity_type text, p_entity_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case p_entity_type
    when 'fulfillment_client' then exists (select 1 from public.fulfillment_clients c where c.id = public.try_uuid(p_entity_id))
    when 'funding_client'     then exists (select 1 from public.funding_clients c where c.id = public.try_uuid(p_entity_id))
    when 'work_item'          then exists (select 1 from public.work_items w where w.id = public.try_uuid(p_entity_id))
    when 'funding_file'       then exists (select 1 from public.funding_files f where f.id = public.try_uuid(p_entity_id))
    when 'eod_submission'     then exists (select 1 from public.eod_submissions e where e.id = public.try_uuid(p_entity_id))
    when 'channel'            then exists (select 1 from public.channels c where c.id = public.try_uuid(p_entity_id))
    when 'channel_message'    then exists (select 1 from public.messages m where m.id = public.try_bigint(p_entity_id))
    /* A 'client' event is written against the CreditOps client record, so it
       has to look there as well as at the canonical directory. Checking only
       `clients` hid every one of them. */
    when 'client'             then exists (select 1 from public.clients c where c.id = public.try_uuid(p_entity_id))
                                or exists (select 1 from public.fulfillment_clients c where c.id = public.try_uuid(p_entity_id))
    when 'announcement'       then exists (select 1 from public.announcements a where a.id = public.try_uuid(p_entity_id))
    when 'crm_project'        then exists (select 1 from public.crm_projects p where p.id = public.try_uuid(p_entity_id))
    when 'time_entry'         then exists (select 1 from public.time_entries te where te.id = public.try_uuid(p_entity_id))
    when 'company_document'   then exists (select 1 from public.organizations o where o.id = public.try_uuid(p_entity_id))
                                or exists (select 1 from public.agencies a where a.id = public.try_uuid(p_entity_id))
    when 'organization'       then exists (select 1 from public.organizations o where o.id = public.try_uuid(p_entity_id))
    when 'activity_event'     then exists (select 1 from public.activity_events ae where ae.id = public.try_bigint(p_entity_id))
    when 'partner'            then exists (select 1 from public.outsourcing_groups g where g.id = public.try_uuid(p_entity_id))
    when 'work_schedule'      then exists (select 1 from public.work_schedules ws where ws.user_id = public.try_uuid(p_entity_id))
    when 'leave_request'      then exists (select 1 from public.leave_requests lr where lr.id = public.try_uuid(p_entity_id))
    when 'attendance_correction' then exists (
      select 1 from public.attendance_corrections ac where ac.id = public.try_uuid(p_entity_id))
    when 'payslip' then exists (select 1 from public.payslips p where p.id = public.try_uuid(p_entity_id))
    when 'reward_credit' then exists (
      select 1 from public.reward_credits rc where rc.id = public.try_uuid(p_entity_id))
    /* Added with set_member_profile (2026-09-19): a profile edit is about a PERSON, visible when their profile is. */
    when 'profile'          then exists (select 1 from public.profiles pr where pr.id = public.try_uuid(p_entity_id))
    /* Added 2026-09-20. All five were written and unreadable. Each is about a
       PERSON or a record that still exists; the money they may mention is
       gated by field in the policy below, not by pretending they are absent. */
    when 'agency_member'    then exists (select 1 from public.agency_memberships m where m.user_id = public.try_uuid(p_entity_id))
    when 'pay_rate'         then exists (select 1 from public.agency_memberships m where m.user_id = public.try_uuid(p_entity_id))
    when 'agency'           then exists (select 1 from public.agencies a where a.id = public.try_uuid(p_entity_id))
    when 'payroll_cutoff'   then exists (select 1 from public.payroll_cutoffs c where c.id = public.try_uuid(p_entity_id))
                                or exists (select 1 from public.agencies a where a.id = public.try_uuid(p_entity_id))
    when 'invitation'       then exists (select 1 from public.invitations i where i.id = public.try_uuid(p_entity_id))
    else false
  end
$function$;

commit;
