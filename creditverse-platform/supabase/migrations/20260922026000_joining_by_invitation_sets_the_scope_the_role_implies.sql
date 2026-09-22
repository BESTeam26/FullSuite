-- Accepting an invitation never set a scope, so the role and the reach
-- disagreed from the first login.
--
-- `default_scope_for_role(agency_role)` exists — admin and owner get 'agency',
-- everyone else 'assigned' — and NOTHING CALLED IT. It was written and never
-- wired in. `accept_agency_invitation` inserts the membership with role,
-- access_profile and status, and leaves `scope` to the column default, so
-- somebody invited as an admin arrived scoped like an agent regardless of what
-- the invitation said.
--
-- That is squarely on Dee's launch order: "reliable first-click login →
-- correct access/scope → team activation". The person signs in successfully
-- and then cannot see what their role says they should.
--
-- ── NEVER NARROWS ANYBODY ─────────────────────────────────────────────────
--
-- On a fresh membership the scope follows the role. On the idempotent
-- re-accept path it is set ONLY when the incoming role is admin or owner, and
-- only upward: an ordinary member keeps whatever scope somebody deliberately
-- gave them, because a division manager on 'division' scope is a real
-- placement (D-021) and re-clicking an invitation link must not undo it.
--
-- ── ONE EXISTING ROW IS DELIBERATELY NOT REPAIRED ─────────────────────────
--
-- aaron@blessedempireservices.com is agency_admin with is_owner = true and
-- scope = 'assigned' — owner-gated capabilities with an agent's data reach.
-- Repairing it means either widening a real person's access or removing their
-- owner flag, and which of those is correct is Dee's to say, not a migration's
-- (rule 20). Raised with her; the gate keeps failing that check until she
-- decides, which is the honest state for it to be in.
--
-- Cost impact: no material increase.

do $$
declare
  v_def text := pg_get_functiondef('public.accept_agency_invitation(uuid)'::regprocedure);
  v_old text := $q$  insert into public.agency_memberships (user_id, agency_id, role, access_profile, status)
  values (auth.uid(), i.agency_id, coalesce(i.agency_role, 'agency_user'), i.access_profile, 'active')
  on conflict (user_id, agency_id) do update
    set role = excluded.role,
        access_profile = excluded.access_profile,
        status = 'active',$q$;
  v_new text := $q$  insert into public.agency_memberships (user_id, agency_id, role, access_profile, status, scope)
  values (auth.uid(), i.agency_id, coalesce(i.agency_role, 'agency_user'), i.access_profile, 'active',
          public.default_scope_for_role(coalesce(i.agency_role, 'agency_user')))
  on conflict (user_id, agency_id) do update
    set role = excluded.role,
        access_profile = excluded.access_profile,
        /* Upward only. An admin must not be left on an agent's reach; anybody
           else keeps the scope they were deliberately given. */
        scope = case
          when excluded.role in ('agency_admin', 'agency_owner') then 'agency'::public.access_scope
          else public.agency_memberships.scope
        end,
        status = 'active',$q$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'accept_agency_invitation no longer writes the membership as expected — read it before replacing it';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;

/* The wiring itself, asserted: the helper existing is not the same as the
   acceptance path calling it, and that gap is exactly what this fixes. */
do $$
begin
  if position('default_scope_for_role' in
       pg_get_functiondef('public.accept_agency_invitation(uuid)'::regprocedure)) = 0 then
    raise exception 'accept_agency_invitation still does not derive a scope from the role';
  end if;
end $$;
