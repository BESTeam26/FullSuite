-- The Agent column stops going stale after every import.
--
-- `fulfillment_clients.assigned_agent_id` is DERIVED: `creditops_refresh_
-- headline()` computes it from the routing table plus the client's department
-- rows, and `creditops_assign_agent()` calls it on every assignment. It is a
-- headline, not a second place an owner is recorded (rule 2).
--
-- But nothing else called it. The ClickUp import writes department rows
-- directly, so after every list the headline was stale for the new clients
-- and the Agent column read "—" on files that had an owner. That was
-- backfilled by hand on 2026-09-26 (262 clients) and was stale again two days
-- later for the same reason — which is the signal that the backfill was
-- treating a symptom.
--
-- A derived value that has to be refreshed by remembering to refresh it is
-- not derived, it is duplicated. The trigger makes it actually derived: any
-- write to a client's department rows recomputes that ONE client's headline,
-- from the same function, in the same transaction.
--
-- ── WHY THIS CANNOT LOOP ─────────────────────────────────────────────────
--
-- `creditops_refresh_headline` updates `fulfillment_clients`, never
-- `client_department_statuses`, so it cannot re-fire the trigger that called
-- it. Its own UPDATE is guarded by `is distinct from`, so a no-op write does
-- nothing at all.
--
-- Cost impact: no material increase. One bounded UPDATE per department-row
-- write, on a table written a few times per client per day; it replaces a
-- full-table backfill after every import.

begin;

create or replace function public.creditops_headline_follows_departments()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  /* On DELETE the row is gone, so the client comes from OLD. */
  perform public.creditops_refresh_headline(coalesce(new.client_id, old.client_id));
  return null;
end $$;

comment on function public.creditops_headline_follows_departments() is
  'Keeps fulfillment_clients.assigned_agent_id derived from the department rows. '
  'Added 2026-09-28 after the second hand backfill in three days.';

drop trigger if exists creditops_headline_follows_departments
  on public.client_department_statuses;

create trigger creditops_headline_follows_departments
  after insert or update or delete on public.client_department_statuses
  for each row execute function public.creditops_headline_follows_departments();

/* And catch up whatever is stale right now, including the clients imported
   today. Guarded: a backfill that takes owners AWAY is not a backfill. */
create temporary table headline_before on commit drop as
  select id, assigned_agent_id from public.fulfillment_clients;

do $$
declare v_id uuid; v_n int := 0;
begin
  for v_id in select id from public.fulfillment_clients loop
    perform public.creditops_refresh_headline(v_id);
    v_n := v_n + 1;
  end loop;
  raise notice 're-derived % headlines', v_n;
end $$;

do $$
declare v_lost int; v_gained int;
begin
  select count(*) into v_lost from headline_before b
    join public.fulfillment_clients c on c.id = b.id
   where b.assigned_agent_id is not null and c.assigned_agent_id is null;
  select count(*) into v_gained from headline_before b
    join public.fulfillment_clients c on c.id = b.id
   where b.assigned_agent_id is null and c.assigned_agent_id is not null;
  if v_lost > 0 then
    raise exception '% clients lost their assigned agent', v_lost;
  end if;
  raise notice '% clients now show the agent who already owned the work', v_gained;
end $$;

/* The trigger actually fires: prove it on a real row rather than trusting the
   DDL parsed. Writing the same status back is a no-op for the row and still
   exercises the path. */
do $$
declare v_client uuid; v_dept fulfillment_department; v_status text; v_before uuid; v_after uuid;
begin
  select s.client_id, s.department, s.status into v_client, v_dept, v_status
    from public.client_department_statuses s
    join public.fulfillment_clients fc on fc.id = s.client_id
   where fc.archived_at is null and s.assignee_id is not null
   limit 1;
  if v_client is null then
    raise notice 'no department row to test the trigger against — skipped';
    return;
  end if;

  select assigned_agent_id into v_before from public.fulfillment_clients where id = v_client;
  update public.fulfillment_clients set assigned_agent_id = null where id = v_client;
  update public.client_department_statuses
     set updated_at = now() where client_id = v_client and department = v_dept;
  select assigned_agent_id into v_after from public.fulfillment_clients where id = v_client;

  if v_after is distinct from v_before then
    raise exception 'the trigger did not restore the headline (% -> %)', v_before, v_after;
  end if;
  raise notice 'trigger verified on a live row';
end $$;

commit;
