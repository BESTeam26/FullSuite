-- Dee's roster decisions, 2026-09-19:
--   "Hire date: add it and recompute every Employee ID from the true join
--    date." · "Employee ID format: keep the approved format." · "Payment and
--    personal details: build the payroll-only payee record plus address and
--    emergency contact — I NEED IT." · "The seven unaccepted invitations —
--    SEND THEM."
--
-- 1. hired_on — the true join date on the membership. Employee IDs derive
--    their month and sequence from it (created_at is only the fallback for a
--    membership with no hire date yet). A change to hired_on recomputes the
--    agency's IDs in one pass, audited per person.
-- 2. member_payout_accounts — where payroll pays a person. Readable by the
--    person and by payroll capability; nobody else, and never a team lead.
-- 3. invitation_onboarding — HR facts staged against an OPEN invitation
--    (hire date, position, phone, private record, payout account) and applied
--    the moment the person accepts, then deleted. No role may read it; only
--    the acceptance function does. The alternative — holding thirteen people's
--    bank numbers in a chat transcript until they sign in — is not a system.

-- ── 1. Hire date and Employee IDs ────────────────────────────────────────────
alter table public.agency_memberships add column if not exists hired_on date;
comment on column public.agency_memberships.hired_on is
  'The day the person joined BES. Drives the Employee ID; created_at is when the account was made and is only the fallback.';

create or replace function public.employee_code_for(p_agency uuid, p_membership uuid, p_user uuid, p_joined timestamptz)
returns text language sql stable set search_path = public as $function$
  with person as (
    select coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1)) as name,
           coalesce(p.is_fixture, false) as fixture
      from public.profiles p where p.id = p_user
  ), words as (
    select regexp_split_to_array(trim(regexp_replace(regexp_replace(name, '[^[:alpha:] ]', '', 'g'), '\s+', ' ', 'g')), ' ') as w, fixture from person
  ), initials as (
    select case when fixture then 'FX'
                else coalesce(nullif(upper(left(w[1], 1)) || upper(left(w[array_length(w, 1)], 1)), ''), 'XX') end as ini,
           fixture
      from words
  ), seq as (
    -- Ordered by the effective join date, then by row id for a same-day tie.
    select count(*) + 1 as n
      from public.agency_memberships m join public.profiles mp on mp.id = m.user_id
     where m.agency_id = p_agency
       and coalesce(mp.is_fixture, false) = (select fixture from person)
       and (coalesce(m.hired_on::timestamptz, m.created_at), m.id) < (p_joined, p_membership)
  )
  select initials.ini || to_char(p_joined, 'MMYYYY') || '-' || lpad(seq.n::text, 3, '0') from initials, seq
$function$;

create or replace function public.agency_memberships_assign_employee_code() returns trigger
language plpgsql security definer set search_path = public as $function$
begin
  if new.employee_code is null then
    new.created_at := coalesce(new.created_at, now());
    new.employee_code := public.employee_code_for(new.agency_id, new.id, new.user_id, coalesce(new.hired_on::timestamptz, new.created_at));
  end if;
  return new;
end $function$;

-- The owner-only guard stands aside for one thing: the system recomputing
-- IDs after a hire date changed. That path audits every change itself.
create or replace function public.agency_memberships_protect_employee_code() returns trigger
language plpgsql security definer set search_path = public as $function$
declare v_actor text;
begin
  if new.employee_code is distinct from old.employee_code then
    if current_setting('bes.employee_code_recompute', true) = 'on' then return new; end if;
    if not exists (select 1 from public.agency_memberships m where m.user_id = auth.uid() and m.agency_id = old.agency_id and m.is_owner and m.status = 'active') then
      raise exception 'The Employee ID is assigned once and changed only by the owner' using errcode = '42501';
    end if;
    select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
    insert into public.activity_events (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, previous_value, new_value, visibility)
    values (old.agency_id, 'profile', old.user_id::text, auth.uid(), v_actor, 'Employee ID changed', 'employee_code', old.employee_code, new.employee_code, 'bes_internal');
  end if;
  return new;
