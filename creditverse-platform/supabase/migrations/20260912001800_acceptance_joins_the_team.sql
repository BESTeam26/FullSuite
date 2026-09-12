-- =============================================================================
-- Accepting the invitation finishes the setup.
--
-- `accept_agency_invitation` joined a team only for a team lead. Everybody
-- else arrived with a role, a profile and their module grants — and no team,
-- which for an engine that distributes by team membership means arriving
-- ineligible. Somebody then had to add them by hand, which is the manual
-- rebuild Dee refused.
--
-- The whole chain is now one transaction:
--
--   invitation → authenticated identity → agency membership → module grants
--   → team membership → Team Lead designation where applicable
--
-- Idempotent at every step: the membership insert carries
-- `on conflict (team_id, user_id)`, and the invitation is marked accepted in
-- the same transaction, so a refresh or a second click finds it used and is
-- refused rather than creating a second anything.
-- =============================================================================

create or replace function public.accept_agency_invitation(p_token uuid)
returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  i public.invitations%rowtype;
  v_member uuid;
  k text;
  v_email citext;
begin
  select * into i from public.invitations
   where token = p_token and kind = 'agency' and accepted_at is null and expires_at > now();
  if i.id is null then
    raise exception 'This invitation link is not valid, or it has already been used.'
      using errcode = '22023';
  end if;

  select lower(email)::citext into v_email from auth.users where id = auth.uid();
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
end $function$;

revoke execute on function public.accept_agency_invitation(uuid) from public, anon;
grant execute on function public.accept_agency_invitation(uuid) to authenticated;
