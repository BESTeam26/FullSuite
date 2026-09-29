-- A lead of two scopes files two documents.
--
-- Dee, 2026-09-30: "Rowell Christian Pena is responsible for both: CreditOps
-- Division, BES CRM Division… Do not force his reporting/visibility into
-- only one division because one seat happens to be newer." And Daniel holds
-- the department seat for both Complaints & Mailing and Dispute.
--
-- `eod_route_up_for` picked ONE seat — `order by effective_from desc limit
-- 1` — so Rowell's submission carried the report for whichever division he
-- was seated on most recently and silently dropped the other. That is the
-- newer-seat rule Dee rejected.
--
-- ── EVERY SCOPE AT THE HIGHEST RUNG HELD ─────────────────────────────────
--
-- `eod_scopes_led` answers "what does this person lead", one row per scope.
-- The rung is still the highest thing they hold — a division manager files
-- division reports, not also team reports, because the division document
-- already contains its departments and teams as children. But at that rung
-- it returns EVERY scope: two divisions for Rowell, two departments for
-- Daniel. The submission stores `{documents: [...]}` — one canonical
-- `eod_report` document per scope, built by the same function, so nothing
-- is calculated twice (Dee: "Do not maintain two independent calculations").
--
-- ── EXECUTIVES ───────────────────────────────────────────────────────────
--
-- A chief-operations or managing-partner seat, or the owner flag, is the top
-- rung: their scope is the organization, nobody is above them (`reason =
-- 'top'`, never an attention state), and what they RECEIVE is what the
-- division leads submitted — `eod_reports_routed_to_me` reads the stored
-- division documents addressed to them, exactly as filed, rather than a flat
-- dump of every agent. The rule that executives are not measured like
-- agents is untouched: nothing here scores them; it only gives them a
-- document to read.
--
-- ── ONE CALL FROM THE BROWSER ────────────────────────────────────────────
--
-- `eod_my_report(date)` replaces three requests (row, route, lead's name)
-- with one, and is the single place the "stored first, live only before
-- filing" preference is written (rule 14).
--
-- The `report` column keeps its old single-document rows readable: every
-- reader treats a bare document as `{documents: [doc]}`.
--
-- Cost impact: no material increase — one document per scope led, built
-- once at submission, for the handful of people holding more than one seat.

begin;

/* ── What a person leads, every scope of it ──────────────────────────── */
create or replace function public.eod_scopes_led(p_employee uuid)
returns table(level text, scope_id uuid, scope_name text, lead_id uuid, reason text, team_id uuid)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_agency uuid;
  v_exec   uuid;
  v_top    boolean;
begin
  select m.agency_id into v_agency
    from public.agency_memberships m
   where m.user_id = p_employee and m.status = 'active' limit 1;
  if v_agency is null then
    return query select null::text, null::uuid, null::text, null::uuid, 'no_team'::text, null::uuid;
    return;
  end if;

  /* The top rung: the organization, and nobody above. */
  select exists (
      select 1 from public.agency_memberships m
       where m.user_id = p_employee and m.agency_id = v_agency and m.status = 'active' and m.is_owner)
      or exists (
      select 1 from public.management_seats s
        join public.profiles p on p.id = s.user_id and coalesce(p.is_fixture, false) = false
       where s.user_id = p_employee and s.agency_id = v_agency
         and s.seat in ('chief_operations', 'managing_partner')
         and public.seat_is_live(s.effective_from, s.effective_to))
    into v_top;
  if v_top then
    return query
      select 'agency'::text, a.id, a.name, null::uuid, 'top'::text, null::uuid
        from public.agencies a where a.id = v_agency;
    return;
  end if;

  /* The executive every division report goes to. */
  select s.user_id into v_exec
    from public.management_seats s
    join public.profiles p on p.id = s.user_id and coalesce(p.is_fixture, false) = false
   where s.agency_id = v_agency and s.seat in ('chief_operations', 'managing_partner')
     and s.user_id <> p_employee
     and public.seat_is_live(s.effective_from, s.effective_to)
   order by case s.seat when 'chief_operations' then 0 else 1 end limit 1;

  /* Division manager → executive: one row per division held. */
  if exists (
      select 1 from public.management_seats s
        join public.divisions dv on dv.id = s.division_id and dv.archived_at is null
       where s.user_id = p_employee and s.seat = 'division_manager'
         and public.seat_is_live(s.effective_from, s.effective_to)) then
    return query
      select 'division'::text, dv.id, dv.name, v_exec,
             case when v_exec is null then 'unrouted' else 'executive' end, null::uuid
        from public.management_seats s
        join public.divisions dv on dv.id = s.division_id and dv.archived_at is null
       where s.user_id = p_employee and s.seat = 'division_manager'
         and public.seat_is_live(s.effective_from, s.effective_to)
       order by dv.name;
    return;
  end if;

  /* Department manager → that department's division manager: one row per
     department held. */
  if exists (
      select 1 from public.management_seats s
        join public.departments d on d.id = s.department_id and d.archived_at is null
       where s.user_id = p_employee and s.seat = 'department_manager'
         and public.seat_is_live(s.effective_from, s.effective_to)) then
    return query
      select 'department'::text, d.id, d.name, up.user_id,
             case when up.user_id is null then 'unrouted' else 'division_lead' end, null::uuid
        from public.management_seats s
        join public.departments d on d.id = s.department_id and d.archived_at is null
        left join lateral (
          select s2.user_id from public.management_seats s2
            join public.profiles p2 on p2.id = s2.user_id and coalesce(p2.is_fixture, false) = false
           where s2.division_id = d.division_id and s2.seat = 'division_manager'
             and s2.user_id <> p_employee
             and public.seat_is_live(s2.effective_from, s2.effective_to)
           order by s2.effective_from desc limit 1) up on true
       where s.user_id = p_employee and s.seat = 'department_manager'
         and public.seat_is_live(s.effective_from, s.effective_to)
       order by d.name;
    return;
  end if;

  /* Team lead → that team's department manager: one row per team led. */
  if exists (
      select 1 from public.team_memberships tm
        join public.teams t on t.id = tm.team_id and t.archived_at is null and not t.is_fixture
       where tm.user_id = p_employee and tm.is_lead) then
    return query
      select 'team'::text, t.id, t.name, up.user_id,
             case when up.user_id is null then 'unrouted' else 'department_lead' end, t.id
        from public.team_memberships tm
        join public.teams t on t.id = tm.team_id and t.archived_at is null and not t.is_fixture
        left join lateral (
          select s2.user_id from public.management_seats s2
            join public.profiles p2 on p2.id = s2.user_id and coalesce(p2.is_fixture, false) = false
           where s2.department_id = t.department_id and s2.seat = 'department_manager'
             and s2.user_id <> p_employee
             and public.seat_is_live(s2.effective_from, s2.effective_to)
           order by s2.effective_from desc limit 1) up on true
       where tm.user_id = p_employee and tm.is_lead
       order by t.name;
    return;
  end if;

  /* Leads nothing: an agent. Exactly the answer it always got. */
  return query
    select null::text, null::uuid, r.team_name, r.lead_id, r.reason, r.team_id
      from public.eod_route_for(p_employee) r;
end $$;

comment on function public.eod_scopes_led(uuid) is
  'Every scope a person files an EOD report for, at the highest rung they hold: '
  'the organization for an executive, each division for a division manager, '
  'each department for a department manager, each team for a team lead. One '
  'row per scope, with where that report goes.';

revoke all on function public.eod_scopes_led(uuid) from public;
grant execute on function public.eod_scopes_led(uuid) to authenticated;

/* The single-row form, kept for its callers; the first scope by name. */
create or replace function public.eod_route_up_for(p_employee uuid)
returns table(lead_id uuid, team_id uuid, team_name text, reason text, level text, scope_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $$
  select s.lead_id, s.team_id, s.scope_name, s.reason, s.level, s.scope_id
    from public.eod_scopes_led(p_employee) s
   order by s.scope_name nulls last
   limit 1
$$;

/* ── The documents, one per scope ────────────────────────────────────── */
create or replace function public.eod_documents_for(p_employee uuid, p_date date)
returns jsonb
language plpgsql
volatile
set search_path to 'public'
as $$
declare
  s      record;
  v_docs jsonb := '[]'::jsonb;
  v_errs text[] := '{}';
  v_level text;
  v_first uuid;
begin
  for s in select * from public.eod_scopes_led(p_employee) where level is not null order by scope_name loop
    v_level := coalesce(v_level, s.level);
    v_first := coalesce(v_first, s.scope_id);
    begin
      v_docs := v_docs || jsonb_build_array(public.eod_report(s.level, s.scope_id, p_date));
    exception when others then
      v_errs := v_errs || (s.scope_name || ': ' || sqlerrm);
    end;
  end loop;
  return jsonb_build_object(
    'level', v_level, 'scope_id', v_first, 'documents', v_docs,
    'error', case when cardinality(v_errs) = 0 then null else array_to_string(v_errs, '; ') end);
end $$;

comment on function public.eod_documents_for(uuid, date) is
  'Every EOD report document a person files for a day — one eod_report() per '
  'scope they lead. Nothing is calculated here; eod_report() is the one place '
  'production is summed. Invoker rights: eod_report gates on the caller''s visibility.';

revoke all on function public.eod_documents_for(uuid, date) from public;
grant execute on function public.eod_documents_for(uuid, date) to authenticated;

/* ── Route, and build every document, on the transition into submitted ─ */
create or replace function public.eod_set_routing()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r     record;
  v_out jsonb;
begin
  if new.submitted_at is not null
     and (tg_op = 'INSERT' or old.submitted_at is null) then

    select * into r from public.eod_route_up_for(new.employee_id);
    new.routed_to      := r.lead_id;
    new.routed_team_id := r.team_id;
    new.routing_reason := r.reason;

    if r.level is not null and r.scope_id is not null then
      new.report_level    := r.level;
      new.report_scope_id := r.scope_id;
      begin
        v_out := public.eod_documents_for(new.employee_id, new.work_date);
        new.report       := jsonb_build_object('documents', v_out -> 'documents');
        new.report_error := v_out ->> 'error';
      exception when others then
        new.report := null;
        new.report_error := sqlerrm;
      end;
    else
      new.report_level    := null;
      new.report_scope_id := null;
      new.report          := null;
      new.report_error    := null;
    end if;
  end if;
  return new;
end $$;

/* ── The email carries every document ────────────────────────────────── */
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
  v_scopes  text;
  v_count   int;
  v_support constant text := 'support@blessedempireservices.com';
begin
  if new.submitted_at is null or (tg_op = 'UPDATE' and old.submitted_at is not null) then
    return new;
  end if;

  select coalesce(p.full_name, p.email, 'A team member') into v_name
    from public.profiles p where p.id = new.employee_id;

  select p.id, coalesce(p.full_name, p.email) as name, p.email into v_lead
    from public.profiles p where p.id = new.routed_to;

  if v_lead.email is null then v_state := 'pending'; end if;

  /* Subject from the documents: one scope, or every scope named. Old rows
     hold a bare document; both shapes are read. */
  select string_agg(d -> 'scope' ->> 'name', ', ' order by d -> 'scope' ->> 'name'), count(*)
    into v_scopes, v_count
    from jsonb_array_elements(
      case when new.report ? 'documents' then new.report -> 'documents'
           when new.report is null then '[]'::jsonb
           else jsonb_build_array(new.report) end) d;

  v_subject := case new.report_level
    when 'team'       then 'Team Lead EOD Report'
    when 'department' then 'Department EOD Report'
    when 'division'   then 'Division EOD Report'
    when 'agency'     then 'Organization EOD Report'
    else '' end
    || case when coalesce(v_count, 0) > 1 then 's' else '' end
    || ' - ' || coalesce(v_scopes, v_name)
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
      'report',          new.report,
      'report_level',    new.report_level,
      'report_error',    new.report_error),
    v_state)
  on conflict (eod_id, kind) do nothing;

  return new;