end $function$;

-- Recompute every ID in the agency from the effective join dates. Two passes
-- because the codes are unique: clear the ones that move, then assign — a
-- single pass could hand A the code B still holds.
create or replace function public.recompute_employee_codes_internal(p_agency uuid) returns integer
language plpgsql security definer set search_path = public as $function$
declare v_actor text; v_n integer;
begin
  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  perform set_config('bes.employee_code_recompute', 'on', true);
  insert into public.activity_events (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, previous_value, new_value, visibility)
  select m.agency_id, 'profile', m.user_id::text, auth.uid(), v_actor, 'Employee ID recomputed from hire date', 'employee_code',
         m.employee_code, public.employee_code_for(m.agency_id, m.id, m.user_id, coalesce(m.hired_on::timestamptz, m.created_at)), 'bes_internal'
    from public.agency_memberships m
   where m.agency_id = p_agency
     and m.employee_code is distinct from public.employee_code_for(m.agency_id, m.id, m.user_id, coalesce(m.hired_on::timestamptz, m.created_at));
  get diagnostics v_n = row_count;
  update public.agency_memberships m set employee_code = null
   where m.agency_id = p_agency
     and m.employee_code is distinct from public.employee_code_for(m.agency_id, m.id, m.user_id, coalesce(m.hired_on::timestamptz, m.created_at));
  update public.agency_memberships m
     set employee_code = public.employee_code_for(m.agency_id, m.id, m.user_id, coalesce(m.hired_on::timestamptz, m.created_at))
   where m.agency_id = p_agency and m.employee_code is null;
  perform set_config('bes.employee_code_recompute', 'off', true);
  return v_n;
end $function$;
revoke all on function public.recompute_employee_codes_internal(uuid) from public, anon, authenticated;

create or replace function public.recompute_employee_codes(p_agency uuid) returns integer
language plpgsql security definer set search_path = public as $function$
begin
  if not public.is_manager_of(p_agency) then
    raise exception 'Only management recomputes Employee IDs' using errcode = '42501';
  end if;
  return public.recompute_employee_codes_internal(p_agency);
end $function$;
revoke all on function public.recompute_employee_codes(uuid) from public, anon;
grant execute on function public.recompute_employee_codes(uuid) to authenticated;

-- Per row (Postgres allows no transition table on a column-list trigger); the
-- recompute is idempotent, so a multi-row change just repeats a no-op.
create or replace function public.agency_memberships_hired_on_changed() returns trigger
language plpgsql security definer set search_path = public as $function$
begin
  perform public.recompute_employee_codes_internal(new.agency_id);
  return null;
end $function$;
drop trigger if exists agency_memberships_hired_on_changed on public.agency_memberships;
create trigger agency_memberships_hired_on_changed
  after update of hired_on on public.agency_memberships
  for each row when (old.hired_on is distinct from new.hired_on)
  execute function public.agency_memberships_hired_on_changed();

-- ── 2. Payout accounts ───────────────────────────────────────────────────────
create table if not exists public.member_payout_accounts (
  user_id             uuid primary key references public.profiles(id) on delete cascade,
  agency_id           uuid not null references public.agencies(id) on delete cascade,
  method              text not null check (method in ('gcash', 'bank_transfer', 'other')),
  provider            text,
  account_name        text,
  account_number      text,
  notification_email  extensions.citext,
  notes               text,
  updated_at          timestamptz not null default now(),
  updated_by          uuid references public.profiles(id) on delete set null
);
comment on table public.member_payout_accounts is
  'Where payroll pays a staff member: e-wallet or bank, account name and number, notification email. The person and payroll capability read it; nobody else.';
alter table public.member_payout_accounts enable row level security;
revoke all on public.member_payout_accounts from public, anon;
grant select, insert, update on public.member_payout_accounts to authenticated;

create or replace function public.reads_payroll_of(p_agency uuid)
returns boolean language sql stable security definer set search_path = public as $function$
  select public.is_staff_of(p_agency) and (public.agency_can('payroll.view') or public.agency_can('payroll.manage'))
