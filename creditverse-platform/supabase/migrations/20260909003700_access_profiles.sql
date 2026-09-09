-- =============================================================================
-- Access profiles: Manager / Team Lead / Agent / Custom (Dee, 2026-09-09).
--
-- The two-role security model (0233/0234) STAYS: agency_admin and agency_user
-- are the only security roles, and nothing here reopens the collapsed enum.
-- What Dee lost with the collapse was the operational vocabulary — on the
-- invite screen every normal employee became an indistinguishable "Agency
-- User". This restores Manager / Team Lead / Agent as PRESETS on top of the
-- same engine:
--
--   security role   agency_admin | agency_user          (unchanged)
--   access profile  manager | team_lead | agent | custom (new, agency_user only)
--   position        job_title / teams / divisions        (unchanged, separate)
--
-- A profile is a permission DEFAULT, not a second authorization system. The
-- one shared resolver gains one layer, in this order:
--
--   admin → true
--     → the person's own explicit grant or denial      (unchanged, still wins)
--       → their access profile's platform default       (NEW)
--         → their agency's default for the role         (unchanged)
--           → the platform default for the role         (unchanged)
--             → false                                    (unchanged)
--
-- Team Lead is special: leading a team is a FACT (team_memberships.is_lead),
-- not a permission. Inviting a Team Lead therefore names the team they lead,
-- and activation writes that one fact — the profile and the fact are created
-- together so they cannot silently disagree.
--
-- Existing members: the only real memberships are three admins, so there is
-- nothing to map (verified against production before writing). Fixture users
-- keep a NULL profile, which resolves exactly as before.
-- =============================================================================

create type public.access_profile as enum ('manager', 'team_lead', 'agent', 'custom');

alter table public.agency_memberships
  add column if not exists access_profile public.access_profile;

comment on column public.agency_memberships.access_profile is
  'Operational preset for agency_user members (null for admins, whose role already grants everything). A permission DEFAULT the resolver consults between the member''s own overrides and the role defaults — never a security role.';

alter table public.invitations
  add column if not exists access_profile public.access_profile,
  add column if not exists lead_team_id uuid references public.teams(id) on delete set null;

-- ── The presets are platform doctrine: rows, not code branches ────────────
create table public.agency_profile_permissions (
  profile public.access_profile not null,
  key     text not null references public.permission_keys(key) on delete cascade,
  allowed boolean not null,
  primary key (profile, key)
);

comment on table public.agency_profile_permissions is
  'What each access profile grants by default. Consulted by resolve_agency_capability between member overrides and role defaults. Platform-seeded; per-person deviation is an agency_member_permissions override, never an edit here.';

alter table public.agency_profile_permissions enable row level security;

-- Staff may read the catalogue (the invite screen explains what a preset
-- grants); nobody writes it through the API — it changes by migration.
create policy agency_profile_permissions_select on public.agency_profile_permissions
  for select to authenticated
  using (public.is_agency_staff());

revoke all on public.agency_profile_permissions from public, anon;
grant select on public.agency_profile_permissions to authenticated;

insert into public.agency_profile_permissions (profile, key, allowed) values
  -- MANAGER: runs an authorized slice of the operation. ops.manage is the
  -- old manager rank (0233); scope still comes from teams/departments and
  -- partner assignments — never agency-wide by itself. No money by default.
  ('manager', 'ops.manage',            true),
  ('manager', 'team.manage',           true),
  ('manager', 'partners.view',         true),
  ('manager', 'partners.operations',   true),
  ('manager', 'partners.assignments',  true),
  ('manager', 'partners.contacts',     true),
  ('manager', 'partners.files.view',   true),
  ('manager', 'partners.files.upload', true),
  ('manager', 'reports.view',          true),
  ('manager', 'org.structure.view',    true),
  -- TEAM LEAD: team surfaces come from the is_lead FACT, not from here.
  -- These are the working capabilities a lead needs on assigned partners.
  ('team_lead', 'partners.view',         true),
  ('team_lead', 'partners.files.view',   true),
  ('team_lead', 'partners.files.upload', true);
  -- AGENT and CUSTOM seed nothing: an agent works what is assigned through
  -- My Work / My Time / EOD (none of which are capability-gated), and module
  -- access (CreditOps, BES CRM, …) is a deliberate per-person grant — a
  -- CreditOps agent never sees BES CRM merely by being an agent.

