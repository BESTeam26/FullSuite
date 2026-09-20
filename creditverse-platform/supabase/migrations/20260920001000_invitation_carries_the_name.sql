-- The activation page asks the person for a name they were invited BY
-- (Dee, 2026-09-20: "name should be pre-populated"). The invitation now
-- carries full_name: set by whoever invites, read by the activation page
-- through invitation_preview, applied as the profile name on sign-up.
alter table public.invitations add column if not exists full_name text;

CREATE OR REPLACE FUNCTION public.invite_agency_member(p_email text, p_role agency_role, p_profile access_profile DEFAULT NULL::access_profile, p_lead_team uuid DEFAULT NULL::uuid, p_modules text[] DEFAULT '{}'::text[], p_team uuid DEFAULT NULL::uuid, p_full_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_agency  uuid;
  v_email   extensions.citext := lower(trim(p_email))::extensions.citext;
  v_id      uuid;
  v_profile public.access_profile;
  v_lead    uuid;
  v_team    uuid := p_team;
  v_modules text[] := coalesce(p_modules, '{}');
  v_bad     text;
begin
  select agency_id into v_agency from public.agency_memberships
   where user_id = auth.uid() and role in ('agency_owner', 'agency_admin') and status = 'active'
   limit 1;
  if v_agency is null then raise exception 'not permitted' using errcode = '42501'; end if;

  /* Restored from 0909 (dropped by the 0912 rewrite; caught by phase 37):
     somebody already on the team is not invited again. */
  if exists (select 1 from public.agency_memberships m join public.profiles p on p.id = m.user_id
              where m.agency_id = v_agency and m.status = 'active' and lower(p.email) = lower(trim(p_email))) then
    raise exception 'that person is already on the team' using errcode = '23505';
  end if;
  if v_email is null or position('@' in v_email::text) = 0 then
    raise exception 'a valid email address is required' using errcode = '22023';
  end if;
  if p_role not in ('agency_admin', 'agency_user') then
    raise exception 'Invite people as Agency Admin or Agency User. Ownership is transferred from the owner''s own account, never by invitation.' using errcode = '22023';
  end if;

  if p_role = 'agency_admin' then
    v_profile := null; v_lead := null; v_modules := '{}';
  else
    v_profile := coalesce(p_profile, 'custom');
    v_lead := p_lead_team;
  end if;

  /* Leading a team means being on it. Saying so here rather than relying on
     the caller to pass both is one less way to invite a lead with no team. */
  /* Restored (phase 37): a Team Lead invitation names the team it leads,
     and a led team belongs only on a Team Lead invitation. */
  if p_role = 'agency_user' and v_profile = 'team_lead' and v_lead is null then
    raise exception 'A Team Lead invitation must name the team they will lead' using errcode = '22023';
  end if;
  if p_role = 'agency_user' and v_lead is not null and v_profile <> 'team_lead' then
    raise exception 'Only a Team Lead invitation may carry a led team' using errcode = '22023';
  end if;
  if v_lead is not null then v_team := coalesce(v_team, v_lead); end if;

  if v_team is not null and not exists (
    select 1 from public.teams t where t.id = v_team and t.agency_id = v_agency and t.archived_at is null
  ) then
    raise exception 'That team does not belong to this agency' using errcode = '22023';
  end if;

  select string_agg(k, ', ') into v_bad
    from unnest(v_modules) as k
   where not exists (select 1 from public.permission_keys pk where pk.key = k);
  if v_bad is not null then
    raise exception 'Unknown capability: %', v_bad using errcode = '22023';
  end if;

  /* An open invitation is reused rather than duplicated: inviting the same
     person twice is a person clicking twice, not two employees. */
  select id into v_id from public.invitations
   where agency_id = v_agency and email = v_email and kind = 'agency'
     and accepted_at is null and expires_at > now();

  if v_id is not null then
    update public.invitations
       set agency_role = p_role, access_profile = v_profile, lead_team_id = v_lead,
           team_id = v_team, module_keys = v_modules, invited_by = auth.uid(),
           full_name = coalesce(nullif(trim(p_full_name), ''), full_name)
     where id = v_id;
  else
    insert into public.invitations
      (email, kind, agency_id, agency_role, access_profile, lead_team_id, team_id, module_keys, invited_by, full_name)
    values (v_email, 'agency', v_agency, p_role, v_profile, v_lead, v_team, v_modules, auth.uid(), nullif(trim(p_full_name), ''))
    returning id into v_id;
  end if;

  perform public.log_audit('agency.member_invited', 'invitation', v_id::text, null, null,
    jsonb_build_object('email', v_email, 'role', p_role, 'profile', v_profile,
                       'team', v_team, 'lead_team', v_lead, 'modules', v_modules,
                       'full_name', p_full_name));
  return v_id;
end $function$
;

drop function if exists public.invitation_preview(uuid);
create or replace function public.invitation_preview(p_token uuid)
returns table(email text, kind text, expires_at timestamptz, full_name text)
language sql stable security definer set search_path = public as $function$
  select i.email::text, i.kind::text, i.expires_at, i.full_name
    from public.invitations i
   where i.token = p_token
     and i.accepted_at is null
     and i.expires_at > now()
$function$;
revoke all on function public.invitation_preview(uuid) from public;
grant execute on function public.invitation_preview(uuid) to anon, authenticated;

-- The eight people invited before the column existed, named as the roster names them.
update public.invitations i set full_name = x.name
  from (values
    ('aaron@blessedempireservices.com', 'Aaron Joseph Gallardo'),
    ('alyssamores.bes@gmail.com',       'Allyssa Mores'),
    ('gilealvaro.bes@gmail.com',        'Alvaro D. Gile'),
    ('juliusrivera.bes@gmail.com',      'Julius Russel F. Rivera'),
    ('jetmanugas.bes@gmail.com',        'Jet Emmanuel J. Manugas'),
    ('dmacasiab.bes@gmail.com',         'Daniel Charles P. Macasiab'),
    ('ronielpena.bes@gmail.com',        'Roniel Pena'),
    ('nicoangelogarcia.bes@gmail.com',  'Nico Angelo B. Garcia')) as x(email, name)
 where i.email = x.email::extensions.citext and i.kind = 'agency' and i.accepted_at is null and i.full_name is null;
