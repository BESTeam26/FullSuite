-- =============================================================================
-- Membership audit events become readable. set_agency_member_role has always
-- written its 'agency_member' activity event, and set_agency_member_profile
-- (0267) writes the same shape — but entity_visible() had no branch for the
-- type, so its `else false` hid every one of them from every reader. Caught
-- by the new phase-37 probe ("a real change is audited with both values": the
-- row existed, nobody could see it). Visibility follows the membership row
-- itself, through the caller's own RLS — the function stays SECURITY INVOKER.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.entity_visible(p_entity_type text, p_entity_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case p_entity_type
    when 'fulfillment_client' then exists (select 1 from public.fulfillment_clients c where c.id::text = p_entity_id)
    when 'funding_client'     then exists (select 1 from public.funding_clients c where c.id::text = p_entity_id)
    when 'work_item'          then exists (select 1 from public.work_items w where w.id::text = p_entity_id)
    when 'funding_file'       then exists (select 1 from public.funding_files f where f.id::text = p_entity_id)
    when 'eod_submission'     then exists (select 1 from public.eod_submissions e where e.id::text = p_entity_id)
    when 'channel'            then exists (select 1 from public.channels c where c.id::text = p_entity_id)
    when 'channel_message'    then exists (select 1 from public.messages m where m.id = public.try_bigint(p_entity_id))
    when 'client'             then exists (select 1 from public.clients c where c.id::text = p_entity_id)
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
    /* A rate event is visible exactly when the person's rate rows are. */
    when 'pay_rate'           then exists (select 1 from public.member_pay_rates r where r.user_id::text = p_entity_id)
    when 'payroll_cutoff'     then exists (select 1 from public.payroll_cutoffs pc where pc.id::text = p_entity_id)
    /* A membership event (role or access-profile change) is visible exactly
       when the person's membership row is — SECURITY INVOKER, so the caller's
       own RLS decides (0268; these audits were written but unreadable). */
    when 'agency_member'      then exists (select 1 from public.agency_memberships m where m.user_id::text = p_entity_id)
    else false
  end
$function$
;
