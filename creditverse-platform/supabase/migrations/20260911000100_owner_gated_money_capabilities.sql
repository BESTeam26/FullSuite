-- =============================================================================
-- Money is the owner's, unless the owner hands it over (Dee, 2026-09-11).
--
-- "I want FINANCE hidden to everyone aside from me. If I am to show that, I
--  should have access to TURN that on to the agent, example my billing
--  specialist. Bryan is seeing my finance now, and all agency admin — I don't
--  want that."
--
-- WHAT WAS WRONG
--
-- `resolve_agency_capability` opened with:
--
--     when m.role in ('agency_owner', 'agency_admin') then true
--
-- so an agency admin resolved TRUE for every capability there is, finance and
-- payroll included, and no override could take it away. All four real BES
-- staff are admins, so all four could open Finance. The RLS on the money
-- tables is sound — `payslips`, `payroll_cutoffs`, `member_pay_rates` and the
-- rest all ask `agency_can(...)` — which is precisely why fixing the resolver
-- fixes the DATA and not merely the menu (rule 1).
--
-- THE RULE NOW
--
-- A capability may be marked OWNER-GATED. For those keys the admin shortcut
-- does not apply:
--
--     allowed  =  the person is the agency owner
--              OR an explicit grant exists for that person
--
-- Profile and role defaults are ignored for a gated key — they are all `false`
-- for these keys anyway, and a default that could quietly re-open the books is
-- not a default anybody should have to audit.
--
-- Owner-gated is DATA, a column on `permission_keys`, not a hardcoded list in
-- a function. Gating another capability later is one UPDATE, not a migration
-- that rewrites the resolver (rule 17's "modules are data, not code
-- branches").
--
-- SCOPE, DELIBERATELY NARROW
--
-- The five keys behind the Finance page and payroll — the agency's OWN money.
-- Partner billing (`partners.financials.*`, `partners.invoices.*`,
-- `partners.payments.record`, `partners.revenue.record`) is NOT gated here: it
-- lives on the partner record's Billing & Revenue tab, which operations staff
-- may be using in the live pilot, and silently cutting it would break a real
-- workflow to answer a question Dee asked about Finance. Gating those is one
-- UPDATE per key whenever she says so.
-- =============================================================================

alter table public.permission_keys
  add column if not exists owner_gated boolean not null default false;

comment on column public.permission_keys.owner_gated is
  'When true, being an agency admin does NOT confer this capability: only the agency owner holds it, or somebody the owner has explicitly granted it. Used for money (Dee, 2026-09-11).';

update public.permission_keys
   set owner_gated = true
 where key in ('finance.dashboard.view', 'expenses.view', 'expenses.manage',
               'payroll.view', 'payroll.manage');

-- ── The resolver ──────────────────────────────────────────────────────────
/**
 * Three changes from the previous body, and nothing else:
 *
 *   1. an owner-gated key is decided before the admin shortcut is reached;
 *   2. `is_owner` is what confers a gated key, not the admin role;
 *   3. the membership must be ACTIVE — the old body never checked, and while
 *      every policy pairs this with `is_staff_of()` (which does check, since
 *      0297), a capability resolver that answers TRUE for a deactivated person
 *      is a landmine for the next caller that forgets the pairing.
 */
create or replace function public.resolve_agency_capability(p_key text)
returns boolean
language sql stable security definer set search_path = public as $function$
  select coalesce((
    select case
      when m.status <> 'active' then false
      when exists (select 1 from public.permission_keys pk
                    where pk.key = p_key and pk.owner_gated)
        then coalesce(m.is_owner, false)
             or coalesce((select amp.allowed from public.agency_member_permissions amp
                           where amp.membership_id = m.id and amp.key = p_key), false)
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

comment on function public.resolve_agency_capability(text) is
  'THE capability answer for the calling agency member. Owner-gated keys (money) ignore the admin shortcut and require ownership or an explicit grant; everything else resolves admin > personal exception > access profile > agency role default > platform default > denied.';

-- ── The same rule, with its reason, for the Access screen ─────────────────
create or replace function public.agency_can_for_user(p_user uuid, p_key text)
returns table(allowed boolean, source text)
language sql stable security definer set search_path = public as $function$
  select
    case
      when m.status <> 'active' then false
      when gated.yes then coalesce(m.is_owner, false) or coalesce(amp.allowed, false)
      when m.role in ('agency_owner', 'agency_admin') then true
      else coalesce(amp.allowed, app.allowed, arp_agency.allowed, arp_default.allowed, false)
    end,
    case
      when m.status <> 'active' then 'membership is ' || m.status
      when gated.yes and coalesce(m.is_owner, false) then 'held by the agency owner'
      when gated.yes and amp.allowed then 'granted to this person by the owner'
      when gated.yes and amp.allowed is not null then 'denied for this person'
      when gated.yes then 'owner only — not granted'
      when m.role in ('agency_owner', 'agency_admin') then 'held by role: ' || m.role::text
      when amp.allowed is not null then
        case when amp.allowed then 'granted to this person' else 'denied for this person' end
      when app.allowed is not null then
        case when app.allowed then 'access profile default' else 'withheld by the access profile' end
      when arp_agency.allowed is not null then 'role default for this agency'
      when arp_default.allowed is not null then 'role default'
      else 'no rule — denied'
    end
    from public.agency_memberships m
    cross join lateral (
      select exists (select 1 from public.permission_keys pk
                      where pk.key = p_key and pk.owner_gated) as yes
    ) gated
    left join public.agency_member_permissions amp
      on amp.membership_id = m.id and amp.key = p_key
    left join public.agency_profile_permissions app
      on app.profile = m.access_profile and app.key = p_key
    left join public.agency_role_permissions arp_agency
      on arp_agency.role = m.role and arp_agency.agency_id = m.agency_id and arp_agency.key = p_key
    left join public.agency_role_permissions arp_default
      on arp_default.role = m.role and arp_default.agency_id is null and arp_default.key = p_key
   where m.user_id = p_user
   limit 1
$function$;

-- ── Only the owner may hand money out ─────────────────────────────────────
/**
 * Granting is itself a privileged act. `set_agency_permission` let any admin
 * write any override; with money now owner-gated, an admin could otherwise
 * simply grant themselves the key they were just denied — a gate with its own
 * handle on the inside.
 */
create or replace function public.assert_may_grant_capability(p_agency uuid, p_key text)
returns void
language plpgsql stable security definer set search_path = public as $function$
begin
  if exists (select 1 from public.permission_keys pk where pk.key = p_key and pk.owner_gated)
     and not exists (select 1 from public.agency_memberships m
                      where m.user_id = auth.uid() and m.agency_id = p_agency
                        and m.status = 'active' and coalesce(m.is_owner, false)) then
    raise exception 'Only the agency owner can grant or withdraw %', p_key
      using errcode = '42501';
  end if;
end $function$;
revoke execute on function public.assert_may_grant_capability(uuid, text) from public, anon;
grant execute on function public.assert_may_grant_capability(uuid, text) to authenticated;

-- ── Granting and withdrawing a gated key ──────────────────────────────────
/**
 * Two adjustments, both forced by the new rule:
 *
 *   1. The old body REFUSED any override on an admin, on the reasoning that
 *      "an administrator holds every capability through their role, so an
 *      override would be a switch that does nothing." That reasoning no longer
 *      holds for a gated key — an admin does NOT hold money through their
 *      role, and an override on them is exactly the switch Dee needs. Every
 *      real BES staff member is an admin, so without this the feature would
 *      be unusable by the only people it is for.
 *   2. Only the owner may move a gated key, or an admin could simply grant
 *      themselves what they were just denied.
 */
create or replace function public.set_agency_permission(p_membership uuid, p_key text, p_allowed boolean, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $function$
declare
  v_agency uuid; v_role public.agency_role; v_gated boolean;
begin
  select m.agency_id, m.role into v_agency, v_role
    from public.agency_memberships m where m.id = p_membership;
  if v_agency is null then
    raise exception 'No such membership' using errcode = '22023';
  end if;
  if not public.is_admin_of(v_agency) then
    raise exception 'Only an agency owner or administrator can change access'
      using errcode = '42501';
  end if;
  if not exists (select 1 from public.permission_keys where key = p_key) then
    raise exception 'No such capability: %', p_key using errcode = '22023';
  end if;
  select pk.owner_gated into v_gated from public.permission_keys pk where pk.key = p_key;

  /* Money moves only by the owner's hand. */
  perform public.assert_may_grant_capability(v_agency, p_key);

  if not v_gated and v_role in ('agency_owner', 'agency_admin') then
    raise exception 'An owner or administrator holds every capability through their role. An override here would be a switch that does nothing.'
      using errcode = '22023';
  end if;

  insert into public.agency_member_permissions (membership_id, key, allowed, reason, set_by, set_at)
  values (p_membership, p_key, p_allowed, p_reason, auth.uid(), now())
  on conflict (membership_id, key) do update
    set allowed = excluded.allowed,
        reason  = excluded.reason,
        set_by  = excluded.set_by,
        set_at  = excluded.set_at;

  perform public.log_audit(
    'agency_permission.set', 'agency_membership', p_membership::text,
    null::uuid, null::jsonb,
    jsonb_build_object('key', p_key, 'allowed', p_allowed, 'reason', p_reason, 'owner_gated', v_gated)
  );
end $function$;

create or replace function public.clear_agency_permission(p_membership uuid, p_key text)
returns void
language plpgsql security definer set search_path = public as $function$
declare
  v_agency uuid;
begin
  select m.agency_id into v_agency from public.agency_memberships m where m.id = p_membership;
  if v_agency is null then
    raise exception 'No such membership' using errcode = '22023';
  end if;
  if not public.is_admin_of(v_agency) then
    raise exception 'Only an agency owner or administrator can change access'
      using errcode = '42501';
  end if;
  /* Withdrawing money access is as much the owner's act as granting it. */
  perform public.assert_may_grant_capability(v_agency, p_key);

  delete from public.agency_member_permissions
   where membership_id = p_membership and key = p_key;

  perform public.log_audit(
    'agency_permission.cleared', 'agency_membership', p_membership::text,
    null::uuid, null::jsonb, jsonb_build_object('key', p_key)
  );
end $function$;
