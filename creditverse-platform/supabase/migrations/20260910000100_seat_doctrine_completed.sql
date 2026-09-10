-- =============================================================================
-- Seat doctrine, completed (Dee, 2026-09-10, §24).
--
-- 0127/0128 built the count, the reasons and the refusal. Reconciling them
-- against the doctrine as restated found four gaps, one of them security:
--
-- A. DEACTIVATED IS NOT DEACTIVATED. 0127 said "authorization already fails
--    for an archived member because every helper reads membership". It did
--    not: is_org_member, is_org_admin, is_org_owner_admin, org_role_for,
--    my_org_ids, org_scope_allows, member_can and nine more read
--    org_memberships without looking at archived_at. An archived admin kept
--    admin access; only the seat was freed. Every helper below now treats an
--    archived membership as no membership. Nothing else about them changes.
--
-- B. BES PERSONNEL means ACTIVE BES personnel. The exclusion (and the
--    exemption from the refusal) read `exists agency_memberships` with no
--    status, so somebody who LEFT BES and was later hired by a customer would
--    have been a free seat forever. Now: status = 'active'.
--
-- C. WHO MAY INSPECT. Seat detail (names, emails, reasons) was readable by
--    any BES staff member and any organization member. Now: the organization's
--    owner/admin, and on the BES side its agency admins or holders of
--    finance.dashboard.view. The summary (numbers only) stays readable by any
--    member of the organization, so a manager can see "9 of 10".
--
-- D. AUDIT. The doctrine names seven events; 0128 wrote three. Added: seat
--    became billable / stopped being billable (derived from the SAME
--    predicate, on membership, owner and BES-status changes), owner
--    designation changed, capacity changed, plan changed. Every one is written
--    only when the value actually changed, so a repeated request writes
--    nothing — dedupe by construction, not by a unique index on a log.
--
-- Capacity is still not authorization: no policy changes, no grant widens.
-- =============================================================================

-- ── A · an archived membership is no membership ────────────────────────────
create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $function$
  select exists (
    select 1 from public.org_memberships
     where user_id = auth.uid() and organization_id = p_org and archived_at is null
  )
$function$;

create or replace function public.is_org_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $function$
  select exists (
    select 1 from public.org_memberships
     where user_id = auth.uid() and organization_id = p_org and archived_at is null
       and role in ('org_admin', 'org_manager')
  )
$function$;

create or replace function public.is_org_owner_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $function$
  select p_org is not null and exists (
    select 1 from public.org_memberships
     where user_id = auth.uid() and organization_id = p_org and archived_at is null and role = 'org_admin'
  )
$function$;

create or replace function public.org_role_for(p_org uuid)
returns public.org_role language sql stable security definer set search_path = public as $function$
  select role from public.org_memberships
   where user_id = auth.uid() and organization_id = p_org and archived_at is null
$function$;

create or replace function public.my_org_ids()
returns setof uuid language sql stable security definer set search_path = public as $function$
  select organization_id from public.org_memberships where user_id = auth.uid() and archived_at is null
  union
  select organization_id from public.external_memberships where user_id = auth.uid()
$function$;

create or replace function public.org_scope_allows(p_org uuid, p_assignee uuid)
returns boolean language sql stable security definer set search_path = public as $function$
  select p_org is not null and (
    public.is_org_admin(p_org)
    or exists (
      select 1 from public.org_memberships m
       where m.user_id = auth.uid() and m.organization_id = p_org and m.archived_at is null
         and (not m.assigned_only or p_assignee = auth.uid())
    )
  )
$function$;

create or replace function public.member_can(p_org uuid, p_key text)
returns boolean language sql stable security definer set search_path = public as $function$
  select case
    when p_org is null then false
    when public.is_org_admin(p_org) then true
    else coalesce(
      (select mp.allowed from public.member_permissions mp join public.org_memberships m on m.id = mp.membership_id
        where m.user_id = auth.uid() and m.organization_id = p_org and m.archived_at is null and mp.key = p_key),
      (select rp.allowed from public.role_permissions rp join public.org_memberships m on m.role = rp.role
        where m.user_id = auth.uid() and m.organization_id = p_org and m.archived_at is null
          and rp.organization_id = p_org and rp.key = p_key),
      (select rp.allowed from public.role_permissions rp join public.org_memberships m on m.role = rp.role
        where m.user_id = auth.uid() and m.organization_id = p_org and m.archived_at is null
          and rp.organization_id is null and rp.key = p_key),
      false)
  end
