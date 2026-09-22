-- The reporting views bypassed RLS. Every tenant's facts were readable by any
-- signed-in user.
--
-- Found by the full security gate, 2026-09-22. Phase 28 asks "an organization
-- member sees no facts of another organization" and read 5. The 5 was an
-- undercount of the actual problem: that probe only counts rows carrying a
-- DIFFERENT non-null organization_id, and most facts carry none. Measured
-- directly, a plain CreditOps agent — bes.credit, assigned scope, no
-- management seat — selected ALL 225 rows of `report_facts`: every
-- organization's production, time entries, status changes and letters, plus
-- BES's own internal work. A Lakeside org admin saw Northgate's, Cedar
-- Financial's and Harbor Capital's.
--
-- CAUSE: `report_facts` and `report_facts_scoped` are views owned by postgres
-- and were created WITHOUT `security_invoker`. A view without it runs with its
-- OWNER's rights, so the row policies on production_logs, time_entries,
-- activity_events and dispute_letters never ran. The intent was always the
-- opposite — phase 28's own heading reads "facts and pivots follow the
-- caller's RLS". The views simply never enforced it.
--
-- `report_pivot()` is SECURITY INVOKER, so it inherits the fix rather than
-- routing around it, and nothing else reads these views.
--
-- ── WHAT WAS CHECKED AND DELIBERATELY NOT CHANGED ─────────────────────────
--
-- Four other views also run as their owner. Three are intentional: they are
-- definer views whose gate is written INSIDE them, which is a different and
-- valid design —
--   payslips_internal                  where reads_bes_cost(agency_id)
--   compensation_arrangements_internal where reads_bes_cost(...) or managing_partner_id = auth.uid()
--   managing_partner_settlements       where reads_bes_cost(...) or managing_partner_id = auth.uid()
-- They hold pay rates, payslips and settlements, they are empty today, and
-- they are NOT touched here: changing them without re-deriving those gates
-- would be an unreviewed change to money access (rule 22, security ordering).
-- The fourth, `fixture_login_state`, is not granted to authenticated at all.
--
-- These two views carry no such internal gate — `report_facts` has no WHERE
-- clause about the caller at all — so for them the owner's rights ARE the
-- whole authorization, and there is none.
--
-- Cost impact: no material increase. RLS now runs on a read that was
-- previously unfiltered, which narrows the rows scanned rather than widening
-- them.

alter view public.report_facts        set (security_invoker = true);
alter view public.report_facts_scoped set (security_invoker = true);

comment on view public.report_facts is
  'Every reportable event as one shape. SECURITY INVOKER: the caller''s own row '
  'policies on production_logs, time_entries, activity_events and dispute_letters '
  'decide what it returns. It carries no tenant filter of its own and must never '
  'be made owner-rights again (2026-09-22).';

/* Proves the fix rather than assuming it: a definer view would return the same
   count to everyone, so if these two are still owner-rights the setting did
   not take and this migration must not commit. */
do $$
declare v_invoker int;
begin
  select count(*) into v_invoker
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('report_facts', 'report_facts_scoped')
     and coalesce(array_to_string(c.reloptions, ','), '') like '%security_invoker=%';
  if v_invoker <> 2 then
    raise exception 'expected both reporting views to be security_invoker, found %', v_invoker;
  end if;
end $$;