end $$;

/* ── One call for the caller's own report ────────────────────────────── */
create or replace function public.eod_my_report(p_date date)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_me    uuid := auth.uid();
  v_row   record;
  v_route record;
  v_lead  text;
  v_live  jsonb;
begin
  if v_me is null then
    raise exception 'eod_my_report: not signed in' using errcode = '42501';
  end if;

  select * into v_route from public.eod_route_up_for(v_me);
  if v_route.lead_id is not null then
    select coalesce(p.full_name, p.email) into v_lead from public.profiles p where p.id = v_route.lead_id;
  end if;

  select e.submitted_at, e.report, e.report_level, e.report_error, e.routing_reason
    into v_row
    from public.eod_submissions e
   where e.employee_id = v_me and e.work_date = p_date;

  /* Stored: what the lead filed, exactly what their manager received. */
  if v_row.report is not null then
    return jsonb_build_object(
      'stored', true,
      'level', v_row.report_level,
      'documents', case when v_row.report ? 'documents' then v_row.report -> 'documents'
                        else jsonb_build_array(v_row.report) end,
      'submitted_at', v_row.submitted_at,
      'error', v_row.report_error,
      'routing', jsonb_build_object('reason', coalesce(v_row.routing_reason, v_route.reason),
                                    'lead_id', v_route.lead_id, 'lead_name', v_lead));
  end if;

  /* Nothing stored: an agent, or a lead who has not filed. Build live only
     for somebody who leads a scope — "what my report looks like so far". */
  if v_route.level is null then
    return jsonb_build_object(
      'stored', false, 'level', null, 'documents', '[]'::jsonb,
      'submitted_at', v_row.submitted_at, 'error', v_row.report_error,
      'routing', jsonb_build_object('reason', coalesce(v_row.routing_reason, v_route.reason),
                                    'lead_id', v_route.lead_id, 'lead_name', v_lead));
  end if;

  v_live := public.eod_documents_for(v_me, p_date);
  return jsonb_build_object(
    'stored', false,
    'level', v_live ->> 'level',
    'documents', v_live -> 'documents',
    'submitted_at', v_row.submitted_at,
    'error', coalesce(v_row.report_error, v_live ->> 'error'),
    'routing', jsonb_build_object('reason', coalesce(v_row.routing_reason, v_route.reason),
                                  'lead_id', v_route.lead_id, 'lead_name', v_lead));
