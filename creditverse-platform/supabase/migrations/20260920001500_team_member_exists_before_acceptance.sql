-- THE CANONICAL LIFECYCLE (Dee, 2026-09-20, launch-critical):
--
--   Team Member created → Agent ID assigned → start date, engagement type,
--   position, Reports To saved → organizational placement created → partner
--   assignments staged → invitation created → invitation sent → user
--   activates → auth account LINKED to the existing Team Member → membership
--   becomes active
--
-- "A Team Member is a workforce record. A login is just access to that
-- record." Nobody disappears from the directory because an email bounced.
--
-- ── THE ONE CONSTRAINT THAT SHAPED THIS ────────────────────────────────────
-- `profiles.id` references `auth.users(id)`, so a person record cannot exist
-- without an auth row. Rather than break that (it is what makes every
-- `user_id` in the schema mean one thing), the invitation creates a SHELL
-- auth user: no password, unconfirmed, unable to sign in. The Team Member
-- hangs off it from the first moment, with its permanent id. Activation sets
-- the password on that same user — so "linking" is not a merge, it is the
-- same row all along, and no id ever changes.
--
-- ── STATUS ─────────────────────────────────────────────────────────────────
-- `invited` joins active/inactive. Every existing reader asks `status =
-- 'active'`, so a pending person is excluded from active workforce, payroll,
-- attendance, production and queues by construction rather than by a filter
-- somebody has to remember. The directory asks for all three on purpose.

alter table public.agency_memberships drop constraint if exists agency_memberships_status_check;
alter table public.agency_memberships add constraint agency_memberships_status_check
  check (status = any (array['active'::text, 'inactive'::text, 'invited'::text]));
comment on column public.agency_memberships.status is
  'active — working here · invited — a real workforce record awaiting first sign-in (NOT active workforce) · inactive — deactivated. Readers that mean "working here" ask for active.';

/* Explicit linkage, so acceptance never has to match on a name (Dee). */
alter table public.invitations add column if not exists membership_id uuid references public.agency_memberships(id) on delete cascade;

