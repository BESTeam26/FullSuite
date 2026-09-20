-- UAT case 9 (Dee's list, 2026-09-20): "activation retry … acceptance must be
-- safe if the browser retries."
--
-- It was not. The activation page accepts on mount whenever somebody is
-- signed in, so a refresh — or the same link opened twice — called
-- accept_agency_invitation a second time and got "This invitation link is not
-- valid, or it has already been used." Nothing was duplicated, so the data
-- was safe; the person was simply told they had failed at the moment they had
-- succeeded.
--
-- Now: a used link presented by THE PERSON IT BELONGED TO, whose membership is
-- already active, returns their agency quietly. Anybody else presenting a used
-- link is refused exactly as before.
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

  /* Idempotent retry (Dee, 2026-09-20: "acceptance must be safe if the
     browser retries"). A link this very person already used, with their
     membership active, is not an error — the page re-mounts, re-accepts and
     should simply land them inside. Anybody ELSE presenting a used link is
     still refused. */
  if i.id is null then
    select * into i from public.invitations
     where token = p_token and kind = 'agency' and accepted_at is not null
       and email = (select lower(email)::extensions.citext from auth.users where id = auth.uid());
    if i.id is not null and exists (
      select 1 from public.agency_memberships m
       where m.user_id = auth.uid() and m.agency_id = i.agency_id and m.status = 'active') then
      return i.agency_id;
    end if;
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
