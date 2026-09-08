-- 0215 — VIEW AS USER. A read-only preview, and not impersonation.
--
-- ===========================================================================
-- WHAT THIS IS, AND THE LINE IT MUST NOT CROSS
-- ===========================================================================
--
-- Dee, §35: "Do NOT swap auth tokens, change auth.uid(), login as employee,
-- create employee sessions, perform writes as employee. It is READ-ONLY
-- ACCESS PREVIEW."
--
-- So nothing here authenticates as anybody. `auth.uid()` remains the
-- previewer throughout, every policy still answers for the previewer, and the
-- preview is built out of FACTS ABOUT the target that a privileged caller is
-- allowed to read — their role, their grants, their assignments — rather than
-- out of becoming them.
--
-- That distinction is why these are separate parameterized functions instead
-- of "run the query as them". A parameterized copy of a visibility rule can be
-- audited, tested and compared against the original. A session swap cannot,
-- and one bug in it is a real login as somebody else.
--
-- ===========================================================================
-- THE DUPLICATION THIS DELIBERATELY ACCEPTS, AND HOW IT IS KEPT HONEST
-- ===========================================================================
--
-- `can_see_partner()`, `agency_can()` and friends all ask about `auth.uid()`.
-- Answering "what would DANIEL see" needs the same logic with a different
-- subject, and there is no way to parameterize a function that reads
-- `auth.uid()` internally.
--
-- So `*_for_user(p_user, …)` variants exist, and they are a second copy of
-- rules that already exist — which rule 6 would normally forbid. The trade is
-- taken because the alternative is impersonation, and it is kept honest the
-- only way it can be: matrix probes assert that for the CURRENT user each
-- parameterized function agrees with the original, on every fixture, in both
-- directions. A drift between them fails a test rather than producing a
-- preview that quietly lies.
--
-- ===========================================================================
-- WHO MAY PREVIEW
-- ===========================================================================
--
-- Dee, §34: the Agency Owner, and an Admin explicitly granted
-- `access.preview_as_user`. "Do not introduce a whole new security role
-- solely for the phrase Super Admin" — so Super Admin is an admin holding
-- that capability, not a fourth role.
-- ===========================================================================

insert into public.permission_keys (key, module, label, description, security_relevant, sort) values
  ('access.preview_as_user', 'Access', 'View as another user',
   'See exactly what another staff member sees, read-only. Grants no ability to act as them.',
   true, 160)
on conflict (key) do nothing;

/* Off for everybody by default. The owner holds it by role; an admin must be
   given it deliberately. */
insert into public.agency_role_permissions (agency_id, role, key, allowed) values
  (null, 'agency_manager',   'access.preview_as_user', false),
  (null, 'agency_team_lead', 'access.preview_as_user', false),
  (null, 'agency_agent',     'access.preview_as_user', false)
on conflict do nothing;

create or replace function public.can_preview_as_user()
returns boolean
language sql stable security definer set search_path = public as $function$
  select exists (
    select 1 from public.agency_memberships m
     where m.user_id = auth.uid() and m.status = 'active'
       and (m.role = 'agency_owner'
            or (m.role = 'agency_admin' and public.agency_can('access.preview_as_user')))
  )
$function$;
revoke execute on function public.can_preview_as_user() from public, anon;
grant execute on function public.can_preview_as_user() to authenticated;

comment on function public.can_preview_as_user() is
  'The Agency Owner by role, or an Admin explicitly granted access.preview_as_user. Super Admin is that capability, not a fourth role (Dee, §34).';

-- ── One capability, for a NAMED person ──────────────────────────────────
--
-- The same precedence `agency_can` uses, in the same order, with the SOURCE
-- reported — because §38 asks the Access Inspector to say WHY, and "denied"
-- without a reason is a support ticket.
create or replace function public.agency_can_for_user(p_user uuid, p_key text)
returns table (allowed boolean, source text)
language sql stable security definer set search_path = public as $function$
  select
    case
      when m.status <> 'active' then false
      when m.role in ('agency_owner', 'agency_admin') then true
      else coalesce(amp.allowed, arp_agency.allowed, arp_default.allowed, false)
    end,
    case
      when m.status <> 'active' then 'membership is ' || m.status
      when m.role in ('agency_owner', 'agency_admin') then 'held by role: ' || m.role::text
      when amp.allowed is not null then
        case when amp.allowed then 'granted to this person' else 'denied for this person' end
      when arp_agency.allowed is not null then 'role default for this agency'
      when arp_default.allowed is not null then 'role default'
      else 'no rule — denied'
    end
    from public.agency_memberships m
    left join public.agency_member_permissions amp
      on amp.membership_id = m.id and amp.key = p_key
    left join public.agency_role_permissions arp_agency
      on arp_agency.role = m.role and arp_agency.agency_id = m.agency_id and arp_agency.key = p_key
    left join public.agency_role_permissions arp_default
      on arp_default.role = m.role and arp_default.agency_id is null and arp_default.key = p_key
   where m.user_id = p_user
   limit 1