$function$;
revoke all on function public.reads_payroll_of(uuid) from public, anon;
grant execute on function public.reads_payroll_of(uuid) to authenticated;

drop policy if exists member_payout_accounts_select on public.member_payout_accounts;
create policy member_payout_accounts_select on public.member_payout_accounts
  for select to authenticated
  using (user_id = auth.uid() or public.reads_payroll_of(agency_id));
drop policy if exists member_payout_accounts_insert on public.member_payout_accounts;
create policy member_payout_accounts_insert on public.member_payout_accounts
  for insert to authenticated
  with check (public.is_staff_of(agency_id) and (user_id = auth.uid() or public.agency_can('payroll.manage')));
drop policy if exists member_payout_accounts_update on public.member_payout_accounts;
create policy member_payout_accounts_update on public.member_payout_accounts
  for update to authenticated
  using (user_id = auth.uid() or (public.is_staff_of(agency_id) and public.agency_can('payroll.manage')))
  with check (user_id = auth.uid() or (public.is_staff_of(agency_id) and public.agency_can('payroll.manage')));

-- Where the money goes is a meaningful mutation; the trail keeps the last
-- four digits only, so the audit log never becomes a second copy of the number.
create or replace function public.member_payout_accounts_audit() returns trigger
language plpgsql security definer set search_path = public as $function$
declare v_actor text; v_old text; v_new text;
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' or (new.method, new.provider, new.account_number) is distinct from (old.method, old.provider, old.account_number) then
    select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
    v_old := case when tg_op = 'UPDATE' then concat_ws(' ', old.method, old.provider, '••••' || right(coalesce(old.account_number, ''), 4)) end;
    v_new := concat_ws(' ', new.method, new.provider, '••••' || right(coalesce(new.account_number, ''), 4));
    insert into public.activity_events (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, previous_value, new_value, visibility)
    values (new.agency_id, 'profile', new.user_id::text, auth.uid(), v_actor, 'Payout account changed', 'payout_account', v_old, v_new, 'bes_internal');
  end if;
  return new;
end $function$;
drop trigger if exists member_payout_accounts_audit on public.member_payout_accounts;
create trigger member_payout_accounts_audit before insert or update on public.member_payout_accounts
  for each row execute function public.member_payout_accounts_audit();

-- ── 3. Staged onboarding on an open invitation ───────────────────────────────
create table if not exists public.invitation_onboarding (
  invitation_id  uuid primary key references public.invitations(id) on delete cascade,
  payload        jsonb not null,
  created_at     timestamptz not null default now(),
  created_by     uuid references public.profiles(id) on delete set null
);
comment on table public.invitation_onboarding is
  'HR facts staged for a person who has not accepted yet: {hired_on, job_title, engagement_type, phone, private:{…}, payout:{…}}. Applied by accept_agency_invitation and deleted. No role reads it.';
alter table public.invitation_onboarding enable row level security;
revoke all on public.invitation_onboarding from public, anon, authenticated;

-- The private-record guard lets the acceptance path record a date of birth
-- the person did not certify themselves; the event names the invitation.
create or replace function public.member_private_records_guard() returns trigger
language plpgsql security definer set search_path = public as $function$
declare v_actor text; v_old date; v_onboarding boolean;
begin
  v_onboarding := current_setting('bes.onboarding_apply', true) = 'on';
  v_old := case when tg_op = 'UPDATE' then old.date_of_birth else null end;
  if new.date_of_birth is distinct from v_old then
    if not v_onboarding and not public.manages_private_record_of(new.user_id) then
      raise exception 'The date of birth is recorded by management, not by the person' using errcode = '42501';
    end if;
    select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
    insert into public.activity_events (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, previous_value, new_value, visibility)
    values (new.agency_id, 'profile', new.user_id::text, auth.uid(), v_actor,
            case when v_onboarding then 'Date of birth recorded from the invitation' else 'Date of birth recorded' end,
            'date_of_birth', v_old::text, new.date_of_birth::text, 'bes_internal');
    update public.profiles
       set birth_month = extract(month from new.date_of_birth)::smallint,
           birth_day   = extract(day from new.date_of_birth)::smallint
     where id = new.user_id and new.date_of_birth is not null;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $function$;

