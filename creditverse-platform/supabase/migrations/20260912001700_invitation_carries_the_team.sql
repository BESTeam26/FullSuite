-- =============================================================================
-- An invitation carries the whole job, so accepting one finishes the setup.
--
-- Dee, 2026-09-12: "I don't want team setup to become another manual process
-- after they accept. Store the intended access/team/role configuration with
-- the invitation."
--
-- Today an invitation carries the role, the access profile and the module
-- grants, and joins a team ONLY when the person is a team lead. Everybody
-- else arrives with no team — which for a routing engine that distributes by
-- team membership means they arrive ineligible, and somebody has to go and
-- add them by hand. That is the manual rebuild Dee is refusing.
--
-- `team_id` is the whole change: the team an ordinary member joins, beside
-- `lead_team_id` which already meant "and they lead it".
--
-- ── IDEMPOTENT BY CONSTRUCTION ──────────────────────────────────────────────
--
-- Dee: "Make this atomic/idempotent so refreshing or accepting twice cannot
-- create duplicate people or memberships." The membership insert carries
-- `on conflict (team_id, user_id)`, and the whole acceptance already runs in
-- one transaction and marks the invitation accepted at the end. A second
-- acceptance finds it used and refuses.
--
-- NO CREDENTIAL PASSES THROUGH ANY OF THIS. The invitation is an intent; the
-- identity is created by Supabase Auth when the person sets their own
-- password. Nothing here writes to `auth.users`.
-- =============================================================================

alter table public.invitations
  add column if not exists team_id uuid references public.teams(id) on delete set null;

comment on column public.invitations.team_id is
  'The team this person joins on acceptance. `lead_team_id` is the narrower case — the team they LEAD. Set both to invite somebody as the lead of their own team (Dee, 2026-09-12).';

create or replace function public.invite_agency_member(
  p_email text,
  p_role public.agency_role,
  p_profile public.access_profile default null,
  p_lead_team uuid default null,
  p_modules text[] default '{}',
  p_team uuid default null,
  p_full_name text default null
) returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  v_agency  uuid;
  v_email   citext := lower(trim(p_email))::citext;
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
           team_id = v_team, module_keys = v_modules, invited_by = auth.uid()
     where id = v_id;
  else
    insert into public.invitations
      (email, kind, agency_id, agency_role, access_profile, lead_team_id, team_id, module_keys, invited_by)
    values (v_email, 'agency', v_agency, p_role, v_profile, v_lead, v_team, v_modules, auth.uid())
    returning id into v_id;
  end if;

  perform public.log_audit('agency.member_invited', 'invitation', v_id::text, null, null,
    jsonb_build_object('email', v_email, 'role', p_role, 'profile', v_profile,
                       'team', v_team, 'lead_team', v_lead, 'modules', v_modules,
                       'full_name', p_full_name));
  return v_id;
end $function$;

revoke execute on function public.invite_agency_member(text, public.agency_role, public.access_profile, uuid, text[], uuid, text) from public, anon;
grant execute on function public.invite_agency_member(text, public.agency_role, public.access_profile, uuid, text[], uuid, text) to authenticated;