end $$;

comment on function public.eod_my_report(date) is
  'The caller''s own EOD report for a day, in one request: the stored documents '
  'off their submission when they have filed, a live build of every scope they '
  'lead when they have not, and where it goes. Definer only to name the lead; '
  'the documents themselves are gated inside eod_report on the caller''s visibility.';

revoke all on function public.eod_my_report(date) from public;
grant execute on function public.eod_my_report(date) to authenticated;

/* ── What was submitted TO the caller ────────────────────────────────── */
create or replace function public.eod_reports_routed_to_me(p_date date)
returns table(eod_id uuid, employee_id uuid, employee_name text, report_level text,
              documents jsonb, submitted_at timestamptz, report_error text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select e.id, e.employee_id, coalesce(p.full_name, p.email), e.report_level,
         case when e.report ? 'documents' then e.report -> 'documents'
              else jsonb_build_array(e.report) end,
         e.submitted_at, e.report_error
    from public.eod_submissions e
    join public.profiles p on p.id = e.employee_id
   where e.routed_to = auth.uid()
     and e.work_date = p_date
     and e.submitted_at is not null
     and e.report is not null
   order by e.report_level, coalesce(p.full_name, p.email)
$$;

comment on function public.eod_reports_routed_to_me(date) is
  'The stored report documents addressed to the caller for a day — a division '
  'manager reads the department reports filed to them, an executive the division '
  'reports. Addressed-to is the authorization: a report routed to you is yours to read.';

revoke all on function public.eod_reports_routed_to_me(date) from public;
grant execute on function public.eod_reports_routed_to_me(date) to authenticated;

/* ── Proof on today's structure ──────────────────────────────────────── */
do $$
declare v_n int; v_lvl text;
begin
  select count(*), min(level) into v_n, v_lvl from public.eod_scopes_led(
    (select id from public.profiles where full_name = 'Rowell Christian Pena' limit 1));
  if v_n <> 2 or v_lvl <> 'division' then
    raise exception 'Rowell should file 2 division documents, got % at %', v_n, v_lvl;
  end if;
  select count(*), min(level) into v_n, v_lvl from public.eod_scopes_led(
    (select id from public.profiles where full_name like 'Daniel Charles%' limit 1));
  if v_n <> 2 or v_lvl <> 'department' then
    raise exception 'Daniel should file 2 department documents, got % at %', v_n, v_lvl;
  end if;
  select count(*), min(level) into v_n, v_lvl from public.eod_scopes_led(
    (select id from public.profiles where full_name = 'Aaron Gallardo' limit 1));
  if v_n <> 1 or v_lvl <> 'agency' then
    raise exception 'Aaron (chief operations) should hold the organization, got % at %', v_n, v_lvl;
  end if;
  select count(*) filter (where level is not null) into v_n from public.eod_scopes_led(
    (select id from public.profiles where full_name = 'JM Navales' limit 1));
  if v_n <> 0 then
    raise exception 'JM (executive assistant) leads no EOD scope, got %', v_n;
  end if;
  raise notice 'scopes: Rowell 2 divisions, Daniel 2 departments, Aaron the organization, JM none';
end $$;

commit;
