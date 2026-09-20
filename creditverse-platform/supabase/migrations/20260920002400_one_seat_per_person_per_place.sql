-- Aaron activated with the Chief Operations seat TWICE: once from the
-- migration that turned his pending invitation into a Team Member, and again
-- when activation applied the same staging. Two rows say one true thing, and
-- the second is the kind of duplicate that makes a later "who manages this?"
-- ambiguous.
--
-- Two fixes: the applier now skips a seat the person already holds (the
-- create-and-invite path has always checked), and the duplicates already in
-- the table are closed — the earliest row of each pair is kept, because that
-- is the one whose effective date is right.

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
     where not exists (
         select 1 from public.management_seats ms
          where ms.user_id = p_user and ms.seat = s->>'seat' and ms.effective_to is null
            and ms.division_id is not distinct from case when s->>'seat' = 'division_manager' then (select id from public.divisions where agency_id = p_agency and name = s->>'division' and archived_at is null) end
            and ms.department_id is not distinct from case when s->>'seat' = 'department_manager' then (select id from public.departments where agency_id = p_agency and name = s->>'department' and archived_at is null) end)
       and ((s->>'seat' = 'chief_operations')
        or (s->>'seat' = 'division_manager'   and exists (select 1 from public.divisions   where agency_id = p_agency and name = s->>'division'   and archived_at is null))
        or (s->>'seat' = 'department_manager' and exists (select 1 from public.departments where agency_id = p_agency and name = s->>'department' and archived_at is null)));
  end if;
  perform set_config('bes.onboarding_apply', 'off', true);
  -- Consumed: the canonical rows hold it now. Two copies is one too many.
  delete from public.invitation_onboarding where invitation_id = p_invitation;
end $function$
;

/* Close the extra rows, oldest kept. */
with ranked as (
  select id, row_number() over (
           partition by user_id, seat, coalesce(division_id, '00000000-0000-0000-0000-000000000000'::uuid),
                        coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid)
           order by effective_from, created_at) as rn
    from public.management_seats where effective_to is null)
update public.management_seats s set effective_to = current_date, reason = coalesce(reason, '') || ' (duplicate closed 2026-09-20)'
  from ranked r where r.id = s.id and r.rn > 1;

/* And a rule, so it cannot happen again from any path. */
create unique index if not exists management_seats_one_live_per_place
  on public.management_seats (user_id, seat, coalesce(division_id, '00000000-0000-0000-0000-000000000000'::uuid),
                              coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where effective_to is null;
