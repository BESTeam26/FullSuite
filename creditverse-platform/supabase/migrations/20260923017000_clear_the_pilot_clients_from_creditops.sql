-- The CreditOps list is cleared of pilot data, ready for the real import.
--
-- Dee, 2026-09-23: "All files now in CreditOps are test, let's delete them so I
-- can bring the actual client list from clickup now."
--
-- Eleven clients, created 7–12 September while the workspace was being built:
-- Test, Jane Smith, Kaori Test, and eight with realistic names entered during
-- the pilot. With them go 35 department rows, 238 activity entries and 26
-- production logs.
--
-- ── WHAT IS DELIBERATELY NOT DELETED ──────────────────────────────────────
--
-- The eight `[TEST]` fixtures — Alice Archer, Brian Blake, Cleo Chan, Dana
-- Doyle, Evan Ellis, Fern Fowler, Gil Grant, Ivan Ironwood. They are not
-- pilot data that looks like tests; they are what the security matrix RUNS
-- ON. All 1681 checks assert against them by name, and Dee's own instruction
-- is about the list she sees, which excludes fixtures. Deleting them would
-- take the security suite with them.
--
-- The whole migration refuses to commit if the count of fixtures changes.
--
-- ── PRODUCTION LOGS BLOCK THIS BY DESIGN ──────────────────────────────────
--
-- `production_logs.client_id` is ON DELETE RESTRICT, deliberately: production
-- is a performance and payroll record and must not vanish because somebody
-- removed a client. So it is a decision, not an obstacle to route around, and
-- the 26 rows were checked before removing them: 24 are Dee's own logging and
-- one each belongs to wecare and lordvrye. NO AGENT'S REAL PRODUCTION IS IN
-- HERE. Had a real agent's work been attached, this would have stopped and
-- asked.
--
-- Past EOD figures that counted those 26 units will change, because
-- `eod_day_activity` derives from production rather than storing it. That is
-- correct — the work did not happen — but it is a real consequence and Dee is
-- told rather than left to notice.
--
-- Everything was exported first and handed to Dee. It is not in this
-- repository: it lists client names, emails and phone numbers.
--
-- Cost impact: no material increase.

begin;

do $$
declare
  v_fixtures_before int;
  v_fixtures_after  int;
  v_clients int;
  v_real_production int;
begin
  select count(*) into v_fixtures_before from public.fulfillment_clients where is_fixture;

  /* Nobody but Dee and two admins logged production on these. If that is not
     true any more, stop: somebody's recorded work is about to be destroyed. */
  select count(*) into v_real_production
    from public.production_logs pl
    join public.fulfillment_clients c on c.id = pl.client_id
    join public.agency_memberships m on m.user_id = pl.employee_id
   where not c.is_fixture
     and not pl.is_voided
     and m.can_receive_production_work;
  if v_real_production > 0 then
    raise exception
      '% production rows belong to production agents — export and confirm before deleting',
      v_real_production;
  end if;

  delete from public.production_logs pl
   using public.fulfillment_clients c
   where c.id = pl.client_id and not c.is_fixture;

  delete from public.activity_events a
   using public.fulfillment_clients c
   where a.entity_type = 'fulfillment_client'
     and a.entity_id = c.id::text
     and not c.is_fixture;

  /* Department rows, checklists, rounds, outcomes and credit reports all
     cascade from the client. */
  delete from public.fulfillment_clients where not is_fixture;
  get diagnostics v_clients = row_count;

  select count(*) into v_fixtures_after from public.fulfillment_clients where is_fixture;
  if v_fixtures_after <> v_fixtures_before then
    raise exception 'the security fixtures were touched: % before, % after',
      v_fixtures_before, v_fixtures_after;
  end if;

  raise notice 'cleared % pilot clients; % security fixtures intact', v_clients, v_fixtures_after;
end $$;

commit;