-- ── The one resolver gains its one new layer ──────────────────────────────
create or replace function public.resolve_agency_capability(p_key text)
returns boolean
language sql stable security definer set search_path = public as $function$
  select coalesce((
    select case
      when m.role in ('agency_owner', 'agency_admin') then true
      else coalesce(
        (select amp.allowed from public.agency_member_permissions amp
          where amp.membership_id = m.id and amp.key = p_key),
        (select app.allowed from public.agency_profile_permissions app
          where app.profile = m.access_profile and app.key = p_key),
        (select arp.allowed from public.agency_role_permissions arp
          where arp.role = m.role and arp.agency_id = m.agency_id and arp.key = p_key),
        (select arp.allowed from public.agency_role_permissions arp
          where arp.role = m.role and arp.agency_id is null and arp.key = p_key),
        false)
    end
    from public.agency_memberships m
   where m.user_id = auth.uid()
   limit 1
  ), false)
$function$;

-- ── The invitation carries the whole decision ─────────────────────────────
-- New signature; the two-argument form is dropped so there is exactly one.
drop function if exists public.invite_agency_member(text, public.agency_role);

create function public.invite_agency_member(
  p_email     text,
  p_role      public.agency_role,
  p_profile   public.access_profile default null,
  p_lead_team uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  v_agency  uuid;
  v_email   citext := lower(trim(p_email))::citext;
  v_id      uuid;
  v_profile public.access_profile;
  v_lead    uuid;
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

  /* An admin's role already grants everything, so a profile would be a
     second, contradictable statement of the same thing — it is discarded.
     An agency_user with no stated profile becomes CUSTOM: the deny-by-default
     preset, granting nothing until somebody deliberately does. */
  if p_role = 'agency_admin' then
    v_profile := null; v_lead := null;
  else
    v_profile := coalesce(p_profile, 'custom');
    v_lead := p_lead_team;
  end if;

  /* Leading a team is a fact about a team. Name the team now, so activation
     creates the profile and the fact together (they must never disagree). */
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
         access_profile = v_profile, lead_team_id = v_lead, invited_by = auth.uid()
   where kind = 'agency' and agency_id = v_agency and email = v_email and accepted_at is null
  returning id into v_id;

  if v_id is null then
    insert into public.invitations (email, kind, agency_id, agency_role, access_profile, lead_team_id, invited_by)
    values (v_email, 'agency', v_agency, p_role, v_profile, v_lead, auth.uid())
    returning id into v_id;
  end if;

  perform public.log_audit('agency_invitation.sent', 'invitation', v_id::text, null, null,
                           jsonb_build_object('email', v_email::text, 'role', p_role,
                                              'access_profile', v_profile, 'lead_team_id', v_lead));
  return v_id;
end $function$;

revoke execute on function public.invite_agency_member(text, public.agency_role, public.access_profile, uuid) from public, anon;
grant execute on function public.invite_agency_member(text, public.agency_role, public.access_profile, uuid) to authenticated;

-- ── Activation writes the profile — and, for a lead, the fact ─────────────
create or replace function public.accept_agency_invitation(p_token uuid)
returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  i       public.invitations;
  v_email citext;
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
        /* Re-inviting somebody at a different role used to change the role and
           leave the old scope, which is how the two columns drift apart. The
           same holds for the profile: the invitation is the whole decision. */
        scope = excluded.scope,
        access_profile = excluded.access_profile;

  /* The lead FACT, created with the profile. If they are already on the
     team, they become its lead; if not, they join as its lead. */
  if i.access_profile = 'team_lead' and i.lead_team_id is not null
     and exists (select 1 from public.teams t
                  where t.id = i.lead_team_id and t.agency_id = i.agency_id and t.archived_at is null) then
    insert into public.team_memberships (team_id, user_id, is_lead)
    values (i.lead_team_id, auth.uid(), true)
    on conflict (team_id, user_id) do update set is_lead = true;
  end if;

  update public.invitations set accepted_at = now() where id = i.id;
  perform public.log_audit('agency_invitation.accepted', 'invitation', i.id::text, null, null,
                           jsonb_build_object('role', i.agency_role, 'access_profile', i.access_profile));
  return i.agency_id;
end $function$;