/* A pending person is still somebody their manager administers. */
create or replace function public.may_manage_profile_of(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $function$
  select p_user = auth.uid()
      or exists (
        select 1 from public.agency_memberships m
         where m.user_id = p_user and m.status in ('active', 'inactive', 'invited')
           and public.is_manager_of(m.agency_id)
           and public.may_view_workforce_record(m.agency_id, p_user))
$function$;
create or replace function public.manages_private_record_of(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $function$
  select exists (
    select 1 from public.agency_memberships m
     where m.user_id = p_user and m.status in ('active', 'inactive', 'invited')
       and public.is_manager_of(m.agency_id)
       and public.may_view_workforce_record(m.agency_id, p_user))
$function$;

/**
 * Create the Team Member and its invitation, in one transaction.
 *
 * The caller (create-team-member, service role) has already made or found the
 * shell auth user; everything canonical happens here so it either all lands
 * or none of it does. Re-invoking for the same person REUSES the record: same
 * Team Member, same Agent ID, same placement, rotated token.
 */
create or replace function public.create_team_member_with_invitation(
  p_user uuid, p_full_name text, p_role public.agency_role, p_profile public.access_profile,
  p_team uuid default null, p_lead_team uuid default null, p_modules text[] default '{}',
  p_hired_on date default null, p_job_title text default null, p_engagement text default null,
  p_manager uuid default null, p_phone text default null,
  p_seat text default null, p_division uuid default null, p_department uuid default null
) returns table(invitation_id uuid, membership_id uuid, employee_code text, token uuid)
language plpgsql security definer set search_path = public as $function$
declare v_agency uuid; v_member public.agency_memberships%rowtype; v_inv public.invitations%rowtype; v_email extensions.citext; k text;
begin
  select agency_id into v_agency from public.agency_memberships
   where user_id = auth.uid() and role in ('agency_owner', 'agency_admin') and status = 'active' limit 1;
  if v_agency is null then raise exception 'not permitted' using errcode = '42501'; end if;
  select email into v_email from public.profiles where id = p_user;
  if v_email is null then raise exception 'That person has no profile yet' using errcode = '22023'; end if;

  /* Somebody already working here is not invited again (§37). */
  if exists (select 1 from public.agency_memberships m where m.user_id = p_user and m.agency_id = v_agency and m.status = 'active') then
    raise exception 'that person is already on the team' using errcode = '23505';
  end if;

  update public.profiles
     set full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
         phone = coalesce(nullif(trim(p_phone), ''), phone)
   where id = p_user;

  /* 1–6. The Team Member, with its start date, engagement, position and
     reporting line. The Agent ID is assigned by the insert trigger, from the
     START DATE — and never re-issued, because a second call updates. */
  insert into public.agency_memberships
        (user_id, agency_id, role, access_profile, status, hired_on, job_title, engagement_type, manager_id, primary_team_id)
  values (p_user, v_agency, p_role, p_profile, 'invited', p_hired_on, nullif(trim(p_job_title), ''),
          nullif(p_engagement, ''), p_manager, p_team)
  on conflict (user_id, agency_id) do update
    set role = excluded.role, access_profile = excluded.access_profile,
        hired_on = coalesce(public.agency_memberships.hired_on, excluded.hired_on),
        job_title = coalesce(excluded.job_title, public.agency_memberships.job_title),
        engagement_type = coalesce(excluded.engagement_type, public.agency_memberships.engagement_type),
        manager_id = coalesce(excluded.manager_id, public.agency_memberships.manager_id),
        primary_team_id = coalesce(excluded.primary_team_id, public.agency_memberships.primary_team_id)
  returning * into v_member;

  /* 7. Organizational placement: the team, and the seat if their
     responsibility is a management one. */
  if p_team is not null and exists (select 1 from public.teams t where t.id = p_team and t.agency_id = v_agency and t.archived_at is null) then
    insert into public.team_memberships (team_id, user_id, is_lead)
    values (p_team, p_user, p_lead_team is not distinct from p_team)
    on conflict (team_id, user_id) do update set is_lead = public.team_memberships.is_lead or excluded.is_lead;
  end if;
  if p_lead_team is not null and p_lead_team is distinct from p_team
     and exists (select 1 from public.teams t where t.id = p_lead_team and t.agency_id = v_agency and t.archived_at is null) then
    insert into public.team_memberships (team_id, user_id, is_lead) values (p_lead_team, p_user, true)
    on conflict (team_id, user_id) do update set is_lead = true;
  end if;
  if p_seat is not null then
    insert into public.management_seats (agency_id, user_id, seat, division_id, department_id, effective_from, reason, created_by)
    select v_agency, p_user, p_seat,
           case when p_seat = 'division_manager' then p_division end,
           case when p_seat = 'department_manager' then p_department end,
           coalesce(p_hired_on, current_date), 'Placed when they were invited', auth.uid()
     where not exists (
       select 1 from public.management_seats s
        where s.user_id = p_user and s.seat = p_seat and s.effective_to is null
          and s.division_id is not distinct from case when p_seat = 'division_manager' then p_division end
          and s.department_id is not distinct from case when p_seat = 'department_manager' then p_department end);
  end if;

  /* The modules they were hired to work — their own exceptions, never a
     profile default (§16). */
  foreach k in array coalesce(p_modules, '{}') loop
    if exists (select 1 from public.permission_keys pk where pk.key = k) then
      insert into public.agency_member_permissions (membership_id, key, allowed)
      values (v_member.id, k, true)
      on conflict (membership_id, key) do update set allowed = true;
    end if;
  end loop;

  /* 9. The invitation, linked to the Team Member by id. Re-inviting rotates
     the token and keeps everything above. */
  select * into v_inv from public.invitations
   where agency_id = v_agency and email = v_email and kind = 'agency' and accepted_at is null;
  if v_inv.id is not null then
    update public.invitations
       set agency_role = p_role, access_profile = p_profile, team_id = p_team, lead_team_id = p_lead_team,
           module_keys = coalesce(p_modules, '{}'), full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
           membership_id = v_member.id, invited_by = auth.uid(),
           token = gen_random_uuid(), activated_at = null, expires_at = now() + interval '7 days'
     where id = v_inv.id
    returning * into v_inv;
  else
    insert into public.invitations
      (email, kind, agency_id, agency_role, access_profile, lead_team_id, team_id, module_keys, invited_by, full_name, membership_id)
    values (v_email, 'agency', v_agency, p_role, p_profile, p_lead_team, p_team, coalesce(p_modules, '{}'), auth.uid(),
            nullif(trim(p_full_name), ''), v_member.id)
    returning * into v_inv;
  end if;

  perform public.log_audit('agency.team_member_invited', 'agency_member', v_member.id::text, null, null,
    jsonb_build_object('email', v_email, 'role', p_role, 'profile', p_profile, 'team', p_team,
                       'seat', p_seat, 'employee_code', v_member.employee_code, 'status', 'invited'));
  return query select v_inv.id, v_member.id, v_member.employee_code, v_inv.token;
end $function$;
revoke all on function public.create_team_member_with_invitation(uuid, text, public.agency_role, public.access_profile, uuid, uuid, text[], date, text, text, uuid, text, text, uuid, uuid) from public, anon;
grant execute on function public.create_team_member_with_invitation(uuid, text, public.agency_role, public.access_profile, uuid, uuid, text[], date, text, text, uuid, text, text, uuid, uuid) to authenticated;
