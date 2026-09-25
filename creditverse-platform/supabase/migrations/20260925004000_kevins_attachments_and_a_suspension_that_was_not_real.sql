-- Kevin Hernandez's attachments, and a suspension that was not real.
--
-- TWO THINGS, both corrections.
--
-- ── THE ATTACHMENTS ───────────────────────────────────────────────────────
--
-- 80 files imported against `entity_type = 'client'`, which no CreditOps
-- screen reads. Exactly the fault 20260924011000 repointed — and that
-- migration fixed the rows already written and the ACTIVITY writer beside
-- them, and missed the FILE writer in the Edge Function. In the same
-- migration whose stated point was that fixing a consumer and leaving the
-- producer is how a bug returns with more data behind it.
--
-- Both are fixed now: the writer, and these rows.
--
-- ── THE SUSPENSION ────────────────────────────────────────────────────────
--
-- Dee, 2026-09-25: "He's not suspended." The record said nonpayment since
-- 2026-09-20, and while it stood his 27 clients were hidden from every queue
-- and from My Work — which is the suspension doing its job on a fact that was
-- not true.
--
-- Lifted rather than deleted. `partner_suspensions` keeps its history: the
-- row records that a suspension was entered and when it ended, which is what
-- somebody asking "why could nobody see these in September" needs. Nothing
-- about the partner, their clients or their billing changes.
--
-- Cost impact: no material increase.

begin;

do $$
declare v_files int;
begin
  update public.files f
     set entity_type = 'fulfillment_client'
   where f.entity_type = 'client'
     and exists (select 1 from public.fulfillment_clients fc where fc.id::text = f.entity_id);
  get diagnostics v_files = row_count;
  raise notice 'repointed % attachments', v_files;
end $$;

do $$
declare v_group uuid; v_lifted int;
begin
  select id into v_group from public.outsourcing_groups where name = 'Kevin Hernandez';
  if v_group is null then
    raise exception 'no partner called Kevin Hernandez';
  end if;

  update public.partner_suspensions
     set lifted_at = now(), lift_reason = 'Entered in error — the partner is not suspended (Dee, 2026-09-25).'
   where group_id = v_group and lifted_at is null;
  get diagnostics v_lifted = row_count;
  raise notice 'lifted % suspension(s)', v_lifted;
end $$;

/* His clients reach the queues now, and nobody else''s suspension moved. */
do $$
declare v_group uuid; v_queued int; v_others int;
begin
  select id into v_group from public.outsourcing_groups where name = 'Kevin Hernandez';
  if public.partner_is_suspended(v_group) then
    raise exception 'Kevin Hernandez is still suspended';
  end if;
  select count(*) into v_queued from public.creditops_department_queue
   where outsourcing_group_id = v_group;
  if v_queued = 0 then
    raise exception 'his clients still reach no queue';
  end if;

  select count(*) into v_others from public.partner_suspensions where lifted_at is null;
  raise notice '% of his files are in a queue; % other partners remain suspended', v_queued, v_others;
end $$;

do $$
declare v_bad int;
begin
  select count(*) into v_bad from public.files f
   where f.entity_type = 'client'
     and exists (select 1 from public.fulfillment_clients fc where fc.id::text = f.entity_id);
  if v_bad > 0 then raise exception '% attachments still say client', v_bad; end if;
end $$;

commit;
