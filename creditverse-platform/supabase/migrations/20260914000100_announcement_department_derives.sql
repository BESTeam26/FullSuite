-- 0349 — a department-targeted announcement reaches its department.
--
-- ---------------------------------------------------------------------------
-- THE LAST READER OF A DEPRECATED COLUMN, AND A LATENT BUG
--
-- Phase 3 (0348) stopped authorization reading `agency_memberships.scope`,
-- `.scope_division` and `.scope_department_id`. A sweep for the Phase 4 exit
-- criterion — "no active code, policy or function reads the deprecated
-- columns" — found one that still did:
--
--     and (a.department_id is null or am.scope_department_id = a.department_id)
--
-- `scope_department_id` is NULL for all six real members and always has been.
-- Nobody maintains it. So a department-targeted announcement notified exactly
-- nobody, silently. It has not bitten yet only because no announcement targets
-- a department today (0 of 1) — which is why it is being fixed now, while it
-- is still free, rather than during UAT when somebody first tries the feature.
--
-- This is not an authorization redesign. It is the same rule, read from the
-- place that actually holds the answer: live team membership, through
-- `my_departments_of(user)`.
-- ---------------------------------------------------------------------------

-- ── my_departments(), for somebody else ─────────────────────────────────
--
-- `my_departments()` answers for the caller. Announcement delivery asks about
-- a RECIPIENT, so it needs the same derivation for a named user. One body,
-- two entry points — rather than two derivations that can disagree.
create or replace function public.departments_of(p_user uuid)
returns setof uuid
language sql stable security definer set search_path = public as $function$
  select distinct t.department_id
    from public.team_memberships tm
    join public.teams t on t.id = tm.team_id and t.archived_at is null
   where tm.user_id = p_user and t.department_id is not null
$function$;
revoke execute on function public.departments_of(uuid) from public, anon;
grant execute on function public.departments_of(uuid) to authenticated;

comment on function public.departments_of(uuid) is
  'The departments a NAMED user belongs to, derived from live team membership. The recipient-facing twin of my_departments(); one derivation, two entry points (0349).';

create or replace function public.my_departments()
returns setof uuid
language sql stable security definer set search_path = public as $function$
  select public.departments_of(auth.uid())
$function$;

comment on function public.my_departments() is
  'The departments the caller belongs to, derived from live team membership. The canonical answer to "what is MY department".';

-- ── The audience rule, reading the right place ──────────────────────────
create or replace function public.announcement_notifiable(p_announcement uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = public as $function$
  select exists (
    select 1
      from public.announcements a
      left join public.organizations o on o.id = a.organization_id
     where a.id = p_announcement
       and a.archived_at is null
       and a.published_at is not null
       and case
         when a.organization_id is not null then exists (
           select 1 from public.org_memberships om
            where om.organization_id = a.organization_id and om.user_id = p_user)

         when a.audience = 'all_organizations' then exists (
           select 1 from public.org_memberships om
             join public.organizations o2 on o2.id = om.organization_id
            where om.user_id = p_user
              and o2.agency_id = coalesce(a.agency_id, o.agency_id,
                    (select am.agency_id from public.agency_memberships am
                      where am.user_id = a.created_by and am.status = 'active' limit 1)))

         when a.audience = 'bes_internal' then exists (
           select 1 from public.agency_memberships am
            where am.user_id = p_user
              and am.status = 'active'
              and (not a.managers_only
                   or am.role in ('agency_owner', 'agency_admin')
                   or (select c.allowed from public.agency_can_for_user(p_user, 'ops.manage') c))
              /* Derived from live team membership (0349). Was
                 `am.scope_department_id`, a column nobody maintains, so this
                 branch reached nobody. */
              and (a.department_id is null
                   or a.department_id in (select public.departments_of(p_user)))
              and (a.team_id is null
                   or am.role in ('agency_owner', 'agency_admin')
                   or (select c.allowed from public.agency_can_for_user(p_user, 'ops.manage') c)
                   or exists (select 1 from public.team_memberships tm
                               where tm.team_id = a.team_id and tm.user_id = p_user)))

         else false
       end
  )
$function$;

comment on function public.announcement_notifiable(uuid, uuid) is
  'Whether an announcement reaches this person. Department targeting derives from live team membership; the deprecated scope columns are read nowhere (0349).';
