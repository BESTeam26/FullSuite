-- Live defect, 2026-09-20: sending an invitation failed with
--   column reference "membership_id" is ambiguous
--
-- The function RETURNS TABLE(invitation_id, membership_id, employee_code,
-- token), and PL/pgSQL puts those output names in scope as variables. So the
-- INSERT column list and ON CONFLICT target of
--   insert into agency_member_permissions (membership_id, key, allowed)
--     ... on conflict (membership_id, key)
-- could mean either the column or the output parameter, and Postgres refuses
-- to guess. `#variable_conflict use_column` says: inside this body, a name
-- that is both is the COLUMN. Nothing else about the function changes — the
-- output values are only ever written through `return query`, never by
-- assigning to those names.

CREATE OR REPLACE FUNCTION public.create_team_member_with_invitation(p_user uuid, p_full_name text, p_role agency_role, p_profile access_profile, p_team uuid DEFAULT NULL::uuid, p_lead_team uuid DEFAULT NULL::uuid, p_modules text[] DEFAULT '{}'::text[], p_hired_on date DEFAULT NULL::date, p_job_title text DEFAULT NULL::text, p_engagement text DEFAULT NULL::text, p_manager uuid DEFAULT NULL::uuid, p_phone text DEFAULT NULL::text, p_seat text DEFAULT NULL::text, p_division uuid DEFAULT NULL::uuid, p_department uuid DEFAULT NULL::uuid)
 RETURNS TABLE(invitation_id uuid, membership_id uuid, employee_code text, token uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
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
end $function$
;
