-- EOD routes up the ladder, and a lead's submission stores its report.
--
-- Dee, 2026-09-29: "Agent → Team Lead… Team Lead → Department Lead… Department
-- Lead → Division Lead… Division Lead → Management / Executive. Higher-level
-- reports must summarize the level immediately below them. Do not repeatedly
-- email individual Agent reports all the way to management… EOD generation
-- should happen efficiently in the background/on submission and must NOT add
-- latency to the live CreditOps workflow."
--
-- ── 1. ROUTING KNEW ONE STEP ─────────────────────────────────────────────
--
-- `eod_route_for` resolves an agent to the lead of their team, and stops.
-- A team lead's own submission therefore routed to… the lead of whatever
-- team THEY are a member of, which for Daniel is Bryan's Management Team —
-- not his department lead. There was no department level and no division
-- level at all.
--
-- `eod_route_up_for` answers the question the ladder asks: "what does this
-- person LEAD, and who is one rung up?"
--
--   leads a team               → that team's department_manager seat   (department_lead)
--   holds department_manager   → the division's division_manager seat  (division_lead)
--   holds division_manager     → chief_operations, else managing_partner (executive)
--   leads nothing              → eod_route_for, unchanged                (team_lead / ambiguous / none)
--
-- Seats, never `departments.manager_id` or `divisions.lead_id`: those columns
-- survive in the schema but nothing routes on them (AD-011, D-021 —
-- management access comes from seats). The rung is reported as `level` so
-- the reader knows what kind of report arrived, and `unrouted` where the
-- rung above is empty — which today is true for every CreditOps division
-- report, because CreditOps has no division_manager. That goes to support
-- with the reason attached, the same way an agent with no lead already does.
--
-- ── 2. THE REPORT IS BUILT ONCE, AT SUBMISSION, AND STORED ───────────────
--
-- When a lead's submission transitions into `submitted`, the trigger builds
-- `eod_report(level, scope, work_date)` for the scope they lead and stores
-- it on the row (`report`, `report_level`, `report_scope_id`). From then on
-- the email and the screen READ a row; nothing rebuilds. That is what keeps
-- this off the CreditOps hot path — the only time the report is computed is
-- the moment somebody presses Submit, and that person is waiting on their own
-- submission, nobody else.
--
-- The build runs under the submitter's own identity, so `eod_report`'s
-- visibility gate is satisfied by exactly the people the ladder already lets
-- them see. If the build fails for any reason the submission still goes
-- through with `report` null and the reason recorded — a lead must never be
-- unable to file because a rollup hiccupped.
--
-- ── 3. THE EMAIL CARRIES THE SAME DOCUMENT ───────────────────────────────
--
-- `eod_queue_email` used to assemble its own team totals inline — a second
-- implementation of the rollup, beside `eod_team_rollup`'s (rule 2). It now
-- puts `new.report` in the payload, and the renderer draws that. The screen
-- and the mail cannot disagree, because there is one document.
--
-- The recipient logic — routed lead, else support; support copied otherwise —
-- is kept exactly as it was.
--
-- Cost impact: one `eod_report` build per LEAD submission per day (a handful
-- a day), stored once. Cost scales with: number of lead-level EOD submissions
-- per day. Nothing added to client-list, queue, status-change or workspace
-- requests.

begin;

alter table public.eod_submissions
  add column if not exists report          jsonb,
  add column if not exists report_level    text,
  add column if not exists report_scope_id uuid,
  add column if not exists report_error    text;

comment on column public.eod_submissions.report is
  'For a lead: the eod_report() document for the scope they lead, built once '
  'at submission. The email and the screen both render this row, never a rebuild.';

/* ── The next rung up ─────────────────────────────────────────────────── */
create or replace function public.eod_route_up_for(p_employee uuid)
returns table(lead_id uuid, team_id uuid, team_name text, reason text, level text, scope_id uuid)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_agency uuid;
  v_team   record;
  v_dept   record;
  v_div    record;
  v_exec   uuid;
