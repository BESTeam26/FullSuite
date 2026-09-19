-- Agent Profile: an Employee ID assigned once, and management editing a
-- person's profile (Dee, 2026-09-19): "employee Id should be auto assigned:
-- agent first name initial and last name initial then month and year hired
-- then agent number… i dont see a way to edit agent profile too, like upload
-- image profile."
--
-- 1. agency_memberships.employee_code — INITIALS-MMYY-NN, e.g. AC-0926-07:
--    the person's initials, the month and year they joined the agency, and
--    their number in hiring order. Assigned by trigger when the membership is
--    created, backfilled once for existing people, and never recomputed — a
--    renamed person keeps the code they were given (rule 4: attribution does
--    not drift).
-- 2. may_manage_profile_of(user) — self, or management (admin / ops.manage)
--    within may_view_workforce_record. One predicate for the profile RPCs and
--    the avatar storage policies, so what the button allows and what the
--    bucket accepts cannot disagree.
-- 3. set_member_profile / set_member_avatar — the writers, audited to
--    activity_events with previous and new values. profiles_update_self stays
--    for the person's own Settings → Account.

alter table public.agency_memberships add column if not exists employee_code text;
create unique index if not exists agency_memberships_employee_code_idx
  on public.agency_memberships (agency_id, employee_code) where employee_code is not null;
comment on column public.agency_memberships.employee_code is
  'Employee ID, assigned once: initials-MMYY(joined)-hiring number, e.g. AC-0926-07. Never recomputed.';

create or replace function public.employee_code_for(p_agency uuid, p_membership uuid, p_user uuid, p_joined timestamptz)
returns text language sql stable set search_path = public as $function$
  with person as (
    select coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1)) as name from public.profiles p where p.id = p_user
  ), words as (
    /* Letters only, so "[TEST] Persona" and "Dr. Jane O'Neil" still yield initials. */
    select regexp_split_to_array(trim(regexp_replace(regexp_replace(name, '[^[:alpha:] ]', '', 'g'), '\s+', ' ', 'g')), ' ') as w from person
  ), initials as (
    select coalesce(nullif(upper(left(w[1], 1)) || upper(left(w[array_length(w, 1)], 1)), ''), 'XX') as ini from words
  ), seq as (
    /* Hiring order within the agency; ties on the timestamp broken by id, so a
       batch created in one statement still numbers each person once. */
    select count(*) + 1 as n from public.agency_memberships m
     where m.agency_id = p_agency
       and (m.created_at, m.id) < (p_joined, p_membership)
  )
  select initials.ini || '-' || to_char(p_joined, 'MMYY') || '-' || lpad(seq.n::text, 2, '0') from initials, seq
$function$;

create or replace function public.agency_memberships_assign_employee_code() returns trigger
language plpgsql security definer set search_path = public as $function$
begin
  if new.employee_code is null then
    new.created_at := coalesce(new.created_at, now());
    new.employee_code := public.employee_code_for(new.agency_id, new.id, new.user_id, new.created_at);
  end if;
  return new;
end $function$;
drop trigger if exists agency_memberships_assign_employee_code on public.agency_memberships;
create trigger agency_memberships_assign_employee_code before insert on public.agency_memberships
  for each row execute function public.agency_memberships_assign_employee_code();

/* Backfill once, in hiring order, real people and fixtures alike (a fixture
   with no code would be the odd one out in every probe). */
update public.agency_memberships m
   set employee_code = public.employee_code_for(m.agency_id, m.id, m.user_id, m.created_at)
 where m.employee_code is null;

