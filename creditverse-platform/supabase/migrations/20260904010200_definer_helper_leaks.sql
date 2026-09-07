-- 0124 — three cross-tenant leaks, all the same mistake.
--
-- Found by a structural check written for exactly this: an INVOKER helper
-- whose correctness depends on RLS filtering a row does NOT keep working when
-- it is called from inside a SECURITY DEFINER function. It runs as the
-- definer, RLS is bypassed, and it silently returns true for everything.
--
-- The check enumerates INVOKER functions in `public` that select from a public
-- table and never read `auth.uid()`, then looks for DEFINER functions that
-- call them. It found three, and all three were real.
--
-- ---------------------------------------------------------------------------
-- 1. `client_birthdays(p_org)` — a cross-tenant read of client names and dates
--    of birth.
--
--    It is DEFINER, it is granted to `authenticated`, and its only filters
--    were `c.organization_id = p_org` — with p_org supplied by the CALLER —
--    and `credit_client_visible(c.id)`, which is the no-op described above.
--    A member of one organization could ask for another organization's
--    birthdays by passing its id, which is precisely the "never trust an
--    organization_id supplied by the frontend as proof of access" rule.
-- ---------------------------------------------------------------------------
create or replace function public.client_birthdays(p_org uuid, p_within_days integer default 14)
returns table (client_id uuid, name text, birth_month smallint, birth_day smallint, days_away integer)
language sql stable security definer set search_path = public as $$
  with people as (
    select c.id, coalesce(nullif(c.preferred_name, ''), c.name) as name,
           extract(month from c.date_of_birth)::smallint as bm,
           extract(day from c.date_of_birth)::smallint as bd
    from public.fulfillment_clients c
    where c.organization_id = p_org and c.date_of_birth is not null
      /*
       * Both branches are SECURITY DEFINER predicates that compute from
       * auth.uid(), so they still answer for the CALLER inside this DEFINER
       * function — which is the property `credit_client_visible` did not have.
       * The organization branch also honours `assigned_only`, so a member who
       * may see only their own clients sees only their own birthdays.
       */
      and (
        public.org_scope_allows(c.organization_id, c.assigned_agent_id)
        or (public.bes_may_fulfil(c.organization_id, c.outsourcing_group_id, 'creditops')
            and public.in_scope(c.agency_id, 'creditops', c.team_id, c.assigned_agent_id, c.created_by))
      )
  ), dated as (
    select id, name, bm, bd,
           case
             when make_date(extract(year from current_date)::int, bm, least(bd, 28)) >= current_date
               then make_date(extract(year from current_date)::int, bm, least(bd, 28))
             else make_date(extract(year from current_date)::int + 1, bm, least(bd, 28))
           end as next_on
    from people
  )
  select id, name, bm, bd, (next_on - current_date)::int
  from dated
  where (next_on - current_date) <= greatest(coalesce(p_within_days, 14), 0)
  order by (next_on - current_date), name
$$;
revoke all on function public.client_birthdays(uuid, integer) from public, anon;
grant execute on function public.client_birthdays(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 2 and 3. `ai_available_credits(p_org)` and `ai_spend_today(p_org)` — another
--    organization's AI balance and daily spend, readable by any signed-in
--    user who knows an organization id.
--
--    Both are DEFINER with no membership check, and both were granted to
--    `authenticated`. They exist to be called BY `ai_reserve`, which does its
--    own gating; nothing in the application calls them directly.
--
--    The fix is to withdraw the grant rather than to add a check, because a
--    check would have to pass for the gateway too — and the gateway runs as
--    the service role with no `auth.uid()`, so any membership test would
--    either refuse the gateway or have to carve out an exception that is
--    itself a hole. A DEFINER function keeps its own owner's rights when it is
--    called from another DEFINER function, so `ai_reserve` is unaffected.
-- ---------------------------------------------------------------------------
revoke execute on function public.ai_available_credits(uuid) from authenticated;
revoke execute on function public.ai_spend_today(uuid) from authenticated;

comment on function public.ai_available_credits(uuid) is
  'INTERNAL. Called by ai_reserve, which does the gating. Not granted to authenticated: it takes an organization id and would otherwise report any organization''s balance to anyone (0124).';
comment on function public.ai_spend_today(uuid) is
  'INTERNAL. Called by ai_reserve. Not granted to authenticated, for the same reason as ai_available_credits (0124).';
