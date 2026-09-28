-- The production trigger actually writes, and this migration proves it.
--
-- 20260928009000 added the trigger and it wrote nothing. Everything looked
-- right — trigger enabled, event row configured, status transition detected,
-- every guard passing when called by hand — and no production log appeared.
--
-- ── THE BUG ──────────────────────────────────────────────────────────────
--
-- `production_logs_request_idx` is a PARTIAL unique index:
--
--   CREATE UNIQUE INDEX ... ON (agency_id, request_id) WHERE request_id IS NOT NULL
--
-- `ON CONFLICT (agency_id, request_id)` does not match a partial index unless
-- the inference carries the same predicate. Without it Postgres raises "no
-- unique or exclusion constraint matching the ON CONFLICT specification" —
-- every single time, for every completion.
--
-- ── THE WORSE BUG, WHICH WAS MINE ────────────────────────────────────────
--
-- The trigger ends with `exception when others then raise warning … return
-- null`, so that a side-effect can never take an agent's status change down
-- with it. That part is right. What was wrong is that it made a total failure
-- indistinguishable from a quiet day: the feature was completely broken and
-- the only symptom was an empty EOD.
--
-- So the handler stays — the agent's write still must not fail — and this
-- migration adds what was missing: a check that the trigger really writes a
-- row, run against a REAL client here at deploy time. A future change that
-- breaks the insert fails this, instead of being discovered as another month
-- of empty reports.
--
-- Cost impact: none beyond 20260928009000.

begin;

create or replace function public.creditops_completion_production()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_status   text := upper(btrim(coalesce(new.status, '')));
  v_label    text;
  v_client   public.fulfillment_clients%rowtype;
  v_employee uuid;
  v_date     date;
  v_request  uuid;
begin
  if tg_op = 'UPDATE' and upper(btrim(coalesce(old.status, ''))) = v_status then
    return null;
  end if;

  select e.unit_label into v_label
    from public.creditops_production_events e
   where e.department = new.department
     and upper(btrim(e.status)) = v_status
     and e.active;
  if v_label is null then return null; end if;

  select * into v_client from public.fulfillment_clients where id = new.client_id;
  if v_client.id is null then return null; end if;

  v_employee := coalesce(new.assignee_id, auth.uid());
  if v_employee is null then return null; end if;
  if not exists (select 1 from public.profiles p where p.id = v_employee) then
    return null;
  end if;

  v_date := (now() at time zone 'America/New_York')::date;
  v_request := md5(
    'creditops:' || new.client_id::text || ':' || new.department::text
      || ':' || v_status || ':' || v_date::text
  )::uuid;

  insert into public.production_logs (
    agency_id, employee_id, client_id, organization_id, outsourcing_group_id,
    service, department, department_key,
    production_unit_type, production_unit_quantity,
    work_date, completed_at, resulting_status, request_id
  )
  values (
    v_client.agency_id, v_employee, v_client.id, v_client.organization_id,
    v_client.outsourcing_group_id,
    'creditops'::public.fulfillment_service, new.department, new.department::text,
    v_label, 1,
    v_date, now(), new.status, v_request
  )
  /* The index is PARTIAL, so the inference has to carry its predicate.
     Without `where request_id is not null` this raises every time. */
  on conflict (agency_id, request_id) where request_id is not null do nothing;

  return null;
exception when others then
  /* Never take the agent's status change down with it — but the deploy-time
     check below is what stops this hiding a total failure. */
  raise warning 'creditops_completion_production skipped: %', sqlerrm;
  return null;
end $$;

/* ── Prove it, on a real row, and leave nothing behind ─────────────────── */
do $$
declare
  v_client uuid; v_dept public.fulfillment_department; v_done text;
  v_prev text; v_assignee uuid;
  v_wrote boolean := false; v_twice int := 0; v_eastern boolean := false;
begin
  /* A real client with a real assignee, whose department has a completion
     status it is not already sitting on. */
  select s.client_id, s.department, s.status, s.assignee_id,
         public.creditops_closed_status_for(s.department)
    into v_client, v_dept, v_prev, v_assignee, v_done
    from public.client_department_statuses s
    join public.fulfillment_clients fc on fc.id = s.client_id
   where fc.archived_at is null
     and s.assignee_id is not null
     and public.creditops_closed_status_for(s.department) is not null
     and upper(btrim(s.status)) <> upper(btrim(public.creditops_closed_status_for(s.department)))
   limit 1;

  if v_client is null then
    raise notice 'no suitable client to test the trigger against — skipped';
    return;
  end if;

  /* A sub-block, undone by raising at the end of it. plpgsql variables are
     not transactional, so the findings survive the rollback. */
  begin
    update public.client_department_statuses
       set status = v_done
     where client_id = v_client and department = v_dept;

    select count(*) > 0,
           bool_or(work_date = (now() at time zone 'America/New_York')::date)
      into v_wrote, v_eastern
      from public.production_logs
     where client_id = v_client and department = v_dept and not is_voided;

    /* Replay the same completion: the partial-index inference must absorb it. */
    update public.client_department_statuses
       set status = v_prev where client_id = v_client and department = v_dept;
    update public.client_department_statuses
       set status = v_done where client_id = v_client and department = v_dept;

    select count(*) into v_twice
      from public.production_logs
     where client_id = v_client and department = v_dept and not is_voided;

    raise exception 'undo the probe';
  exception when others then
    if sqlerrm <> 'undo the probe' then raise; end if;
  end;

  if not v_wrote then
    raise exception 'completing % on a real client wrote NO production log', v_dept;
  end if;
  if not v_eastern then
    raise exception 'the production log was not dated in Eastern time';
  end if;
  if v_twice <> 1 then
    raise exception 'replaying the same completion produced % rows, expected 1', v_twice;
  end if;
  raise notice 'trigger verified on a live row: one production log, Eastern dated, idempotent on replay';
end $$;

commit;