create or replace function public.may_manage_profile_of(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $function$
  select p_user = auth.uid()
      or exists (
        select 1 from public.agency_memberships m
         where m.user_id = p_user and m.status in ('active', 'inactive')
           and public.is_manager_of(m.agency_id)
           and public.may_view_workforce_record(m.agency_id, p_user))
$function$;
revoke all on function public.may_manage_profile_of(uuid) from public, anon;
grant execute on function public.may_manage_profile_of(uuid) to authenticated;

create or replace function public.set_member_profile(
  p_user uuid, p_full_name text, p_preferred_name text, p_title text, p_phone text, p_tagline text
) returns void language plpgsql security definer set search_path = public as $function$
declare v_before jsonb; v_agency uuid; v_actor text;
begin
  if not public.may_manage_profile_of(p_user) then
    raise exception 'Editing this profile needs management access within your scope' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_full_name, '')), '') is null then raise exception 'A full name is needed'; end if;
  if length(coalesce(p_tagline, '')) > 200 then raise exception 'Keep the quote under 200 characters'; end if;
  select jsonb_build_object('full_name', full_name, 'preferred_name', preferred_name, 'title', title, 'phone', phone, 'tagline', tagline)
    into v_before from public.profiles where id = p_user;
  update public.profiles
     set full_name = trim(p_full_name), preferred_name = nullif(trim(coalesce(p_preferred_name, '')), ''),
         title = nullif(trim(coalesce(p_title, '')), ''), phone = nullif(trim(coalesce(p_phone, '')), ''),
         tagline = nullif(trim(coalesce(p_tagline, '')), ''), updated_at = now()
   where id = p_user;
  select agency_id into v_agency from public.agency_memberships where user_id = p_user limit 1;
  select coalesce(full_name, email) into v_actor from public.profiles where id = auth.uid();
  if v_agency is not null and auth.uid() <> p_user then
    insert into public.activity_events (agency_id, entity_type, entity_id, actor_id, actor_name, action, field, previous_value, new_value, visibility)
    values (v_agency, 'profile', p_user::text, auth.uid(), v_actor, 'Profile edited', 'profile', v_before::text,
            jsonb_build_object('full_name', trim(p_full_name), 'preferred_name', p_preferred_name, 'title', p_title, 'phone', p_phone, 'tagline', p_tagline)::text,
            'bes_internal');
  end if;
end $function$;
revoke all on function public.set_member_profile(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.set_member_profile(uuid, text, text, text, text, text) to authenticated;

create or replace function public.set_member_avatar(p_user uuid, p_path text)
returns void language plpgsql security definer set search_path = public as $function$
begin
  if not public.may_manage_profile_of(p_user) then
    raise exception 'Editing this profile needs management access within your scope' using errcode = '42501';
  end if;
  if p_path is not null and split_part(p_path, '/', 1) <> p_user::text then
    raise exception 'An avatar lives in its owner''s folder';
  end if;
  update public.profiles set avatar_path = p_path, updated_at = now() where id = p_user;
end $function$;
revoke all on function public.set_member_avatar(uuid, text) from public, anon;
grant execute on function public.set_member_avatar(uuid, text) to authenticated;

/* The bucket accepts what the profile RPC allows: management may place a
   photo in a managed person's folder. Selection stays shares_scope_with. */
create policy avatars_manager_write on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public.may_manage_profile_of(((storage.foldername(name))[1])::uuid));
create policy avatars_manager_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and public.may_manage_profile_of(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'avatars' and public.may_manage_profile_of(((storage.foldername(name))[1])::uuid));
create policy avatars_manager_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.may_manage_profile_of(((storage.foldername(name))[1])::uuid));

/* entity_visible learns 'profile' (default-deny, 0246 note). */

-- entity_visible: GENERATED from the live definition with one replacement (never retyped).
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
    when 'attendance_correction' then exists (
      select 1 from public.attendance_corrections ac where ac.id::text = p_entity_id)
    when 'payslip' then exists (select 1 from public.payslips p where p.id::text = p_entity_id)
    when 'reward_credit' then exists (
      select 1 from public.reward_credits rc where rc.id::text = p_entity_id)
    /* Added with set_member_profile (2026-09-19): a profile edit is about a PERSON, visible when their profile is. */
    when 'profile'          then exists (select 1 from public.profiles pr where pr.id::text = p_entity_id)
    else false
  end
$function$
;
