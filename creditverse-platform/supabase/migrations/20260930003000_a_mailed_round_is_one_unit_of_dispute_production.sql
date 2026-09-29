-- A mailed round is one unit of Dispute production.
--
-- Dee, 2026-09-30: "For production reporting, a completed/sent dispute round
-- should count as the Dispute agent's production for that round. Make sure
-- it is one production event for the completed round/file, not multiple
-- credits caused by status changes or duplicate events."
--
-- What counts is DATA (`creditops_production_events`, §17), so this is one
-- row, not a code change: Dispute entering ROUND SENT - AWAITING RESULTS —
-- the department stage every "Round N Sent" credit status routes into — is
-- a unit of production for the agent the file was assigned to.
--
-- ── ONE EVENT PER ROUND PER FILE, BY CONSTRUCTION ────────────────────────
--
-- `creditops_completion_production` writes with a `request_id` derived from
-- (client, department, department status, Eastern work date), under the
-- unique index on (agency_id, request_id). So:
--
--   · Round 2 mailed on Tuesday and Round 3 mailed on Friday: two dates,
--     two events, two rounds. Correct.
--   · The same file re-saved into the same stage on the same day, or the
--     row edited without the status changing: same key, or no transition —
--     nothing written.
--   · A status change that is NOT into this stage: not an event.
--
-- Credit goes to `assignee_id` at the moment of transition — the agent whose
-- file it was — before `creditops_route_client` clears the assignee for the
-- waiting stage. The trigger is AFTER UPDATE OF status and reads NEW row
-- values, which is why the assignee is still present when it fires; the
-- clear happens in a separate statement.
--
-- ── NOT RETROACTIVE ──────────────────────────────────────────────────────
--
-- The mass conversions that set "Round N Sent" on imported files update
-- `fulfillment_clients.status`, not `client_department_statuses`, so they do
-- not fire this. No agent is credited for rounds ClickUp mailed months ago.
--
-- Cost impact: one small insert per mailed round. Scales with rounds mailed.

begin;

insert into public.creditops_production_events (department, status, unit_label)
values ('Dispute', 'ROUND SENT - AWAITING RESULTS', 'Round mailed')
on conflict (department, status) do update
  set unit_label = excluded.unit_label, active = true;

/* Prove the transition credits exactly once, on a real Dispute file, and
   leave nothing behind. */
do $$
declare
  v_client uuid; v_assignee uuid; v_prev text;
  v_first int; v_second int;
begin
  select s.client_id, s.assignee_id, s.status into v_client, v_assignee, v_prev
    from public.client_department_statuses s
    join public.fulfillment_clients fc on fc.id = s.client_id
   where s.department = 'Dispute' and s.assignee_id is not null and fc.archived_at is null
     and upper(btrim(s.status)) <> 'ROUND SENT - AWAITING RESULTS'
   limit 1;
  if v_client is null then
    raise notice 'no assigned Dispute file to test against — skipped';
    return;
  end if;

  begin
    update public.client_department_statuses
       set status = 'ROUND SENT - AWAITING RESULTS'
     where client_id = v_client and department = 'Dispute';
    select count(*) into v_first from public.production_logs
     where client_id = v_client and department = 'Dispute' and not is_voided
       and work_date = (now() at time zone 'America/New_York')::date;

    /* Re-save the same stage: must not credit again. */
    update public.client_department_statuses
       set updated_at = now()
     where client_id = v_client and department = 'Dispute';
    update public.client_department_statuses
       set status = v_prev where client_id = v_client and department = 'Dispute';
    update public.client_department_statuses
       set status = 'ROUND SENT - AWAITING RESULTS'
     where client_id = v_client and department = 'Dispute';
    select count(*) into v_second from public.production_logs
     where client_id = v_client and department = 'Dispute' and not is_voided
       and work_date = (now() at time zone 'America/New_York')::date;

    raise exception 'undo the probe';
  exception when others then
    if sqlerrm <> 'undo the probe' then raise; end if;
  end;

  if v_first <> 1 then
    raise exception 'mailing a round wrote % production rows, expected 1', v_first;
  end if;
  if v_second <> 1 then
    raise exception 'replaying the same round on the same day wrote % rows, expected still 1', v_second;
  end if;
  raise notice 'a mailed round credits once, and once only, per file per day';
end $$;

commit;