$function$;
revoke execute on function public.agency_can_for_user(uuid, text) from public, anon;
grant execute on function public.agency_can_for_user(uuid, text) to authenticated;

/* Every capability at once, for the Inspector. One call, not one per key. */
create or replace function public.access_capabilities_for_user(p_user uuid)
returns table (key text, module text, label text, allowed boolean, source text, security_relevant boolean)
language sql stable security definer set search_path = public as $function$
  select k.key, k.module, k.label, c.allowed, c.source, k.security_relevant
    from public.permission_keys k
    cross join lateral public.agency_can_for_user(p_user, k.key) c
   where public.can_preview_as_user() or p_user = auth.uid()
   order by k.module, k.sort, k.key
$function$;
revoke execute on function public.access_capabilities_for_user(uuid) from public, anon;
grant execute on function public.access_capabilities_for_user(uuid) to authenticated;

-- ── Who they are, organizationally ──────────────────────────────────────
create or replace function public.access_profile_for_user(p_user uuid)
returns jsonb
language sql stable security definer set search_path = public as $function$
  select case when not (public.can_preview_as_user() or p_user = auth.uid()) then null
    else jsonb_build_object(
      'userId', p_user,
      'name', (select coalesce(nullif(trim(pr.full_name), ''), pr.email) from public.profiles pr where pr.id = p_user),
      'email', (select pr.email from public.profiles pr where pr.id = p_user),
      'role', (select m.role::text from public.agency_memberships m where m.user_id = p_user),
      'status', (select m.status from public.agency_memberships m where m.user_id = p_user),
      'scope', (select m.scope::text from public.agency_memberships m where m.user_id = p_user),
      'jobTitle', (select m.job_title from public.agency_memberships m where m.user_id = p_user),
      /* The SEAT, and any seat they are covering (0209). */
      'positions', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'title', po.title, 'type', a.assignment_type,
                 'division', dv.name, 'department', dp.name, 'team', tm.name))
          from public.position_assignments a
          join public.positions po on po.id = a.position_id
          left join public.divisions dv on dv.id = po.division_id
          left join public.departments dp on dp.id = po.department_id
          left join public.teams tm on tm.id = po.team_id
         where a.user_id = p_user and a.effective_until is null), '[]'::jsonb),
      'division', (select dv.name from public.agency_memberships m
                     left join public.divisions dv on dv.id = m.primary_division_id
                    where m.user_id = p_user),
      'scopeDivision', (select m.scope_division::text from public.agency_memberships m where m.user_id = p_user),
      'department', (select dp.name from public.agency_memberships m
                       left join public.departments dp on dp.id = m.primary_department_id
                      where m.user_id = p_user),
      'teams', coalesce((
        select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'isLead', tmb.is_lead))
          from public.team_memberships tmb
          join public.teams t on t.id = tmb.team_id
         where tmb.user_id = p_user and t.archived_at is null), '[]'::jsonb),
      'reportsTo', (select coalesce(nullif(trim(mp.full_name), ''), mp.email)
                      from public.profiles mp where mp.id = public.manager_of(p_user))
    ) end
$function$;
revoke execute on function public.access_profile_for_user(uuid) from public, anon;
grant execute on function public.access_profile_for_user(uuid) to authenticated;

