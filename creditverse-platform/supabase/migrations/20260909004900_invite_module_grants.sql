-- =============================================================================
-- An invitation carries the modules the person is hired to work (§21/§23).
--
-- Module entry is a per-person capability and no profile grants it, so before
-- this the flow was: invite an agent, wait for activation, remember to open
-- their Access tab and switch CreditOps on. The decision is made at invite
-- time; recording it there means activation produces a person who can work
-- (§15 of the invitation directive: "Do not invite as Agency User and then
-- require Dee to remember to configure everything manually afterward").
--
-- Stored as explicit member permissions at activation, NOT as profile
-- changes: a module grant is an exception to the preset, which is exactly
-- what agency_member_permissions is for (§18 — only differences from the
-- profile become override rows).
-- =============================================================================

alter table public.invitations
  add column if not exists module_keys text[] not null default '{}';

comment on column public.invitations.module_keys is
  'Module entry capabilities to grant on activation — creditops.clients.view, crm.projects.view, fundingops.files.view, talentops.view. Validated against permission_keys by the writer.';

create or replace function public.invite_agency_member(
  p_email     text,
  p_role      public.agency_role,
  p_profile   public.access_profile default null,
  p_lead_team uuid default null,
  p_modules   text[] default '{}'
) returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  v_agency  uuid;
  v_email   citext := lower(trim(p_email))::citext;
  v_id      uuid;
  v_profile public.access_profile;
  v_lead    uuid;
  v_modules text[] := coalesce(p_modules, '{}');
  v_bad     text;
begin
  select agency_id into v_agency from public.agency_memberships
   where user_id = auth.uid() and role in ('agency_owner', 'agency_admin') and status = 'active'
   limit 1;
  if v_agency is null then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if v_email is null or position('@' in v_email::text) = 0 then
    raise exception 'a valid email address is required' using errcode = '22023';
  end if;
  if p_role not in ('agency_admin', 'agency_user') then
    raise exception 'Invite people as Agency Admin or Agency User. Ownership is transferred from the owner''s own account, never by invitation.' using errcode = '22023';
  end if;

  if p_role = 'agency_admin' then
    /* The role grants everything; a profile or a module grant beside it would
       be a second, contradictable statement of the same thing. */
    v_profile := null; v_lead := null; v_modules := '{}';
  else
    v_profile := coalesce(p_profile, 'custom');
    v_lead := p_lead_team;
  end if;

  /* Every key must exist — a typo would otherwise be stored and silently
     grant nothing on activation. */
  select string_agg(k, ', ') into v_bad
    from unnest(v_modules) as k
   where not exists (select 1 from public.permission_keys pk where pk.key = k);
  if v_bad is not null then
    raise exception 'Unknown capability: %', v_bad using errcode = '22023';
  end if;

  if v_profile = 'team_lead' then
    if v_lead is null then
      raise exception 'A Team Lead invitation names the team they will lead.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.teams t
                    where t.id = v_lead and t.agency_id = v_agency and t.archived_at is null) then
      raise exception 'That team does not exist here (or is archived).' using errcode = '22023';
    end if;
  elsif v_lead is not null then
    raise exception 'Only a Team Lead invitation names a led team.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.agency_memberships m
      join public.profiles p on p.id = m.user_id
     where m.agency_id = v_agency and p.email = v_email
  ) then
    raise exception 'that person is already on the team' using errcode = '23505';
  end if;

  update public.invitations
     set expires_at = now() + interval '7 days', agency_role = p_role,
         access_profile = v_profile, lead_team_id = v_lead, module_keys = v_modules,
         invited_by = auth.uid()
   where kind = 'agency' and agency_id = v_agency and email = v_email and accepted_at is null
  returning id into v_id;

  if v_id is null then
    insert into public.invitations (email, kind, agency_id, agency_role, access_profile, lead_team_id, module_keys, invited_by)
    values (v_email, 'agency', v_agency, p_role, v_profile, v_lead, v_modules, auth.uid())
    returning id into v_id;
  end if;

  perform public.log_audit('agency_invitation.sent', 'invitation', v_id::text, null, null,
                           jsonb_build_object('email', v_email::text, 'role', p_role,
                                              'access_profile', v_profile, 'lead_team_id', v_lead,
                                              'modules', v_modules));
  return v_id;
end $function$;

revoke execute on function public.invite_agency_member(text, public.agency_role, public.access_profile, uuid, text[]) from public, anon;
grant execute on function public.invite_agency_member(text, public.agency_role, public.access_profile, uuid, text[]) to authenticated;
drop function if exists public.invite_agency_member(text, public.agency_role, public.access_profile, uuid);

-- ── Activation grants them, as exceptions to the preset ───────────────────
create or replace function public.accept_agency_invitation(p_token uuid)
returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  i        public.invitations;
  v_email  citext;
  v_member uuid;
  k        text;
begin
  select email into v_email from public.profiles where id = auth.uid();
  if v_email is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into i from public.invitations where token = p_token;
  if i.id is null or i.accepted_at is not null or i.expires_at < now() then
    raise exception 'That invitation is no longer valid' using errcode = '22023';
  end if;
  if i.kind <> 'agency' then
    raise exception 'That is not a team invitation' using errcode = '22023';
  end if;
  if i.email <> v_email then
    raise exception 'This invitation was sent to a different email address' using errcode = '42501';
  end if;

  insert into public.agency_memberships (user_id, agency_id, role, scope, access_profile)
  values (auth.uid(), i.agency_id, i.agency_role, public.default_scope_for_role(i.agency_role),
          case when i.agency_role = 'agency_user' then coalesce(i.access_profile, 'custom') end)
  on conflict (user_id, agency_id) do update
    set role  = excluded.role,
        scope = excluded.scope,
        access_profile = excluded.access_profile
  returning id into v_member;

  /* The modules they were hired for, as their own exceptions — the profile
     itself never grants a module (§16). */
  foreach k in array coalesce(i.module_keys, '{}') loop
    insert into public.agency_member_permissions (membership_id, key, allowed)
    values (v_member, k, true)
    on conflict (membership_id, key) do update set allowed = true;
  end loop;

  if i.access_profile = 'team_lead' and i.lead_team_id is not null
     and exists (select 1 from public.teams t
                  where t.id = i.lead_team_id and t.agency_id = i.agency_id and t.archived_at is null) then
    insert into public.team_memberships (team_id, user_id, is_lead)
    values (i.lead_team_id, auth.uid(), true)
    on conflict (team_id, user_id) do update set is_lead = true;
  end if;

  update public.invitations set accepted_at = now() where id = i.id;
  perform public.log_audit('agency_invitation.accepted', 'invitation', i.id::text, null, null,
                           jsonb_build_object('role', i.agency_role, 'access_profile', i.access_profile,
                                              'modules', i.module_keys));
  return i.agency_id;
end $function$;
