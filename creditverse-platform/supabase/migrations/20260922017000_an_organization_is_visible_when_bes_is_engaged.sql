-- An Organization is operationally visible when BES is actively engaged on it.
--
-- Dee, 2026-09-22, locking the rule:
--
--   "An Organization should appear in the BES operational Organizations
--    directory only when that Organization currently has an active
--    fulfillment/service engagement with BES. Do not use `Agency Admin` as the
--    business rule. Do not use 'BES staff' as the rule. Do not infer it from
--    whether the Organization happens to have clients. Use the canonical BES
--    service/engagement relationship."
--
-- Yesterday's fix replaced `is_staff_of` with `is_admin_of`, which is exactly
-- the shortcut she is ruling out: it answers "how senior are you", not "is BES
-- working for this customer". Both gates now run, in her order:
--
--   Gate 1  Does this Organization have a live BES engagement?
--           NO  → not operationally visible, to anybody
--   Gate 2  Is THIS person authorized for that engagement?
--           NO  → hidden
--
-- Gate 1 is about the customer. Gate 2 is about the reader. An active
-- engagement is emphatically not "every BES employee can see everything
-- inside" — Gate 2 runs the same `in_scope()` every other CreditOps surface
-- runs, so an agent on an unrelated team still sees nothing.
--
-- ── DERIVED, NEVER STORED ─────────────────────────────────────────────────
--
-- Dee: "Do not create a manually maintained `has_active_fulfillment` field if
-- it duplicates existing engagement truth." So there is no boolean column and
-- no trigger keeping one in step. The state is computed from
-- `fulfillment_engagements` every time it is asked for, through
-- `engagement_is_live()` — the canonical lifecycle, unchanged: status `active`
-- and today inside the effective dates. `pending`, `paused` and `ended`
-- therefore do not qualify, which is the existing service-state model rather
-- than a new opinion about it.
--
-- ── HISTORY IS PRESERVED ──────────────────────────────────────────────────
--
-- Ending the last engagement removes an Organization from the operational
-- directory. It deletes nothing: the row, its clients, its files and its
-- engagement history all remain, and `organizations_history()` below gives
-- authorized management a way back to them without putting them in front of
-- the operational team.

/**
 * Every BES service currently live for this Organization.
 *
 * The identifier Dee asked for — "BES Fulfillment: Active" and the services
 * beneath it — as a derivation rather than a field. Empty means no active
 * fulfillment. SECURITY DEFINER because the reader is not necessarily allowed
 * to read the engagement rows themselves; the question is about the customer,
 * not about them.
 */
create or replace function public.organization_active_services(p_org uuid)
returns public.fulfillment_service[]
language sql stable security definer set search_path = public as $function$
  select coalesce(array_agg(distinct e.service order by e.service), '{}')
    from public.fulfillment_engagements e
   where e.organization_id = p_org
     and public.engagement_is_live(e.status, e.effective_from, e.effective_to)
$function$;
revoke execute on function public.organization_active_services(uuid) from public, anon;
grant execute on function public.organization_active_services(uuid) to authenticated;

/** Gate 1, on its own: is BES engaged on this customer at all? */
create or replace function public.organization_has_active_fulfillment(p_org uuid)
returns boolean
language sql stable security definer set search_path = public as $function$
  select coalesce(array_length(public.organization_active_services(p_org), 1), 0) > 0
$function$;
revoke execute on function public.organization_has_active_fulfillment(uuid) from public, anon;
grant execute on function public.organization_has_active_fulfillment(uuid) to authenticated;

/**
 * Both gates, for the caller.
 *
 * Gate 2 asks `in_scope()` about the engagement's own authorized team, which
 * is how every other BES surface decides reach: an admin or a placed manager
 * passes for all, somebody on or leading the authorized team passes for
 * theirs, and an unrelated agent passes for none.
 */
create or replace function public.bes_may_see_organization(p_org uuid)
returns boolean
language sql stable security definer set search_path = public as $function$
  select exists (
    select 1 from public.fulfillment_engagements e
     where e.organization_id = p_org
       and public.engagement_is_live(e.status, e.effective_from, e.effective_to)
       and public.is_staff_of(e.agency_id)
       and public.in_scope(e.agency_id, e.service, e.authorized_team_id, null, null)
  )
$function$;
revoke execute on function public.bes_may_see_organization(uuid) from public, anon;
grant execute on function public.bes_may_see_organization(uuid) to authenticated;

drop policy if exists organizations_select on public.organizations;

create policy organizations_select on public.organizations
  for select to authenticated
  using (
    /* An organization's own people. Their tenancy is theirs whether or not
       BES is working for them. */
    public.is_org_member(id)
    /* BES: both gates. */
    or public.bes_may_see_organization(id)
  );

/**
 * Organizations BES is no longer engaged on, for authorized management.
 *
 * Dee: "Preserve the Organization and its history. Do not delete it.
 * Authorized management can access historical/inactive Organizations through
 * an appropriate history/archive view if needed." This is that door, and it
 * is deliberately a separate call rather than a widening of the directory —
 * an operational list that quietly includes former customers is the problem
 * the rule exists to stop.
 */
create or replace function public.organizations_history()
returns table (id uuid, name text, last_service text, last_status text, ended_on date)
language sql stable security definer set search_path = public as $function$
  select o.id, o.name,
         (select e.service::text from public.fulfillment_engagements e
           where e.organization_id = o.id order by coalesce(e.effective_to, e.effective_from) desc limit 1),
         (select e.status::text from public.fulfillment_engagements e
           where e.organization_id = o.id order by coalesce(e.effective_to, e.effective_from) desc limit 1),
         (select max(e.effective_to) from public.fulfillment_engagements e
           where e.organization_id = o.id)
    from public.organizations o
   where public.is_admin_of(o.agency_id)
     and not public.organization_has_active_fulfillment(o.id)
   order by o.name
$function$;
revoke execute on function public.organizations_history() from public, anon;
grant execute on function public.organizations_history() to authenticated;

comment on table public.organizations is
  'Customer tenancies. Operationally visible to BES only while a live fulfillment engagement exists (Gate 1) AND the reader is in scope for it (Gate 2) — never because of staff status or seniority (Dee, 2026-09-22). Inactive ones are preserved and reachable through organizations_history().';
