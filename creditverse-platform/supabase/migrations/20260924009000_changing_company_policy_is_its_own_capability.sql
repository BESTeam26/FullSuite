-- Changing company policy is its own capability, not a side effect of a title.
--
-- Dee, 2026-09-24, on whether the agency-wide management seats should have
-- carried policy authority:
--
--   "Owner/COO visibility can be organization-wide operationally. Agency
--    policy mutation should require an explicit policy-management capability.
--    Managing Partner should not automatically gain agency policy authority
--    just because they have broad HR/payroll access. Agency Admin can keep it
--    if that's currently the intended authority model. That keeps 'can
--    see/manage people' separate from 'can change company policy'."
--
-- `may_set_agency_policy(agency)` gates UPDATE on `attendance_policy` and
-- `performance_policy` — the attendance rules everybody is scored against and
-- the 35/35/20/10 performance weighting. Until now it asked one question:
-- are you an agency_admin. There was no capability to grant, to withhold, or
-- to see on the permissions screen, and nothing separated "runs the company's
-- people" from "rewrites what they are measured by".
--
-- ── WHAT CHANGES, AND FOR WHOM ────────────────────────────────────────────
--
-- A new key, `agency.policy.manage`, with `admin_auto = false` — deliberately
-- NOT the admin short-circuit. Admins hold it through an explicit role grant
-- instead, which means:
--
--   · the same five people can do the same things today (nothing is taken
--     away, and the guard below refuses this migration if that is not true)
--   · it now APPEARS as a capability, so it can be granted to somebody who
--     is not an administrator, or withheld from one who is
--   · a management seat — managing partner, executive assistant, division
--     manager — grants it to nobody. A seat is scope over people; this is
--     authority over the rules. Bryan keeps it because he is an agency admin,
--     not because he is the managing partner.
--
-- Cost impact: no material increase.

begin;

insert into public.permission_keys (key, module, label, description, security_relevant, admin_auto, owner_gated, sort)
values ('agency.policy.manage', 'Agency',
        'Change company policy',
        'Edit the attendance rules and the performance weighting everyone is measured against. '
        'Separate from managing people: a division manager or managing partner does not hold this '
        'unless it is granted.',
        true, false, false, 90)
on conflict (key) do update
  set label = excluded.label, description = excluded.description,
      security_relevant = true, admin_auto = false, owner_gated = false;

/* The administrators keep it — as a grant that is visible and revocable,
   rather than as a rule buried in a function. agency_id null is the default
   for every agency. */
insert into public.agency_role_permissions (agency_id, role, key, allowed)
values (null, 'agency_admin', 'agency.policy.manage', true)
on conflict (agency_id, role, key) do update set allowed = true;

do $$
declare
  v_def text := pg_get_functiondef('public.may_set_agency_policy(uuid)'::regprocedure);
  v_new text;
begin
  if position('m.role = ''agency_admin''' in v_def) = 0 then
    raise exception 'may_set_agency_policy is not the shape this migration expects';
  end if;

  execute $fn$
    create or replace function public.may_set_agency_policy(p_agency uuid)
    returns boolean
    language sql
    stable
    security definer
    set search_path to 'public'
    as $body$
      /* Membership of THIS agency, and the explicit capability. The role is
         no longer asked directly: administrators hold
         `agency.policy.manage` through a role grant, which can be given to
         somebody else or taken from one of them without editing a function
         (Dee, 2026-09-24). Management seats grant it to nobody — scope over
         people is not authority over the rules. */
      select exists (
        select 1 from public.agency_memberships m
         where m.user_id = auth.uid()
           and m.agency_id = p_agency
           and m.status = 'active'
      ) and public.agency_can('agency.policy.manage')
    $body$;
  $fn$;
end $$;

/* Nobody gained or lost the ability to change policy. Asked of every active
   real member, as themselves, against the live grant chain — not reasoned
   about. */
do $$
declare
  v_agency uuid;
  r record;
  v_before boolean;
  v_after boolean;
  v_changed text := '';
begin
  select id into v_agency from public.agencies order by created_at limit 1;

  for r in
    select m.user_id, p.full_name, m.role::text as role, coalesce(m.is_owner, false) as owner
      from public.agency_memberships m
      join public.profiles p on p.id = m.user_id
     where m.status = 'active' and m.agency_id = v_agency
       and coalesce(p.is_fixture, false) = false
  loop
    /* What the OLD rule said: the admin role alone. */
    v_before := r.role in ('agency_owner', 'agency_admin');

    perform set_config('request.jwt.claims',
      json_build_object('sub', r.user_id, 'role', 'authenticated')::text, true);
    v_after := public.may_set_agency_policy(v_agency);

    if v_before is distinct from v_after then
      v_changed := v_changed || r.full_name || ' (' || r.role || ': '
                || v_before || ' → ' || v_after || '); ';
    end if;
  end loop;
  perform set_config('request.jwt.claims', null, true);

  if v_changed <> '' then
    raise exception 'policy authority changed for: %', v_changed;
  end if;
end $$;

commit;
