-- History nobody can read, and money everybody can.
--
-- Two faults in the audit trail, found together because they are the same
-- oversight from opposite ends: nobody checked WHO reads an activity event.
--
-- 1. THE LEAK. The compensation trigger writes the whole arrangement into
--    `new_value` — "managing_partner agent 8000 cost 10000". The row is an
--    ordinary `profile` event, so Archie could read, in plain text, that BES
--    pays PHP 100 for him while he receives PHP 80. Every column grant and
--    gated view built today was undone by one sentence in an audit log.
--
-- 2. THE SILENCE. `entity_visible()` has no branch for `agency_member`,
--    `pay_rate`, `agency`, `payroll_cutoff` or `invitation`, so it answers
--    false and NOBODY can read those events — not the person, not an admin,
--    not the owner. Eight member events, six rate changes and an invitation
--    acceptance are written and unreadable. An audit trail that cannot be
--    read is not an audit trail (rule 10). `client` events point at
--    `fulfillment_clients`, which that branch never checked, so all 29 were
--    invisible too.
--
-- Fixing (2) alone would have turned six salary rows into a new leak, which
-- is why they are one migration: the entity becomes visible and the money
-- FIELD becomes gated in the same breath.

/* ── (2) the missing entities ─────────────────────────────────────────── */
create or replace function public.entity_visible(p_entity_type text, p_entity_id text)
returns boolean language sql stable set search_path = public as $function$
  select case p_entity_type
    when 'fulfillment_client' then exists (select 1 from public.fulfillment_clients c where c.id::text = p_entity_id)
    when 'funding_client'     then exists (select 1 from public.funding_clients c where c.id::text = p_entity_id)
    when 'work_item'          then exists (select 1 from public.work_items w where w.id::text = p_entity_id)
    when 'funding_file'       then exists (select 1 from public.funding_files f where f.id::text = p_entity_id)
    when 'eod_submission'     then exists (select 1 from public.eod_submissions e where e.id::text = p_entity_id)
    when 'channel'            then exists (select 1 from public.channels c where c.id::text = p_entity_id)
    when 'channel_message'    then exists (select 1 from public.messages m where m.id = public.try_bigint(p_entity_id))
    /* A 'client' event is written against the CreditOps client record, so it
       has to look there as well as at the canonical directory. Checking only
       `clients` hid every one of them. */
    when 'client'             then exists (select 1 from public.clients c where c.id::text = p_entity_id)
                                or exists (select 1 from public.fulfillment_clients c where c.id::text = p_entity_id)
    when 'announcement'       then exists (select 1 from public.announcements a where a.id::text = p_entity_id)
    when 'crm_project'        then exists (select 1 from public.crm_projects p where p.id::text = p_entity_id)
    when 'time_entry'         then exists (select 1 from public.time_entries te where te.id::text = p_entity_id)
    when 'company_document'   then exists (select 1 from public.organizations o where o.id::text = p_entity_id)
                                or exists (select 1 from public.agencies a where a.id::text = p_entity_id)
    when 'organization'       then exists (select 1 from public.organizations o where o.id::text = p_entity_id)
    when 'activity_event'     then exists (select 1 from public.activity_events ae where ae.id = public.try_bigint(p_entity_id))
    when 'partner'            then exists (select 1 from public.outsourcing_groups g where g.id::text = p_entity_id)
    when 'work_schedule'      then exists (select 1 from public.work_schedules ws where ws.user_id::text = p_entity_id)
    when 'leave_request'      then exists (select 1 from public.leave_requests lr where lr.id::text = p_entity_id)
    when 'attendance_correction' then exists (
      select 1 from public.attendance_corrections ac where ac.id::text = p_entity_id)
    when 'payslip' then exists (select 1 from public.payslips p where p.id::text = p_entity_id)
    when 'reward_credit' then exists (
      select 1 from public.reward_credits rc where rc.id::text = p_entity_id)
    /* Added with set_member_profile (2026-09-19): a profile edit is about a PERSON, visible when their profile is. */
    when 'profile'          then exists (select 1 from public.profiles pr where pr.id::text = p_entity_id)
    /* Added 2026-09-20. All five were written and unreadable. Each is about a
       PERSON or a record that still exists; the money they may mention is
       gated by field in the policy below, not by pretending they are absent. */
    when 'agency_member'    then exists (select 1 from public.agency_memberships m where m.user_id::text = p_entity_id)
    when 'pay_rate'         then exists (select 1 from public.agency_memberships m where m.user_id::text = p_entity_id)
    when 'agency'           then exists (select 1 from public.agencies a where a.id::text = p_entity_id)
    when 'payroll_cutoff'   then exists (select 1 from public.payroll_cutoffs c where c.id::text = p_entity_id)
                                or exists (select 1 from public.agencies a where a.id::text = p_entity_id)
    when 'invitation'       then exists (select 1 from public.invitations i where i.id::text = p_entity_id)
    else false
  end
$function$;

/* ── (1) money in an audit event is still money ───────────────────────── */
drop policy if exists activity_events_select on public.activity_events;
create policy activity_events_select on public.activity_events
  for select to authenticated
  using (
    can_view_activity(agency_id, organization_id, visibility, entity_type)
    and entity_visible(entity_type, entity_id)
    /* A colleague's documents are as private as the documents (0294). */
    and (entity_type <> 'agency_member'
         or field is null
         or field <> all (array['member_document', 'signature_request'])
         or entity_id = auth.uid()::text
         or agency_can('people.documents.manage')
         or agency_can('documents.manage'))
    /* What BES pays, and any partner's margin: the same gate the column and
       the view use. The worker is NOT an exception here — the whole point of
       the arrangement split is that this number is not theirs to see. */
    and (coalesce(field, '') <> 'compensation' or reads_bes_cost(agency_id))
    /* A rate or an adjustment is the worker's own money: theirs to read, and
       otherwise payroll's. */
    and (coalesce(field, '') not in ('rate', 'adjustment')
         or entity_id = auth.uid()::text
         or reads_agent_rate(agency_id))
  );

/* The compensation trigger's own text still names both sides, which is what
   makes it worth gating rather than trimming: an auditor with the capability
   must be able to see what changed (rule 10). */
comment on policy activity_events_select on public.activity_events is
  'Activity is readable when the viewer may see the entity AND the field. Document fields follow the document rule; compensation needs compensation.bes_cost.view; a rate or adjustment is the subject''s own or payroll''s.';
