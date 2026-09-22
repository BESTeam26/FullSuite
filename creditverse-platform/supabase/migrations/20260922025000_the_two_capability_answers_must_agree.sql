-- `agency_can_for_user` ignored `admin_auto`, so it answered differently from
-- `agency_can` about the same person and the same capability.
--
-- Found by phase 63's agreement probes, which exist precisely to catch the
-- parameterized copy drifting from the real one. They caught it:
--
--   agency_can_for_user(bes.owner, 'creditops.work.manage') → true
--   agency_can('creditops.work.manage') as bes.owner        → false
--
-- `resolve_agency_capability`, behind `agency_can`, short-circuits for an
-- owner or admin ONLY where the key opts in:
--
--   when m.role in ('agency_owner','agency_admin')
--        and coalesce(pk.admin_auto, true) then true
--
-- `agency_can_for_user` carried the bare `when m.role in (...) then true`. The
-- two agreed by accident for as long as every key had admin_auto = true.
-- `creditops.work.manage` (20260922002000) is the first key to opt OUT — Dee's
-- ladder: being an admin is not CreditOps work authority — so the drift only
-- became visible today.
--
-- ── WHAT THIS DID AND DID NOT AFFECT ──────────────────────────────────────
--
-- No row policy reads `agency_can_for_user`; the two callers are
-- `access_capabilities_for_user` (the Access panel's "what can this person
-- do") and `announcement_notifiable` (for ops.manage, which is admin_auto and
-- therefore unaffected). So no data was reachable that should not have been.
--
-- What it DID produce is a screen that disagrees with the database: the Access
-- panel would show an admin holding `creditops.work.manage` while every writer
-- refused them. A control that reports an authority the database denies is the
-- dishonest kind (rule 12), and it is also how somebody concludes the
-- permission system is broken when it is working.
--
-- The `source` text gets the same treatment, so the explanation beside the
-- answer cannot say "held by role" about a key no role confers.
--
-- Cost impact: no material increase.

do $$
declare
  v_def text := pg_get_functiondef('public.agency_can_for_user(uuid, text)'::regprocedure);
  v_old_allowed text := $q$when m.role in ('agency_owner', 'agency_admin') then true$q$;
  v_new_allowed text := $q$when m.role in ('agency_owner', 'agency_admin')
           and coalesce((select pk.admin_auto from public.permission_keys pk where pk.key = p_key), true) then true$q$;
  v_old_source text := $q$when m.role in ('agency_owner', 'agency_admin') then 'held by role: ' || m.role::text$q$;
  v_new_source text := $q$when m.role in ('agency_owner', 'agency_admin')
           and coalesce((select pk.admin_auto from public.permission_keys pk where pk.key = p_key), true)
        then 'held by role: ' || m.role::text$q$;
begin
  if position(v_old_allowed in v_def) = 0 or position(v_old_source in v_def) = 0 then
    raise exception 'agency_can_for_user no longer short-circuits on role as expected — read it before replacing it';
  end if;
  v_def := replace(v_def, v_old_source, v_new_source);   -- the longer match first
  v_def := replace(v_def, v_old_allowed, v_new_allowed);
  execute v_def;
end $$;

/* The agreement itself, asserted rather than assumed: for every active member
   and every key, the two answers must be the same. This is what phase 63
   checks per fixture; here it runs across the whole roster so a disagreement
   cannot reach production between gate runs. */
do $$
declare v_bad int;
begin
  select count(*) into v_bad
    from public.agency_memberships m
    cross join public.permission_keys k
   where m.status = 'active'
     and (select allowed from public.agency_can_for_user(m.user_id, k.key))
         is distinct from public.resolve_agency_capability_for(m.user_id, k.key);
  if v_bad > 0 then
    raise exception '% person/key pairs still disagree between the two capability answers', v_bad;
  end if;
exception
  when undefined_function then
    /* No user-parameterised form of the resolver exists; phase 63 covers the
       comparison per fixture. Not a reason to fail the migration. */
    raise notice 'skipped the roster-wide agreement check: no resolve_agency_capability_for()';
end $$;
