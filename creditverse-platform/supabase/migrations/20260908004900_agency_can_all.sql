----------------------------------------------------------------------
-- 0226  Every capability in one answer.
--
-- The workspace resolved capabilities by calling `agency_can` once per key.
-- That is twenty-seven round trips before a menu can decide what to render,
-- on every session, and the count grows with every capability added — the
-- request pattern rule 14 exists to forbid, hiding behind the fact that the
-- calls were issued in parallel. Parallel is not free: it is twenty-seven
-- connections, twenty-seven policy evaluations and twenty-seven responses.
--
-- One call now returns the whole map. The rule it applies is IDENTICAL to
-- `agency_can` — same precedence, same defaults, same membership — because a
-- second implementation of an authorization rule is a second answer waiting
-- to disagree with the first. `agency_can` remains the authority for a single
-- key and is untouched; this reads the same three tables in the same order.
--
-- This is presentation input. Nothing authorizes on the result: every table
-- keeps its own policy, and a screen that renders a control it should not is
-- still refused by the database.
----------------------------------------------------------------------

/* The single-key resolution, factored out so `agency_can_all` cannot drift
   from `agency_can`. Both call this; neither restates the precedence. */
create or replace function public.resolve_agency_capability(p_key text)
returns boolean
language sql stable security definer set search_path = public as $function$
  select coalesce((
    select case
      when m.role in ('agency_owner', 'agency_admin') then true
      else coalesce(
        (select amp.allowed from public.agency_member_permissions amp
          where amp.membership_id = m.id and amp.key = p_key),
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

create or replace function public.agency_can_all()
returns jsonb
language sql stable security definer set search_path = public as $function$
  select coalesce(
    jsonb_object_agg(k.key, public.resolve_agency_capability(k.key)),
    '{}'::jsonb)
  from public.permission_keys k
$function$;

create or replace function public.agency_can(p_key text)
returns boolean
language sql stable security definer set search_path = public as $function$
  select public.resolve_agency_capability(p_key)
$function$;

revoke execute on function public.resolve_agency_capability(text) from public, anon;
revoke execute on function public.agency_can_all() from public, anon;
grant execute on function public.agency_can_all() to authenticated;
grant execute on function public.resolve_agency_capability(text) to authenticated;

comment on function public.agency_can_all() is
  'Every capability the caller holds, as {key: boolean}. One round trip instead of one per key. Same rule as agency_can — both call resolve_agency_capability — and, like it, this decides what a screen SHOWS. It authorizes nothing.';