begin
  select m.agency_id into v_agency
    from public.agency_memberships m where m.user_id = p_employee and m.status = 'active' limit 1;

  /* Division manager → executive. Checked first: the highest thing a person
     holds decides what kind of report they file. */
  select s.division_id, dv.name into v_div
    from public.management_seats s
    join public.divisions dv on dv.id = s.division_id and dv.archived_at is null
   where s.user_id = p_employee and s.seat = 'division_manager'
     and public.seat_is_live(s.effective_from, s.effective_to)
   order by s.effective_from desc limit 1;
  if v_div.division_id is not null then
    select s.user_id into v_exec
      from public.management_seats s
     where s.agency_id = v_agency and s.seat in ('chief_operations', 'managing_partner')
       and s.user_id <> p_employee
       and public.seat_is_live(s.effective_from, s.effective_to)
     order by case s.seat when 'chief_operations' then 0 else 1 end limit 1;
    return query select v_exec, null::uuid, v_div.name,
                        case when v_exec is null then 'unrouted' else 'executive' end,
                        'division', v_div.division_id;
    return;
  end if;

  /* Department manager → division manager. */
  select s.department_id, d.name, d.division_id into v_dept
    from public.management_seats s
    join public.departments d on d.id = s.department_id and d.archived_at is null
   where s.user_id = p_employee and s.seat = 'department_manager'
     and public.seat_is_live(s.effective_from, s.effective_to)
   order by s.effective_from desc limit 1;
  if v_dept.department_id is not null then
    return query
      select s.user_id, null::uuid, v_dept.name,
             case when s.user_id is null then 'unrouted' else 'division_lead' end,
             'department', v_dept.department_id
        from (select null::uuid as user_id) z
        left join lateral (
          select s2.user_id from public.management_seats s2
           where s2.division_id = v_dept.division_id and s2.seat = 'division_manager'
             and s2.user_id <> p_employee
             and public.seat_is_live(s2.effective_from, s2.effective_to)
           order by s2.effective_from desc limit 1) s on true;
    return;
  end if;

  /* Team lead → department manager. */
  select t.id, t.name, t.department_id into v_team
    from public.team_memberships tm
    join public.teams t on t.id = tm.team_id and t.archived_at is null and not t.is_fixture
   where tm.user_id = p_employee and tm.is_lead
   order by t.name limit 1;
  if v_team.id is not null then
    return query
      select s.user_id, v_team.id, v_team.name,
             case when s.user_id is null then 'unrouted' else 'department_lead' end,
             'team', v_team.id
        from (select null::uuid as user_id) z
        left join lateral (
          select s2.user_id from public.management_seats s2
           where s2.department_id = v_team.department_id and s2.seat = 'department_manager'
             and s2.user_id <> p_employee
             and public.seat_is_live(s2.effective_from, s2.effective_to)
           order by s2.effective_from desc limit 1) s on true;
    return;
  end if;

  /* Leads nothing: an agent. Exactly the answer it always got. */
  return query
    select r.lead_id, r.team_id, r.team_name, r.reason, null::text, null::uuid
      from public.eod_route_for(p_employee) r;
end $$;

comment on function public.eod_route_up_for(uuid) is
  'Where a submission goes: one rung up the ladder from whatever the '
  'submitter leads, from management seats. Falls through to eod_route_for '
  'for somebody who leads nothing.';

/* ── Route, and build the report, on the transition into submitted ────── */
create or replace function public.eod_set_routing()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare r record;
begin
  if new.submitted_at is not null
     and (tg_op = 'INSERT' or old.submitted_at is null)
     and new.routing_reason is null then

    select * into r from public.eod_route_up_for(new.employee_id);
    new.routed_to      := r.lead_id;
    new.routed_team_id := r.team_id;
    new.routing_reason := r.reason;

    /* A lead's submission carries the report for what they lead. Built here,
       once, under their own identity. Never allowed to stop the submission. */
    if r.level is not null and r.scope_id is not null then
      new.report_level    := r.level;
      new.report_scope_id := r.scope_id;
      begin
        new.report := public.eod_report(r.level, r.scope_id, new.work_date);
        new.report_error := null;
      exception when others then
        new.report := null;
        new.report_error := sqlerrm;
      end;
    end if;
  end if;
  return new;
end $$;

/* ── The email carries the stored document ────────────────────────────── */
create or replace function public.eod_queue_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_lead    record;
  v_name    text;
  v_state   text := 'pending';
  v_subject text;
  v_support constant text := 'support@blessedempireservices.com';
begin
  if new.submitted_at is null or (tg_op = 'UPDATE' and old.submitted_at is not null) then
    return new;
  end if;

  select coalesce(p.full_name, p.email, 'A team member') into v_name
    from public.profiles p where p.id = new.employee_id;

  select p.id, coalesce(p.full_name, p.email) as name, p.email into v_lead
    from public.profiles p where p.id = new.routed_to;

  /* No recipient resolved: to support as the recipient, reason in the payload,
     exactly as before. */
  if v_lead.email is null then v_state := 'pending'; end if;

  v_subject := case new.report_level
    when 'team'       then 'Team Lead EOD Report - '
    when 'department' then 'Department EOD Report - '
    when 'division'   then 'Division EOD Report - '
    else '' end
    || coalesce(new.report -> 'scope' ->> 'name', v_name)
    || ' - ' || to_char(new.work_date, 'FMMonth FMDD, YYYY');
  if new.report_level is null then
    v_subject := v_name || ' - EOD Report - ' || to_char(new.work_date, 'FMMonth FMDD, YYYY');
  end if;

  insert into public.eod_email_outbox (
    agency_id, eod_id, kind, to_email, to_name, cc_email, subject, payload, state)
  values (
    new.agency_id, new.id, 'submitted',
    coalesce(v_lead.email, v_support),
    coalesce(v_lead.name, 'BES Support'),
    case when v_lead.email is null then null else v_support end,
    v_subject,
    jsonb_build_object(
      'employee_name',   v_name,
      'work_date',       new.work_date,
      'routing_reason',  new.routing_reason,
      'snapshot',        coalesce(new.snapshot, '{}'::jsonb),
      'accomplishments', new.unfinished_work,
      'blockers',        new.blockers,
      'help_needed',     new.escalations,
      'handoff',         new.next_workday_priority,
      'notes',           new.additional_notes,
      /* THE report. Null for an agent; the renderer omits the section. The
         inline team rollup this used to build is gone: one document. */
      'report',          new.report,
      'report_level',    new.report_level,
      'report_error',    new.report_error),
    v_state)
  on conflict (eod_id, kind) do nothing;

  return new;
end $$;

commit;
