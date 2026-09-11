-- =============================================================================
-- Operational SLA: when BES must act next, calculated from the workflow.
--
-- Dee, 2026-09-11: "Do not make SLA a manually entered number... I want the
-- backend/database/workflow engine to calculate them consistently so table,
-- dashboard, Attention Center, My Work, notifications and reports all agree."
--
-- ── WHAT WAS THERE ──────────────────────────────────────────────────────────
--
-- One line of React: `slaHoursRemaining: hoursUntil(row.due_at)`. No rule, no
-- anchor, no recomputation — whatever number sat in `due_at` WAS the SLA, and
-- for the ClickUp imports that number was ClickUp's own due date.
--
-- ── REGULATORY AND OPERATIONAL ARE NOT THE SAME CLOCK ───────────────────────
--
-- `dispute_timers` is FCRA: when must the BUREAU act, per letter, legally
-- defined. This is BES policy: when must BES act next, per client per
-- department. They can fall on nearly the same day and remain different facts
-- — the FCRA clock runs from when the bureau RECEIVED the letter, the reimport
-- window from when BES MAILED it. Merged, a legal deadline would move whenever
-- somebody corrected an operational date. So `dispute_timers` is not touched
-- here (Dee's gate).
--
-- ── WHY THE DUE DATE IS PER DEPARTMENT ──────────────────────────────────────
--
-- A client can sit in Complaints on a 5-day clock and Dispute on a 30-day one
-- at the same time. One column on the client cannot hold both, which is why
-- the anchor lives on the queue row. `fulfillment_clients.due_at` survives as
-- the SOONEST of them, maintained by trigger — so every screen already reading
-- that column starts telling the truth without being rewritten.
-- =============================================================================

-- ── The rules, as data ──────────────────────────────────────────────────────
create table public.sla_policies (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  department  public.fulfillment_department not null,
  /** Null matches any status in that department. A specific status wins. */
  status      text,
  hours       integer not null check (hours > 0),
  /** A waiting stage is not late and holds no agent: the client is parked
      until the clock runs out, and an agent must not carry it meanwhile. */
  waiting     boolean not null default false,
  label       text,
  created_at  timestamptz not null default now(),
  constraint sla_policies_unique unique (agency_id, department, status)
);

comment on table public.sla_policies is
  'When BES must next act, per department and optionally per queue status. Rows, not code, so a policy change is an UPDATE (Dee, 2026-09-11).';

alter table public.sla_policies enable row level security;
create policy sla_policies_select on public.sla_policies
  for select using (public.is_staff_of(agency_id));
grant select on public.sla_policies to authenticated;

insert into public.sla_policies (agency_id, department, status, hours, waiting, label)
select a.id, v.dept::public.fulfillment_department, v.status, v.hours, v.waiting, v.label
  from public.agencies a
 cross join (values
   ('Dispute',    'Mailed', 720, true,  'Mailed — 30 days to reimport'),
   ('Support',    null,      24, false, 'Support — 24 hours'),
   ('Complaints', null,     120, false, 'Complaints — 5 days')
 ) as v(dept, status, hours, waiting, label)
on conflict (agency_id, department, status) do nothing;

-- ── The anchor and the answer, on the queue row ─────────────────────────────
alter table public.client_department_statuses
  /** When this queue entry began. THE anchor every rule counts from. */
  add column if not exists opened_at timestamptz not null default now(),
  /** What the rule says. Never edited by hand. */
  add column if not exists system_due_at timestamptz,
  /** What somebody decided instead. The system date is kept beside it. */
  add column if not exists manual_due_at timestamptz,
  add column if not exists manual_due_by uuid references public.profiles(id) on delete set null,
  add column if not exists manual_due_set_at timestamptz,
  add column if not exists manual_due_reason text;

comment on column public.client_department_statuses.system_due_at is
  'What the SLA policy calculates. An override goes in manual_due_at and this is preserved beside it, so the original logic is never destroyed (Dee, 2026-09-11).';

/** What the queue actually shows: the override if there is one, else the rule. */
create or replace function public.department_due_at(p public.client_department_statuses)
returns timestamptz language sql immutable as $function$
  select coalesce(p.manual_due_at, p.system_due_at)
$function$;

-- ── The calculation ─────────────────────────────────────────────────────────
create or replace function public.compute_department_due(
  p_agency uuid, p_department public.fulfillment_department,
  p_status text, p_opened_at timestamptz)
returns timestamptz
language sql stable security definer set search_path = public as $function$
  /* A rule naming the status beats the department-wide one; NULLS LAST puts
     the specific rule first. */
  select p_opened_at + make_interval(hours => s.hours)
    from public.sla_policies s
   where s.agency_id = p_agency and s.department = p_department
     and (s.status is null or s.status = p_status)
   order by s.status nulls last
   limit 1
$function$;

create or replace function public.department_is_waiting(
  p_agency uuid, p_department public.fulfillment_department, p_status text)
returns boolean
language sql stable security definer set search_path = public as $function$
  select coalesce((
    select s.waiting from public.sla_policies s
     where s.agency_id = p_agency and s.department = p_department
       and (s.status is null or s.status = p_status)
     order by s.status nulls last limit 1), false)
$function$;

-- ── Keeping it current ──────────────────────────────────────────────────────
/**
 * The queue row recalculates itself.
 *
 * A status change restarts the clock, because entering a queue is the event
 * every rule counts from. A row whose status has not changed keeps its anchor,
 * so an unrelated edit does not quietly grant another 30 days.
 *
 * Entering a WAITING stage also clears the processing agent — Dee: "I do NOT
 * want agents holding assignments for 30 days on work they cannot act on."
 * The partner, the team and the Lead Account Manager are untouched; only the
 * temporary operational assignment goes, and the previous holder is recorded
 * so the history survives.
 */
create or replace function public.department_status_sla()
returns trigger language plpgsql security definer set search_path = public as $function$
declare v_agency uuid; v_prev_agent uuid; v_name text; v_actor text;
begin
  select fc.agency_id, fc.assigned_agent_id, fc.name
    into v_agency, v_prev_agent, v_name
    from public.fulfillment_clients fc where fc.id = new.client_id;

  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.opened_at := now();
    /* An override belonged to the old state; a new state gets the rule. */
    new.manual_due_at := null;
    new.manual_due_by := null;
    new.manual_due_set_at := null;
    new.manual_due_reason := null;
  end if;

  new.system_due_at := public.compute_department_due(
    v_agency, new.department, new.status, new.opened_at);

  if public.department_is_waiting(v_agency, new.department, new.status)
     and v_prev_agent is not null then
    update public.fulfillment_clients
       set assigned_agent_id = null, updated_at = now()
     where id = new.client_id;

    select coalesce(p.full_name, p.email) into v_actor
      from public.profiles p where p.id = v_prev_agent;
    insert into public.activity_events
      (agency_id, entity_type, entity_id, actor_id, actor_name, action, detail,
       field, previous_value, new_value, visibility)
    values (v_agency, 'client', new.client_id::text, auth.uid(), 'BES',
            'Unassigned while waiting',
            coalesce(v_name, 'This client') || ' is waiting until '
              || to_char(new.system_due_at, 'Mon DD') || ', so it is no longer on '
              || coalesce(v_actor, 'an agent') || '''s active work.',
            'assigned_agent', v_actor, null, 'bes_internal');
  end if;

  return new;
end $function$;
revoke execute on function public.department_status_sla() from public, anon, authenticated;

drop trigger if exists client_department_statuses_sla on public.client_department_statuses;
create trigger client_department_statuses_sla
  before insert or update on public.client_department_statuses
  for each row execute function public.department_status_sla();

-- ── The client's own due date: the soonest of its open queues ───────────────
/**
 * `fulfillment_clients.due_at` stays, and stops being whatever somebody typed.
 * Every table, dashboard and queue already reads it, so making it derived is
 * how they all start agreeing without being rewritten.
 */
create or replace function public.refresh_client_due(p_client uuid)
returns void
language sql security definer set search_path = public as $function$
  update public.fulfillment_clients fc
     set due_at = (select min(coalesce(d.manual_due_at, d.system_due_at))
                     from public.client_department_statuses d
                    where d.client_id = fc.id),
         updated_at = now()
   where fc.id = p_client
$function$;
revoke execute on function public.refresh_client_due(uuid) from public, anon, authenticated;

create or replace function public.department_status_refresh_client()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  perform public.refresh_client_due(coalesce(new.client_id, old.client_id));
  return null;
end $function$;
revoke execute on function public.department_status_refresh_client() from public, anon, authenticated;

drop trigger if exists client_department_statuses_refresh_client on public.client_department_statuses;
create trigger client_department_statuses_refresh_client
  after insert or update or delete on public.client_department_statuses
  for each row execute function public.department_status_refresh_client();

-- ── Backfill: the imported rows get real anchors and real due dates ─────────
/* Every queue row was written by the ClickUp import with no anchor. Their
   `updated_at` is when the import wrote them, which is not when the work
   began — so the anchor is the client's own mailed/opened evidence where we
   have it, and the import moment where we do not. Honest either way, and the
   Attention Center will surface the ones that need a real date. */
update public.client_department_statuses d
   set opened_at = coalesce(fc.program_started_on::timestamptz, d.updated_at)
  from public.fulfillment_clients fc
 where fc.id = d.client_id and d.opened_at > now() - interval '1 minute';

update public.client_department_statuses d
   set system_due_at = public.compute_department_due(
         fc.agency_id, d.department, d.status, d.opened_at)
  from public.fulfillment_clients fc
 where fc.id = d.client_id;

select public.refresh_client_due(id) from public.fulfillment_clients;
