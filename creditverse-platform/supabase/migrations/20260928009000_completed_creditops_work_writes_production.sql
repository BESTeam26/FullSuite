-- Completed CreditOps work writes a production log.
--
-- Dee, 2026-09-28: "use meaningful completed CreditOps work as production
-- evidence. Do not count every status change as productivity. Agent completes
-- real work → canonical production log is created → EOD pulls it… Keep it
-- idempotent so work is never counted twice."
--
-- ── THE LINK THAT WAS MISSING ────────────────────────────────────────────
--
-- `production_logs` had exactly one writer: `work_items_completion_production`,
-- fired by completing a work_item. CreditOps work is not work_items — it is
-- department statuses on client files, and `set_client_department_status`
-- wrote no production at all.
--
-- So the chain broke at its first link. Measured on 2026-09-28: 18 EOD
-- submissions against 22 production rows in the entire database, one of them
-- in the last fourteen days. The reports were being filed; the automatic part
-- had nothing to pull.
--
-- ── WHAT COUNTS, AND WHY IT IS A TABLE ───────────────────────────────────
--
-- Not every status change. `creditops_closed_status_for(department)` already
-- names the ONE status per department that means that department finished its
-- work on a file:
--
--   Onboarding      ONBOARDING READY FOR ROUND 1
--   Dispute         COMPLETED
--   Support         SUPPORT RESOLVED
--   Complaints      COMPLAINT COMPLETED
--   Bureau Calling  BUREAU CALLING COMPLETED
--
-- That is the seed, so this starts from the definition the codebase already
-- holds rather than a new opinion about productivity. Deliberately excluded:
-- the "NOT NEEDED" statuses, which mean no work was done.
--
-- It is a TABLE and not a hard-coded list because what counts as a unit of
-- production is Dee's call, not the schema's (§17 — customization is data,
-- not code branches). A mailed round is the obvious candidate she may want
-- counted, and adding it is one row:
--
--   insert into creditops_production_events (department, status, unit_label)
--   values ('Dispute', 'ROUND SENT - AWAITING RESULTS', 'Round mailed');
--
-- It is left OUT of the seed on purpose. Counting it would credit a Dispute
-- agent per round rather than per file, which changes everybody's numbers,
-- and that is a decision to make deliberately rather than inherit from a
-- migration.
--
-- ── IDEMPOTENT BY CONSTRUCTION ───────────────────────────────────────────
--
-- `production_logs` already carries `request_id` under a unique index on
-- (agency_id, request_id). The trigger derives that id deterministically from
-- the event — client, department, status, Eastern work date — so replaying
-- the same completion writes nothing. Not a check that could be raced: the
-- database refuses the duplicate.
--
-- A file genuinely reopened and completed again on a LATER day is a different
-- date, so it is different work and counts again. That is correct.
--
-- ── THE WORKDAY IS EASTERN ───────────────────────────────────────────────
--
-- `(now() at time zone 'America/New_York')::date`, matching the eleven other
-- functions in this schema and the fix applied to `eod_day_activity` earlier
-- today.
--
-- ── CREDIT GOES TO THE ASSIGNEE ──────────────────────────────────────────
--
-- Not to whoever pressed the button. If a lead closes a file on an agent's
-- behalf, the agent did the work (rule 4 — historical attribution must not
-- change). `auth.uid()` is the fallback for a file with no assignee.
--
-- ── AND IT MUST NOT BREAK THE WRITE ──────────────────────────────────────
--
-- A side-effect trigger that raises takes the real write down with it. This
-- one is SECURITY DEFINER so row-level security cannot refuse its insert, and
-- every path returns rather than raising.
--
-- Cost impact: one small insert per completed file. At BES volume that is a
-- few hundred rows a day at most. It scales with completed work, not with
-- clients or page views.

begin;

create table if not exists public.creditops_production_events (
  department   public.fulfillment_department not null,
  status       text not null,
  unit_label   text not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  primary key (department, status)
);

comment on table public.creditops_production_events is
  'Which department status transitions count as a unit of completed CreditOps '
  'production. Rows, not code, so what counts is Dee''s decision (§17).';

alter table public.creditops_production_events enable row level security;

drop policy if exists creditops_production_events_select on public.creditops_production_events;
create policy creditops_production_events_select on public.creditops_production_events
for select using (public.is_staff_of((select id from public.agencies limit 1)));

/* Seeded from the definition the codebase already holds. */
insert into public.creditops_production_events (department, status, unit_label)
select d.department,
       public.creditops_closed_status_for(d.department),
       d.department::text
  from (select unnest(enum_range(null::public.fulfillment_department)) as department) d
 where public.creditops_closed_status_for(d.department) is not null
on conflict (department, status) do nothing;

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
  /* Only a TRANSITION into the status counts. Re-saving the same status, or
     any other edit to the row, is not a new piece of work. */
  if tg_op = 'UPDATE' and upper(btrim(coalesce(old.status, ''))) = v_status then
    return null;
  end if;

  select e.unit_label into v_label
    from public.creditops_production_events e
   where e.department = new.department
     and upper(btrim(e.status)) = v_status
     and e.active;
  if v_label is null then
    return null;                       -- not a completion event; most changes
  end if;

  select * into v_client from public.fulfillment_clients where id = new.client_id;
  if v_client.id is null then return null; end if;

  /* The person the work belonged to, not whoever pressed the button. */
  v_employee := coalesce(new.assignee_id, auth.uid());
  if v_employee is null then return null; end if;
  if not exists (select 1 from public.profiles p where p.id = v_employee) then
    return null;
  end if;

  v_date := (now() at time zone 'America/New_York')::date;

  /* Deterministic, so replaying the same completion collides with itself on
     the (agency_id, request_id) unique index instead of double-counting. */
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
  on conflict (agency_id, request_id) do nothing;

  return null;
exception when others then
  /* Never take the agent's status change down with it. */
  raise warning 'creditops_completion_production skipped: %', sqlerrm;
  return null;
end $$;

comment on function public.creditops_completion_production() is
  'Writes one production log when a department finishes its work on a file. '
  'Idempotent through production_logs.request_id.';

drop trigger if exists creditops_completion_production on public.client_department_statuses;

create trigger creditops_completion_production
  after insert or update of status on public.client_department_statuses
  for each row execute function public.creditops_completion_production();

commit;
