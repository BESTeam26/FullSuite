-- The Agent column catches up with the owner the file already has.
--
-- Dee, 2026-09-26: "ALL UNASSIGNED, AUTO ASSIGNED Them to The correct
-- department based on their CURRENT Credit Status."
--
-- The assignment itself was already right: after `creditops_assign_unclaimed()`
-- every actionable file has an owner on its department row, in all five
-- departments. But 262 clients still showed "—" in the Agent column, which
-- reads as unassigned and is exactly what Dee was pointing at.
--
-- ── NOT A SECOND SOURCE OF TRUTH ──────────────────────────────────────────
--
-- `fulfillment_clients.assigned_agent_id` is a DERIVED headline, not a second
-- place an owner is recorded: `creditops_refresh_headline()` computes it from
-- the routing table plus the department rows, and `creditops_assign_agent()`
-- calls it on every assignment. The imports wrote department rows directly,
-- so the headline was never recomputed for them — stale, not wrong (rule 2).
--
-- This re-derives it. It invents nothing: the function is the definition of
-- the correct value, and the guard below refuses if any client LOSES a
-- headline, which would mean the derivation, not the data, had changed.
--
--   262 stale   ·   256 gain the owner their department row already names
--     0 cleared
--
-- Cost impact: no material increase. One backfill; the headline stays current
-- afterwards because every assignment path already refreshes it.

begin;

create temporary table headline_before on commit drop as
  select id, assigned_agent_id from public.fulfillment_clients;

do $$
declare v_id uuid; v_n int := 0;
begin
  for v_id in select id from public.fulfillment_clients loop
    perform public.creditops_refresh_headline(v_id);
    v_n := v_n + 1;
  end loop;
  raise notice 're-derived the headline for % clients', v_n;
end $$;

do $$
declare v_lost int; v_gained int;
begin
  select count(*) into v_lost
    from headline_before b
    join public.fulfillment_clients c on c.id = b.id
   where b.assigned_agent_id is not null and c.assigned_agent_id is null;

  select count(*) into v_gained
    from headline_before b
    join public.fulfillment_clients c on c.id = b.id
   where b.assigned_agent_id is null and c.assigned_agent_id is not null;

  /* A backfill that takes owners away is not a backfill. */
  if v_lost > 0 then
    raise exception '% clients lost their assigned agent — the derivation changed, not the data', v_lost;
  end if;
  raise notice '% clients now show the agent who already owned the work', v_gained;
end $$;

commit;