$function$;

create or replace function public.shares_scope_with(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $function$
  select p_user = auth.uid()
    or exists (select 1 from public.agency_memberships a join public.agency_memberships b
                 on a.agency_id = b.agency_id where a.user_id = auth.uid() and b.user_id = p_user)
    or exists (select 1 from public.org_memberships a join public.org_memberships b
                 on a.organization_id = b.organization_id
              where a.user_id = auth.uid() and b.user_id = p_user
                and a.archived_at is null and b.archived_at is null)
    -- engaged managers may see the customer users they coordinate with
    or exists (select 1 from public.org_memberships b
                where b.user_id = p_user and b.archived_at is null
                  and public.bes_engaged_with(b.organization_id)
                  and public.is_manager_of(public.org_agency(b.organization_id)))
$function$;

create or replace function public.work_items_assignee_allowed()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  if new.assigned_to is null then return new; end if;
  if tg_op = 'UPDATE' and new.assigned_to is not distinct from old.assigned_to then return new; end if;

  if new.scope = 'AGENCY' then
    if not exists (select 1 from public.agency_memberships am where am.user_id = new.assigned_to and am.agency_id = new.agency_id) then
      raise exception 'assignee is not staff of this agency' using errcode = '23514';
    end if;
    return new;
  end if;

  if exists (select 1 from public.org_memberships om
              where om.user_id = new.assigned_to and om.organization_id = new.organization_id
                and om.archived_at is null) then
    return new;
  end if;
  if new.workspace_id is not null
     and exists (select 1 from public.agency_memberships am where am.user_id = new.assigned_to and am.agency_id = new.agency_id)
     and exists (
       select 1 from public.workspace_shares s
         join public.fulfillment_engagements e on e.id = s.engagement_id
        where s.workspace_id = new.workspace_id and s.revoked_at is null and s.access = 'work'
          and (s.board_id is null or s.board_id = new.board_id)
          and e.service = 'talentops' and e.organization_id = new.organization_id
          and public.engagement_is_live(e.status, e.effective_from, e.effective_to)) then
    return new;
  end if;
  raise exception 'assignee is not a member of this organization (or BES staff under a live work share)' using errcode = '23514';
end $function$;

create or replace function public.assignable_profiles(p_scope public.work_scope, p_org uuid default null)
returns table(id uuid, full_name text, email text, role text)
language sql stable security definer set search_path = public as $function$
  select p.id, p.full_name, p.email::text, am.role::text
    from public.agency_memberships am join public.profiles p on p.id = am.user_id
   where p_scope = 'AGENCY'
     and (public.is_manager_of(am.agency_id)
          or exists (select 1 from public.team_memberships tm join public.teams t on t.id = tm.team_id
                      where tm.user_id = auth.uid() and tm.is_lead and t.agency_id = am.agency_id))
  union all
  select p.id, p.full_name, p.email::text, om.role::text
    from public.org_memberships om join public.profiles p on p.id = om.user_id
   where p_scope = 'ORGANIZATION' and om.organization_id = p_org and om.archived_at is null
     and (public.is_org_admin(p_org)
          or (public.bes_engaged_with(p_org) and public.is_manager_of(public.org_agency(p_org))))
$function$;

create or replace function public.organization_directory(p_org uuid)
returns table(membership_id uuid, user_id uuid, name text, preferred_name text, email text, job_title text,
              platform_role public.org_role, department_id uuid, department_name text, phone text,
              avatar_path text, birth_month smallint, birth_day smallint, since timestamptz)
language sql stable security definer set search_path = public as $function$
  select m.id, m.user_id,
         coalesce(p.full_name, split_part(p.email::text, '@', 1)) as name,
         p.preferred_name, p.email::text,
         coalesce(m.job_title, p.title) as job_title,
         m.role, m.organization_department_id, d.name,
         p.phone, p.avatar_path,
         case when p.birthday_visible then p.birth_month end,
         case when p.birthday_visible then p.birth_day end,
         m.created_at
    from public.org_memberships m
    join public.profiles p on p.id = m.user_id
    left join public.organization_departments d on d.id = m.organization_department_id
   where m.organization_id = p_org
     and m.archived_at is null
     and public.can_view_org(p_org)
   order by d.sort nulls last, d.name nulls last, coalesce(p.full_name, p.email::text)
$function$;

create or replace function public.team_birthdays(p_org uuid, p_within_days integer default 14)
returns table(user_id uuid, name text, avatar_path text, birth_month smallint, birth_day smallint, days_away integer)
language sql stable security definer set search_path = public as $function$
  with people as (
    select p.id, coalesce(nullif(p.preferred_name, ''), p.full_name, split_part(p.email::text, '@', 1)) as name,
           p.avatar_path, p.birth_month, p.birth_day
    from public.profiles p
    join public.org_memberships m on m.user_id = p.id and m.organization_id = p_org and m.archived_at is null
    where p.birthday_visible and p.birth_month is not null
  ), dated as (
    select id, name, avatar_path, birth_month, birth_day,
           case
             when make_date(extract(year from current_date)::int, birth_month, least(birth_day, 28)) >= current_date
               then make_date(extract(year from current_date)::int, birth_month, least(birth_day, 28))
             else make_date(extract(year from current_date)::int + 1, birth_month, least(birth_day, 28))
           end as next_on
    from people
  )
  select id, name, avatar_path, birth_month, birth_day, (next_on - current_date)::int
  from dated
  where public.is_org_member(p_org)
    and (next_on - current_date) <= greatest(coalesce(p_within_days, 14), 0)
  order by (next_on - current_date), name
$function$;

create or replace function public.may_notify_mention(p_user uuid, p_agency uuid, p_org uuid, p_visibility public.activity_visibility)
returns boolean language sql stable security definer set search_path = public as $function$
  select case
    when p_user is null then false
    when p_visibility = 'bes_internal' then
      exists (select 1 from public.agency_memberships m where m.user_id = p_user and m.agency_id = p_agency)
    when p_org is not null then
      exists (select 1 from public.org_memberships m
               where m.user_id = p_user and m.organization_id = p_org and m.archived_at is null)
    else
      exists (select 1 from public.agency_memberships m where m.user_id = p_user and m.agency_id = p_agency)
  end
$function$;

create or replace function public.lender_visible(p_lender uuid)
returns boolean language sql stable security definer set search_path = public as $function$
  select exists (select 1 from public.lenders l where l.id = p_lender and (
    (l.organization_id is null and (public.is_agency_staff()
        or exists (select 1 from public.org_memberships m where m.user_id = auth.uid() and m.archived_at is null)))
    or (l.organization_id is not null and (public.is_org_member(l.organization_id) or public.is_manager_of(l.agency_id)))
    or exists (select 1 from public.lender_users lu where lu.lender_id = l.id and lu.user_id = auth.uid())))
$function$;

create or replace function public.letter_template_visible(p_org uuid, p_agency uuid)
returns boolean language sql stable security definer set search_path = public as $function$
  select (p_org is null and (public.is_agency_staff()
            or exists (select 1 from public.org_memberships m where m.user_id = auth.uid() and m.archived_at is null)))
      or (p_org is not null and (public.is_org_member(p_org) or public.is_manager_of(p_agency)))
$function$;

create or replace function public.save_organization_department(p_id uuid, p_org uuid, p_name text, p_description text, p_lead uuid, p_sort integer)
returns uuid language plpgsql security definer set search_path = public as $function$
declare
  v_row public.organization_departments;
  v_before jsonb;
begin
  if not public.member_can(p_org, 'team.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  -- A lead must be an ACTIVE member of this organization: never a name, never a guess.
  if p_lead is not null and not exists (
    select 1 from public.org_memberships m
     where m.organization_id = p_org and m.user_id = p_lead and m.archived_at is null
  ) then
    raise exception 'the department lead must be a member of this organization' using errcode = '42501';
  end if;
  if p_id is null then
    insert into public.organization_departments (organization_id, name, description, lead_user_id, sort, created_by)
    values (p_org, p_name, nullif(p_description, ''), p_lead, coalesce(p_sort, 100), auth.uid())
    returning * into v_row;
  else
    select to_jsonb(d) into v_before from public.organization_departments d where d.id = p_id and d.organization_id = p_org;
    if v_before is null then
      raise exception 'department not found' using errcode = 'P0002';
    end if;
    update public.organization_departments
       set name = p_name, description = nullif(p_description, ''), lead_user_id = p_lead, sort = coalesce(p_sort, 100)
     where id = p_id
    returning * into v_row;
  end if;
  perform public.log_audit('organization_department.saved', 'organization_department', v_row.id::text, p_org, v_before, to_jsonb(v_row));
  return v_row.id;
end $function$;

create or replace function public.notify_announcement()
returns trigger language plpgsql security definer set search_path = public as $function$
declare
  v_agency uuid;
begin
  if new.published_at is null then return new; end if;
  if tg_op = 'UPDATE' and old.published_at is not null then return new; end if;

  select coalesce(
           new.agency_id,
           (select o.agency_id from public.organizations o where o.id = new.organization_id),
           (select am.agency_id from public.agency_memberships am
             where am.user_id = new.created_by and am.status = 'active' limit 1))
    into v_agency;
  if v_agency is null then return new; end if;

  insert into public.notifications
    (recipient_id, actor_id, agency_id, organization_id, kind, entity_type, entity_id,
     entity_label, visibility, title, detail)
  select r.user_id, new.created_by, v_agency, r.organization_id, 'announcement',
         'announcement', new.id::text, new.title, r.visibility,
         'New announcement', left(new.body, 280)
    from (
      select am.user_id, null::uuid as organization_id, 'bes_internal'::public.activity_visibility as visibility
        from public.agency_memberships am
       where new.audience = 'bes_internal'
         and am.agency_id = v_agency and am.status = 'active'
      union all
      select om.user_id, om.organization_id, 'organization_internal'::public.activity_visibility
        from public.org_memberships om
       where new.audience = 'organization'
         and om.organization_id = new.organization_id and om.archived_at is null
      union all
      select om.user_id, om.organization_id, 'organization_internal'::public.activity_visibility
        from public.org_memberships om
        join public.organizations o on o.id = om.organization_id
       where new.audience = 'all_organizations'
         and o.agency_id = v_agency and om.archived_at is null
    ) as r
   where r.user_id is distinct from new.created_by
     and public.announcement_notifiable(new.id, r.user_id)
  on conflict do nothing;

  return new;
end $function$;

-- ── B · THE seat predicate, once ───────────────────────────────────────────
/**
 * Does this person consume one of this organization's purchased seats?
 *
 *   an active (not archived) membership of the organization
 *   who is not the designated owner
 *   and is not ACTIVE BES personnel.
 *
 * Portal consumers, GHL-only users and service identities hold no
 * org_memberships row, so they are false by construction. Every count, every
 * reason, every refusal and every audit event reads this one function.
 */
create or replace function public.seat_billable(p_org uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $function$
  select exists (
    select 1
      from public.org_memberships m
      join public.organizations o on o.id = m.organization_id
     where m.organization_id = p_org and m.user_id = p_user
       and m.archived_at is null
       and o.owner_user_id is distinct from m.user_id
       and not exists (select 1 from public.agency_memberships am
                        where am.user_id = m.user_id and am.status = 'active')
  )
$function$;
revoke all on function public.seat_billable(uuid, uuid) from public, anon;
grant execute on function public.seat_billable(uuid, uuid) to authenticated;

/** Who on the BES side may inspect a customer's seats: agency admins, or finance. */
create or replace function public.bes_may_inspect_seats(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $function$
  select public.is_admin_of(public.org_agency(p_org))
      or (public.is_staff_of(public.org_agency(p_org)) and public.agency_can('finance.dashboard.view'))
$function$;
revoke all on function public.bes_may_inspect_seats(uuid) from public, anon;
grant execute on function public.bes_may_inspect_seats(uuid) to authenticated;

create or replace function public.organization_seat_detail(p_org uuid)
returns table (user_id uuid, email text, full_name text, role text, counts boolean, reason text)
language sql stable security definer set search_path = public as $function$
  select
    m.user_id,
    p.email::text,
    p.full_name,
    m.role::text,
    public.seat_billable(p_org, m.user_id) as counts,
    case
      when o.owner_user_id = m.user_id then 'owner — included in every plan'
      when m.archived_at is not null then 'deactivated'
      when exists (select 1 from public.agency_memberships am where am.user_id = m.user_id and am.status = 'active')
        then 'BES personnel — never a customer seat'
      else null
    end as reason
  from public.org_memberships m
  join public.organizations o on o.id = m.organization_id
  left join public.profiles p on p.id = m.user_id
  where m.organization_id = p_org
    and (public.is_org_owner_admin(p_org) or public.bes_may_inspect_seats(p_org))
$function$;

create or replace function public.organization_seat_summary(p_org uuid)
returns table (
  seats_used integer,
  pending_invitations integer,
  seats_committed integer,
  seats_included integer,
  seats_available integer,
  over_capacity boolean,
  source text
) language sql stable security definer set search_path = public as $function$
  with used as (
    select count(*)::int n from public.org_memberships m
     where m.organization_id = p_org and public.seat_billable(p_org, m.user_id)
  ),
  pending as (
    select count(*)::int n from public.invitations i
     where i.organization_id = p_org and i.kind = 'organization'
       and i.accepted_at is null and i.expires_at > now()
  ),
  allowance as (
    select
      coalesce(
        (select s.seats from public.organization_subscriptions s
          where s.organization_id = p_org and s.status in ('trialing','active','past_due')
          order by s.created_at desc limit 1),
        (select pl.seats_included from public.organization_trials t
           join public.plans pl on pl.key = t.plan_key
          where t.organization_id = p_org limit 1)
      ) as included,
      case
        when exists (select 1 from public.organization_subscriptions s
                      where s.organization_id = p_org and s.status in ('trialing','active','past_due'))
          then 'subscription'
        when exists (select 1 from public.organization_trials t where t.organization_id = p_org)
          then 'trial plan'
        else 'no plan in force'
      end as src
  )
  select
    used.n,
    pending.n,
    used.n + pending.n,
    allowance.included,
    case when allowance.included is null then null else allowance.included - (used.n + pending.n) end,
    case when allowance.included is null then false else (used.n + pending.n) > allowance.included end,
    allowance.src
  from used, pending, allowance
  where public.is_org_member(p_org) or public.bes_may_inspect_seats(p_org)
$function$;

create or replace function public.organization_seat_usage(p_org uuid)
returns integer language sql stable security definer set search_path = public as $function$
  select case when public.is_org_member(p_org) or public.bes_may_inspect_seats(p_org)
              then (select count(*)::int from public.org_memberships m
                     where m.organization_id = p_org and public.seat_billable(p_org, m.user_id))
         end
$function$;

create or replace function public.assert_seat_available(
  p_org uuid,
  p_for_user uuid default null,
  p_ignore_pending boolean default false
) returns void language plpgsql stable security definer set search_path = public as $function$
declare u record; v_committed integer;
begin
  if p_org is null then return; end if;
  -- Somebody who would not consume a seat cannot be refused one: ACTIVE BES
  -- personnel, or the designated owner.
  if p_for_user is not null and (
       exists (select 1 from public.agency_memberships am where am.user_id = p_for_user and am.status = 'active')
       or exists (select 1 from public.organizations o where o.id = p_org and o.owner_user_id = p_for_user)
     ) then
    return;
  end if;
  select * into u from public.organization_seat_summary(p_org);
  if u.seats_included is null then return; end if;
  v_committed := case when p_ignore_pending then u.seats_used else u.seats_committed end;
  if v_committed >= u.seats_included then
    raise exception 'This organization has used all % of its seats. Deactivate a member or add seats to the plan.', u.seats_included
      using errcode = '22023';
  end if;
end $function$;

/* Idempotent: asking for the state a membership is already in changes nothing
   and writes nothing (Dee: no duplicate billing events from repeated requests). */
create or replace function public.set_member_archived(p_membership uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = public as $function$
declare m public.org_memberships%rowtype;
begin
  select * into m from public.org_memberships where id = p_membership;
  if m.id is null then raise exception 'membership not found' using errcode = 'P0002'; end if;
  if not (public.is_org_owner_admin(m.organization_id) or public.is_manager_of(public.org_agency(m.organization_id))) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if exists (select 1 from public.organizations o where o.id = m.organization_id and o.owner_user_id = m.user_id) then
    raise exception 'The organization owner cannot be deactivated' using errcode = '22023';
  end if;
  if (p_archived and m.archived_at is not null) or (not p_archived and m.archived_at is null) then
    return;
  end if;
  if not p_archived then
    perform public.assert_seat_available(m.organization_id, m.user_id);
  end if;
  update public.org_memberships set archived_at = case when p_archived then now() end where id = p_membership;
  perform public.log_audit(
    case when p_archived then 'organization.member_archived' else 'organization.member_restored' end,
    'org_membership', p_membership::text, m.organization_id, to_jsonb(m),
    jsonb_build_object('archived', p_archived));
end $function$;

-- ── D · the audit the doctrine names, derived from the predicate ───────────
/**
 * Writes seat_billable / seat_unbillable for one person on one organization
 * when — and only when — the answer changed. Callers pass what was true before
 * and after; the function never guesses.
 */
create or replace function public.seat_transition_audit(
  p_org uuid, p_user uuid, p_membership uuid, p_before boolean, p_after boolean, p_cause text)
returns void language plpgsql security definer set search_path = public as $function$
begin
  if p_before is not distinct from p_after then return; end if;
  perform public.log_audit(
    case when p_after then 'organization.seat_billable' else 'organization.seat_unbillable' end,
    'org_membership', coalesce(p_membership::text, p_user::text), p_org,
    jsonb_build_object('user_id', p_user, 'billable', p_before),
    jsonb_build_object('user_id', p_user, 'billable', p_after, 'cause', p_cause));
end $function$;
revoke execute on function public.seat_transition_audit(uuid, uuid, uuid, boolean, boolean, text) from public, anon, authenticated;

/* A membership row appears, is archived/restored, or disappears. */
create or replace function public.seat_audit_membership()
returns trigger language plpgsql security definer set search_path = public as $function$
declare
  v_owner uuid; v_bes boolean; v_before boolean; v_after boolean; v_org uuid; v_user uuid; v_id uuid;
begin
  v_org  := coalesce(new.organization_id, old.organization_id);
  v_user := coalesce(new.user_id, old.user_id);
  v_id   := coalesce(new.id, old.id);
  select owner_user_id into v_owner from public.organizations where id = v_org;
  v_bes := exists (select 1 from public.agency_memberships am where am.user_id = v_user and am.status = 'active');
  v_before := tg_op <> 'INSERT' and old.archived_at is null and v_owner is distinct from v_user and not v_bes;
  v_after  := tg_op <> 'DELETE' and new.archived_at is null and v_owner is distinct from v_user and not v_bes;
  perform public.seat_transition_audit(v_org, v_user, v_id, v_before, v_after,
    case tg_op when 'INSERT' then 'member added' when 'DELETE' then 'member removed'
               when 'UPDATE' then case when new.archived_at is null then 'member reactivated' else 'member deactivated' end end);
  return null;
end $function$;
revoke execute on function public.seat_audit_membership() from public, anon, authenticated;
drop trigger if exists org_memberships_seat_audit on public.org_memberships;
create trigger org_memberships_seat_audit
  after insert or update of archived_at or delete on public.org_memberships
  for each row execute function public.seat_audit_membership();

/* The owner designation moves: the old owner's seat becomes billable, the new
   owner's stops. The designation change itself is its own event. */
create or replace function public.seat_audit_owner()
returns trigger language plpgsql security definer set search_path = public as $function$
declare m record;
begin
  if new.owner_user_id is not distinct from old.owner_user_id then return null; end if;
  perform public.log_audit('organization.owner_changed', 'organization', new.id::text, new.id,
    jsonb_build_object('owner_user_id', old.owner_user_id),
    jsonb_build_object('owner_user_id', new.owner_user_id));
  for m in select id, user_id from public.org_memberships
            where organization_id = new.id and archived_at is null
              and user_id in (old.owner_user_id, new.owner_user_id)
              and not exists (select 1 from public.agency_memberships am where am.user_id = org_memberships.user_id and am.status = 'active')
  loop
    perform public.seat_transition_audit(new.id, m.user_id, m.id,
      m.user_id is distinct from old.owner_user_id,   -- billable before: was not the owner
      m.user_id is distinct from new.owner_user_id,   -- billable after: is not the owner
      'owner designation changed');
  end loop;
  return null;
end $function$;
revoke execute on function public.seat_audit_owner() from public, anon, authenticated;
drop trigger if exists organizations_seat_audit_owner on public.organizations;
create trigger organizations_seat_audit_owner
  after update of owner_user_id on public.organizations
  for each row execute function public.seat_audit_owner();

/* BES employment starts or ends for somebody who also holds customer
   memberships: their classification flips on every one of them. */
create or replace function public.seat_audit_agency_status()
returns trigger language plpgsql security definer set search_path = public as $function$
declare m record; v_was boolean; v_is boolean;
begin
  v_was := old.status = 'active';
  v_is  := new.status = 'active';
  if v_was = v_is then return null; end if;
  for m in select om.id, om.organization_id, om.user_id
             from public.org_memberships om
             join public.organizations o on o.id = om.organization_id
            where om.user_id = new.user_id and om.archived_at is null
              and o.owner_user_id is distinct from om.user_id
  loop
    perform public.seat_transition_audit(m.organization_id, m.user_id, m.id,
      not v_was, not v_is,
      case when v_is then 'became BES personnel' else 'left BES' end);
  end loop;
  return null;
end $function$;
revoke execute on function public.seat_audit_agency_status() from public, anon, authenticated;
drop trigger if exists agency_memberships_seat_audit on public.agency_memberships;
create trigger agency_memberships_seat_audit
  after update of status on public.agency_memberships
  for each row execute function public.seat_audit_agency_status();

/* Capacity and plan: written only for a value that actually changed. */
create or replace function public.seat_audit_subscription()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  if tg_op = 'INSERT' then
    perform public.log_audit('organization.plan_changed', 'organization_subscription', new.id::text, new.organization_id,
      null, jsonb_build_object('plan_key', new.plan_key, 'seats', new.seats, 'status', new.status));
    return null;
  end if;
  if new.plan_key is distinct from old.plan_key then
    perform public.log_audit('organization.plan_changed', 'organization_subscription', new.id::text, new.organization_id,
      jsonb_build_object('plan_key', old.plan_key), jsonb_build_object('plan_key', new.plan_key));
  end if;
  if new.seats is distinct from old.seats then
    perform public.log_audit('organization.capacity_changed', 'organization_subscription', new.id::text, new.organization_id,
      jsonb_build_object('seats', old.seats), jsonb_build_object('seats', new.seats));
  end if;
  if new.status is distinct from old.status then
    perform public.log_audit('organization.subscription_status_changed', 'organization_subscription', new.id::text, new.organization_id,
      jsonb_build_object('status', old.status), jsonb_build_object('status', new.status));
  end if;
  return null;
end $function$;
revoke execute on function public.seat_audit_subscription() from public, anon, authenticated;
drop trigger if exists organization_subscriptions_seat_audit on public.organization_subscriptions;
create trigger organization_subscriptions_seat_audit
  after insert or update on public.organization_subscriptions
  for each row execute function public.seat_audit_subscription();

comment on function public.seat_billable(uuid, uuid) is
  'THE seat predicate (§24). Active membership, not the owner, not ACTIVE BES personnel. Read by the count, the summary, the refusal and every seat audit event — one definition.';