-- ── §38 — which partners, and WHY each one ──────────────────────────────
--
-- The reason is the point. "Partner Kevin Hernandez — ALLOWED — via Team
-- Daniel" is actionable; "allowed" is not. Mirrors `can_see_partner` branch
-- for branch, which is what the matrix compares it against.
create or replace function public.partners_visible_to_user(p_user uuid)
returns table (partner_id uuid, partner_name text, allowed boolean, reason text)
language sql stable security definer set search_path = public as $function$
  select g.id, g.name,
         (v.reason is not null),
         coalesce(v.reason, 'no assignment')
    from public.outsourcing_groups g
    cross join lateral (
      select case
        /* Agency-wide BY ROLE, the same rule 0154 established. */
        when exists (select 1 from public.agency_memberships m
                      where m.user_id = p_user and m.agency_id = g.agency_id
                        and m.status = 'active' and m.role in ('agency_owner','agency_admin'))
          then 'agency-wide by role'
        /* Assigned by name. */
        when exists (select 1 from public.partner_assignments a
                      where a.group_id = g.id and a.ended_on is null and a.user_id = p_user)
          then 'assigned directly'
        /* Or through a live team they are on — named, because that is the
           thing somebody would go and change. */
        else (select 'via team ' || t.name
                from public.partner_assignments a
                join public.teams t on t.id = a.team_id
                join public.team_memberships tm on tm.team_id = a.team_id and tm.user_id = p_user
               where a.group_id = g.id and a.ended_on is null and t.archived_at is null
               limit 1)
      end as reason
    ) v
   where (public.can_preview_as_user() or p_user = auth.uid())
     and exists (select 1 from public.agency_memberships m
                  where m.user_id = p_user and m.agency_id = g.agency_id and m.status = 'active')
   order by g.name
$function$;
revoke execute on function public.partners_visible_to_user(uuid) from public, anon;
grant execute on function public.partners_visible_to_user(uuid) to authenticated;

-- ── Which service engagements, and why (§10) ────────────────────────────
create or replace function public.services_visible_to_user(p_user uuid)
returns table (service_id uuid, service_name text, partner_name text, allowed boolean, reason text)
language sql stable security definer set search_path = public as $function$
  select s.id, s.name, g.name,
         (v.reason is not null),
         coalesce(v.reason, 'no assignment to this service')
    from public.partner_services s
    join public.outsourcing_groups g on g.id = s.group_id
    cross join lateral (
      select case
        when exists (select 1 from public.agency_memberships m
                      where m.user_id = p_user and m.agency_id = s.agency_id
                        and m.status = 'active' and m.role in ('agency_owner','agency_admin'))
          then 'agency-wide by role'
        when exists (select 1 from public.partner_assignments a
                      where a.group_id = s.group_id and a.ended_on is null
                        and (a.service_id is null or a.service_id = s.id)
                        and a.user_id = p_user)
          then 'assigned directly'
        else (select 'via team ' || t.name
                from public.partner_assignments a
                join public.teams t on t.id = a.team_id
                join public.team_memberships tm on tm.team_id = a.team_id and tm.user_id = p_user
               where a.group_id = s.group_id and a.ended_on is null
                 and (a.service_id is null or a.service_id = s.id)
                 and t.archived_at is null
               limit 1)
      end as reason
    ) v
   where public.can_preview_as_user() or p_user = auth.uid()
   order by g.name, s.name
$function$;
revoke execute on function public.services_visible_to_user(uuid) from public, anon;
grant execute on function public.services_visible_to_user(uuid) to authenticated;

-- ── Which conversations (§37) ───────────────────────────────────────────
--
-- Mirrors `channel_notifiable`, which is already the narrower-than-visible
-- predicate — so a preview can under-report a channel and never over-report
-- one. Stated in the Inspector as such.
create or replace function public.channels_visible_to_user(p_user uuid)
returns table (channel_id uuid, name text, owner_kind text, allowed boolean)
language sql stable security definer set search_path = public as $function$
  select c.id, c.name,
         case when c.agency_id is not null then 'BES internal'
              when c.partner_group_id is not null then 'partner'
              else 'organization' end,
         public.channel_notifiable(c.id, p_user)
    from public.channels c
   where (public.can_preview_as_user() or p_user = auth.uid())
     and c.archived_at is null
   order by 3, 2
$function$;
revoke execute on function public.channels_visible_to_user(uuid) from public, anon;
grant execute on function public.channels_visible_to_user(uuid) to authenticated;

comment on function public.channels_visible_to_user(uuid) is
  'Mirrors channel_notifiable, which is deliberately narrower than channel_visible — so a preview may show FEWER conversations than the person can open, never more. The Inspector says so rather than implying exactness.';
