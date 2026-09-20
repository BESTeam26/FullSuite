-- D-021 part 2 — configuration as data, capabilities as keys, staged seats.
--
-- Nothing here is code that knows a person's name: seats and grants are rows
-- that management changes from People & Teams; the names below are the
-- current assignments Dee gave on 2026-09-20 and are recorded as such.

-- ── Capability keys: compensation is a protected financial domain beside payroll
insert into public.permission_keys (key, module, label, description, security_relevant, sort, owner_gated)
values
  ('compensation.view',   'payroll', 'View compensation',   'See agent compensation rates, BES cost rates, managing-partner margins and settlements. Never implied by admin, placement or payroll.view.', true, 
     (select coalesce(max(sort), 0) + 1 from public.permission_keys where module = 'payroll'), false),
  ('compensation.manage', 'payroll', 'Manage compensation', 'Create and end compensation arrangements with a reason. Never implied by admin or placement.', true,
     (select coalesce(max(sort), 0) + 2 from public.permission_keys where module = 'payroll'), false)
on conflict (key) do nothing;

-- ── Department names per Dee's current CreditOps structure
update public.departments set name = 'Support & Onboarding' where name = 'Onboarding' and division = 'creditops' and archived_at is null;
update public.departments set name = 'Client Success'       where name = 'Client Success / Support' and division = 'creditops' and archived_at is null;

-- ── Staged onboarding applies grants and seats on acceptance
CREATE OR REPLACE FUNCTION public.apply_invitation_onboarding(p_invitation uuid, p_member uuid, p_user uuid, p_agency uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare o jsonb;
begin
  select payload into o from public.invitation_onboarding where invitation_id = p_invitation;
  if o is null then return; end if;
  perform set_config('bes.onboarding_apply', 'on', true);

  update public.agency_memberships
     set hired_on        = coalesce(hired_on, (o->>'hired_on')::date),
         job_title       = coalesce(job_title, nullif(o->>'job_title', '')),
         engagement_type = coalesce(engagement_type, nullif(o->>'engagement_type', ''))
   where id = p_member;

  update public.profiles set phone = coalesce(phone, nullif(o->>'phone', '')) where id = p_user;

  if o ? 'private' then
    insert into public.member_private_records
      (user_id, agency_id, date_of_birth, home_address, working_location, whatsapp_phone,
       emergency_contact_name, emergency_contact_relationship, emergency_contact_phone)
    values (p_user, p_agency, (o#>>'{private,date_of_birth}')::date, o#>>'{private,home_address}', o#>>'{private,working_location}',
            o#>>'{private,whatsapp_phone}', o#>>'{private,emergency_contact_name}', o#>>'{private,emergency_contact_relationship}',
            o#>>'{private,emergency_contact_phone}')
    on conflict (user_id) do nothing;
  end if;

  if o ? 'payout' then
    insert into public.member_payout_accounts (user_id, agency_id, method, provider, account_name, account_number, notification_email)
    values (p_user, p_agency, coalesce(o#>>'{payout,method}', 'other'), o#>>'{payout,provider}', o#>>'{payout,account_name}',
            o#>>'{payout,account_number}', nullif(o#>>'{payout,notification_email}', '')::extensions.citext)
    on conflict (user_id) do nothing;
  end if;

  /* Explicit capabilities the person was hired with (never implied by role). */
  if o ? 'grants' then
    insert into public.agency_member_permissions (membership_id, key, allowed)
    select p_member, k, true from jsonb_array_elements_text(o->'grants') as k
     where exists (select 1 from public.permission_keys pk where pk.key = k)
    on conflict (membership_id, key) do update set allowed = true;
  end if;
  /* Management seats staged for the person (D-021): placement is scope. */
  if o ? 'seats' then
    insert into public.management_seats (agency_id, user_id, seat, division_id, department_id, effective_from, reason, created_by)
    select p_agency, p_user, s->>'seat',
           case when s->>'seat' = 'division_manager'   then (select id from public.divisions   where agency_id = p_agency and name = s->>'division'   and archived_at is null) end,
           case when s->>'seat' = 'department_manager' then (select id from public.departments where agency_id = p_agency and name = s->>'department' and archived_at is null) end,
           coalesce((o->>'hired_on')::date, current_date), 'Staged on the invitation', (select created_by from public.invitation_onboarding where invitation_id = p_invitation)
      from jsonb_array_elements(o->'seats') as s
     where (s->>'seat' = 'chief_operations')
        or (s->>'seat' = 'division_manager'   and exists (select 1 from public.divisions   where agency_id = p_agency and name = s->>'division'   and archived_at is null))
        or (s->>'seat' = 'department_manager' and exists (select 1 from public.departments where agency_id = p_agency and name = s->>'department' and archived_at is null));
  end if;
  perform set_config('bes.onboarding_apply', 'off', true);
  -- Consumed: the canonical rows hold it now. Two copies is one too many.
  delete from public.invitation_onboarding where invitation_id = p_invitation;
end $function$
;

-- ── Rowell: BES CRM Division Manager (the seat the lead_id/manager_id projections already implied)
insert into public.management_seats (agency_id, user_id, seat, division_id, effective_from, reason, created_by)
select dv.agency_id, p.id, 'division_manager', dv.id, coalesce(m.hired_on, current_date), 'Current BES CRM operational lead (Dee, 2026-09-20)', (select id from public.profiles where email = 'dee@blessedempireservices.com')
  from public.profiles p join public.agency_memberships m on m.user_id = p.id
  join public.divisions dv on dv.agency_id = m.agency_id and dv.name = 'BES CRM' and dv.archived_at is null
 where p.email = 'rowellchristianpena.bes@gmail.com'
   and not exists (select 1 from public.management_seats s where s.user_id = p.id and s.seat = 'division_manager' and s.division_id = dv.id and s.effective_to is null);

-- ── Bryan (Managing Partner): compensation beside payroll; no finance keys
insert into public.agency_member_permissions (membership_id, key, allowed)
select m.id, k, true from public.agency_memberships m join public.profiles p on p.id = m.user_id, unnest(array['compensation.view','compensation.manage']) as k
 where p.email = 'lordvrye.bes@gmail.com'
on conflict (membership_id, key) do update set allowed = true;

-- ── JM (Executive Assistant): partners, invoicing, collections; nothing from payroll
insert into public.agency_member_permissions (membership_id, key, allowed)
select m.id, k, true from public.agency_memberships m join public.profiles p on p.id = m.user_id,
       unnest(array['partners.view','partners.contacts','partners.clients','partners.invoices.view','partners.invoices.manage','partners.payments.record']) as k
 where p.email = 'navalesjorelynmae.bes@gmail.com'
on conflict (membership_id, key) do update set allowed = true;

-- ── The harness fixture: bes.manager is the CreditOps Division Manager by SEAT, not by scope_division
insert into public.management_seats (agency_id, user_id, seat, division_id, effective_from, reason)
select m.agency_id, p.id, 'division_manager', dv.id, '2026-09-04', 'Fixture: the division-manager persona of the RLS matrix'
  from public.profiles p join public.agency_memberships m on m.user_id = p.id
  join public.divisions dv on dv.agency_id = m.agency_id and dv.service = 'creditops' and dv.archived_at is null
 where p.email = 'bes.manager@bes.test'
   and not exists (select 1 from public.management_seats s where s.user_id = p.id and s.effective_to is null);
