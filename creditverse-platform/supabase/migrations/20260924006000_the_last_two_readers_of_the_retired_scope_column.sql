-- The last two functions reading `agency_memberships.scope`.
--
-- Phase 3 stopped authorization reading `scope`, `scope_division` and
-- `scope_department_id`; Phase 4 drops them. The contract probe guards the gap
-- and had two left:
--
--   may_set_agency_policy        or (m.scope = 'agency' and agency_can('ops.manage'))
--   creditops_alert_uncovered    and m.scope::text = 'agency'
--
-- The second is mine, written yesterday — a straight relapse into a column the
-- probe already forbids, in a function added after the rule existed.
--
-- ── NOBODY GAINS OR LOSES ANYTHING ────────────────────────────────────────
--
-- Checked against the live table before changing either: every active member
-- holding `scope = 'agency'` is already `agency_admin` — Tech Support Team,
-- Bryan, Aaron, Dee, Rowell. The thirteen agents all hold `assigned`. So the
-- deprecated branch admits nobody the role branch does not, and the guard
-- below refuses the migration if that stops being true while it runs.
--
-- ── WHAT REPLACES IT, AND WHAT DELIBERATELY DOES NOT ──────────────────────
--
-- `role in ('agency_owner','agency_admin')`, which is what rule 20b means by
-- an executive: company-wide authority comes from the role, never from
-- management capability, which a division manager also holds.
--
-- What is NOT done here: wiring the agency-wide management SEATS
-- (managing_partner, executive_assistant) into `may_set_agency_policy`. That
-- would be a new grant path, and today it would change nothing anyway because
-- Bryan is already an admin. Whether a managing partner who is not an
-- administrator may set agency policy is Dee's decision about authority, not
-- a detail of retiring a column.
--
-- Cost impact: no material increase.

begin;

/* Before: the deprecated branch must be adding nobody. If somebody has been
   given agency scope without the admin role since this was written, stop —
   the rewrite would quietly take their access away. */
do $$
declare v_extra text;
begin
  select string_agg(p.full_name, ', ') into v_extra
    from public.agency_memberships m
    join public.profiles p on p.id = m.user_id
   where m.status = 'active'
     and m.scope::text = 'agency'
     and m.role::text not in ('agency_owner', 'agency_admin');
  if v_extra is not null then
    raise exception
      'these hold agency scope WITHOUT the admin role and would lose access: %', v_extra;
  end if;
end $$;

do $$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.may_set_agency_policy(uuid)'::regprocedure);
  v_new := replace(v_def,
    E'         /* Or somebody explicitly granted management AT agency scope. A\n            division-scoped manager is deliberately excluded. */\n         or (m.scope = ''agency'' and public.agency_can(''ops.manage''))\n',
    E'         /* Nothing else. Company-wide authority is the role; `ops.manage`\n            is held by division managers too, and agency scope used to be a\n            column that is being dropped. A non-admin who should set agency\n            policy is a decision about authority, made deliberately. */\n');
  if v_new = v_def then
    raise exception 'may_set_agency_policy did not contain the expected branch';
  end if;
  execute v_new;

  v_def := pg_get_functiondef('public.creditops_alert_uncovered()'::regprocedure);
  v_new := replace(v_def,
    'and m.scope::text = ''agency''',
    'and m.role::text in (''agency_owner'', ''agency_admin'')');
  if v_new = v_def then
    raise exception 'creditops_alert_uncovered did not contain the expected branch';
  end if;
  execute v_new;
end $$;

/* After: no function in `public` reads a retired scope column for a decision,
   and the two rewritten ones still resolve. */
do $$
declare v_bad text;
begin
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosrc ~ '(scope_division|scope_department_id|am\.scope[^_]|m\.scope[^_])'
     and p.prosrc !~ 'a column nobody maintains'
     and p.proname <> 'access_profile_for_user';
  if v_bad is not null then
    raise exception 'still reading a retired scope column: %', v_bad;
  end if;

  perform public.may_set_agency_policy(
    (select id from public.agencies order by created_at limit 1));
end $$;

commit;