create or replace function public.apply_invitation_onboarding(p_invitation uuid, p_member uuid, p_user uuid, p_agency uuid) returns void
language plpgsql security definer set search_path = public as $function$
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

  perform set_config('bes.onboarding_apply', 'off', true);
  -- Consumed: the canonical rows hold it now. Two copies is one too many.
  delete from public.invitation_onboarding where invitation_id = p_invitation;
end $function$;
revoke all on function public.apply_invitation_onboarding(uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- accept_agency_invitation, from the live definition with one insertion after the membership upsert.
CREATE OR REPLACE FUNCTION public.accept_agency_invitation(p_token uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  i public.invitations%rowtype;
  v_member uuid;
  k text;
  v_email extensions.citext;
begin
  select * into i from public.invitations
   where token = p_token and kind = 'agency' and accepted_at is null and expires_at > now();
  if i.id is null then
    raise exception 'This invitation link is not valid, or it has already been used.'
      using errcode = '22023';
  end if;

  select lower(email)::extensions.citext into v_email from auth.users where id = auth.uid();
  if v_email is distinct from i.email then
    raise exception 'This invitation was sent to a different email address.'
      using errcode = '42501';
  end if;

  insert into public.agency_memberships (user_id, agency_id, role, access_profile, status)
  values (auth.uid(), i.agency_id, coalesce(i.agency_role, 'agency_user'), i.access_profile, 'active')
  on conflict (user_id, agency_id) do update
    set role = excluded.role,
        access_profile = excluded.access_profile,
        status = 'active',
        deactivated_at = null,
        deactivated_by = null
  returning id into v_member;

  /* HR facts staged against this invitation land on the canonical rows now
     (hire date, position, phone, private record, payout account). */
  perform public.apply_invitation_onboarding(i.id, v_member, auth.uid(), i.agency_id);

  /* Named capabilities the person was hired for, as their own exceptions —
     the profile itself never grants a module. */
  foreach k in array coalesce(i.module_keys, '{}') loop
    insert into public.agency_member_permissions (membership_id, key, allowed)
    values (v_member, k, true)
    on conflict (membership_id, key) do update set allowed = true;
  end loop;

  /* The team they were invited INTO, and whether they lead it. Both come from
     the invitation, so nobody rebuilds this afterwards (Dee, 2026-09-12). */
  if i.team_id is not null
     and exists (select 1 from public.teams t
                  where t.id = i.team_id and t.agency_id = i.agency_id and t.archived_at is null) then
    insert into public.team_memberships (team_id, user_id, is_lead)
    values (i.team_id, auth.uid(), i.lead_team_id is not distinct from i.team_id)
    on conflict (team_id, user_id) do update
      set is_lead = public.team_memberships.is_lead or excluded.is_lead;
  end if;

  /* A lead of a DIFFERENT team than the one they joined — kept for the case
     the two are deliberately apart. */
  if i.lead_team_id is not null and i.lead_team_id is distinct from i.team_id
     and exists (select 1 from public.teams t
                  where t.id = i.lead_team_id and t.agency_id = i.agency_id and t.archived_at is null) then
    insert into public.team_memberships (team_id, user_id, is_lead)
    values (i.lead_team_id, auth.uid(), true)
    on conflict (team_id, user_id) do update set is_lead = true;
  end if;

  update public.invitations set accepted_at = now() where id = i.id;

  perform public.log_audit('agency_invitation.accepted', 'invitation', i.id::text, null, null,
    jsonb_build_object('role', i.agency_role, 'profile', i.access_profile,
                       'team', i.team_id, 'lead_team', i.lead_team_id));
  return i.agency_id;
end $function$
;
