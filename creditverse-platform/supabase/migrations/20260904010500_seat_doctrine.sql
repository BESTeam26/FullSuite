-- 0127 — Seats: one definition, used by the screen and by the enforcement.
--
-- Doctrine §24. Until now none of it was encoded anywhere: there was no way to
-- ask how many seats an organization was using, no way to stop it exceeding
-- what it bought, and no way for a member to be disabled without deleting the
-- row — which would have taken their historical attribution with it (rule 4).
--
-- ---------------------------------------------------------------------------
-- SEAT CAPACITY IS NOT AUTHORIZATION.
--
-- Nothing here decides what anybody may do. A seat is a commercial count of
-- how many of the organization's own people hold a platform login. Permission
-- stays exactly where it was — role, permission key, scope, assignment,
-- entitlement, engagement — and is unaffected by whether a seat is free.
--
-- The two must not be confused, so this migration adds no policy, changes no
-- policy, and grants nothing new. It adds a count, a reason for each count,
-- and a refusal when the count would exceed what was bought.
-- ---------------------------------------------------------------------------

-- 1. A member can be disabled without being erased.
alter table public.org_memberships
  add column if not exists archived_at timestamptz;

comment on column public.org_memberships.archived_at is
  'Set to disable a member without deleting them. An archived member consumes no seat and keeps every historical attribution (rule 4). Authorization already fails for them because every helper reads membership; this column is what makes the seat free.';

create index if not exists org_memberships_active_idx
  on public.org_memberships (organization_id) where archived_at is null;

-- ---------------------------------------------------------------------------
-- 2. WHO CONSUMES A SEAT — the single definition.
--
-- One row per person the organization could conceivably be billed for, with
-- `counts` and, when it is false, the reason. A screen that can only show a
-- number invites the question "why is it seven?"; this answers it.
--
-- The rules, each as its own branch so no two collapse:
--
--   owner            the Organization Owner is included, never billed
--   bes_staff        BES fulfillment personnel never consume a customer seat,
--                    even where they hold a membership
--   archived         disabled members are free
--   portal_client    a consumer with a portal login is not an employee seat
--   external_partner a referral partner, BRM or affiliate is not the
--                    organization's employee. They reach the platform through
--                    `external_memberships`, which is a different relationship
--                    from `org_memberships`, and this is the one place that
--                    reading is decided
--
-- GHL-only users are absent by construction: they exist in GoHighLevel and
-- have no profile, no membership and no login here, so there is nothing for
-- them to consume. That is why no branch names them.
-- ---------------------------------------------------------------------------
create or replace function public.organization_seat_detail(p_org uuid)
returns table (user_id uuid, email text, full_name text, role text, counts boolean, reason text)
language sql stable security definer set search_path = public as $$
  select
    m.user_id,
    p.email::text,
    p.full_name,
    m.role::text,
    (o.owner_user_id is distinct from m.user_id
      and m.archived_at is null
      and not exists (select 1 from public.agency_memberships am where am.user_id = m.user_id)
    ) as counts,
    case
      when o.owner_user_id = m.user_id then 'owner — included in every plan'
      when m.archived_at is not null then 'archived'
      when exists (select 1 from public.agency_memberships am where am.user_id = m.user_id)
        then 'BES fulfillment personnel — never a customer seat'
      else null
    end as reason
  from public.org_memberships m
  join public.organizations o on o.id = m.organization_id
  left join public.profiles p on p.id = m.user_id
  where m.organization_id = p_org
    and (public.is_org_member(p_org) or public.is_agency_staff())
$$;
revoke all on function public.organization_seat_detail(uuid) from public, anon;
grant execute on function public.organization_seat_detail(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The count, the allowance, and what is left.
--
-- The allowance comes from the live subscription's `seats` — the number
-- actually agreed — and falls back to the plan's `seats_included` for an
-- organization still on a trial. An organization with neither has NO allowance
-- to enforce, and that is reported as `null` rather than as zero: a capacity
-- nobody bought cannot be exceeded, and treating it as zero would lock out
-- every organization that has not subscribed yet.
--
-- Pending invitations count. A seat promised to somebody who has not clicked
-- the link yet is still spoken for, and not counting it is how an organization
-- invites twelve people into ten seats.
-- ---------------------------------------------------------------------------
/*
 * A NEW name, because `organization_seat_usage(uuid)` already exists returning
 * a plain integer and Postgres will not change a function's return type in
 * place. That one stays — it is redefined below to read this same detail
 * function, so the two can never disagree.
 */
create or replace function public.organization_seat_summary(p_org uuid)
returns table (
  seats_used integer,
  pending_invitations integer,
  seats_committed integer,
  seats_included integer,
  seats_available integer,
  over_capacity boolean,
  source text
) language sql stable security definer set search_path = public as $$
  with used as (
    select count(*)::int n from public.organization_seat_detail(p_org) d where d.counts
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
  where public.is_org_member(p_org) or public.is_agency_staff()
$$;
revoke all on function public.organization_seat_summary(uuid) from public, anon;
grant execute on function public.organization_seat_summary(uuid) to authenticated;

/*
 * The original integer form, rewritten to read the SAME detail function.
 *
 * It already implemented two of the six rules — owner free, BES staff free —
 * and silently missed archived members, portal consumers and external
 * partners. Two counts of the same thing is how a screen ends up disagreeing
 * with a refusal, so there is now one, and this is a view of it.
 */
create or replace function public.organization_seat_usage(p_org uuid)
returns integer language sql stable security definer set search_path = public as $$
  select case when public.is_org_member(p_org) or public.is_manager_of(public.org_agency(p_org))
              then (select count(*)::int from public.organization_seat_detail(p_org) d where d.counts)
         end
$$;
revoke all on function public.organization_seat_usage(uuid) from public, anon;
grant execute on function public.organization_seat_usage(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Enforcement, reading THE SAME function.
--
-- Not a second copy of the rules. If the count is wrong the screen and the
-- refusal are wrong together, which is discoverable — whereas two definitions
-- that drift apart produce a screen that says nine of ten while the tenth
-- invitation is refused, and nobody can tell which is lying.
--
-- BES staff are exempt from the refusal as well as from the count: BES adding
-- its own person to a customer's workspace must not be blocked by the
-- customer's seat allowance, because that person is not consuming one.
-- ---------------------------------------------------------------------------
create or replace function public.assert_seat_available(p_org uuid, p_for_user uuid default null)
returns void language plpgsql stable security definer set search_path = public as $$
declare u record;
begin
  if p_org is null then return; end if;
  -- Somebody who would not consume a seat cannot be refused one.
  if p_for_user is not null and (
       exists (select 1 from public.agency_memberships am where am.user_id = p_for_user)
       or exists (select 1 from public.organizations o where o.id = p_org and o.owner_user_id = p_for_user)
     ) then
    return;
  end if;
  select * into u from public.organization_seat_summary(p_org);
  if u.seats_included is null then return; end if;   -- nothing bought, nothing to exceed
  if u.seats_committed >= u.seats_included then
    raise exception 'This organization has used all % of its seats. Archive a member or add seats to the plan.', u.seats_included
      using errcode = '22023';
  end if;
end $$;
revoke all on function public.assert_seat_available(uuid, uuid) from public, anon;
grant execute on function public.assert_seat_available(uuid, uuid) to authenticated;
