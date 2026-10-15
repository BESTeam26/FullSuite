-- A lead's EOD report is final at the cutoff, and counts every lead below.
--
-- Dee, 2026-10-15, on her Organization End of Day email: "I keep seeing 0
-- when there should be some report. This is not accurate." Found on the
-- live row for 2026-10-15 (three causes, one defect):
--
--   1. FROZEN AT SUBMIT. The lead's document is built once, when they press
--      Submit (eod_set_routing), and the email goes out with it. Dee filed
--      at 11:23 AM Eastern; nothing her team did after that could reach the
--      stored report, the email, or the Team EOD screen, which shows the
--      stored copy. Every figure for the rest of the day was 0 forever.
--   2. LEADS LEFT OUT. eod_report() excluded EVERY team lead from the
--      people of a scope ("the lead's own day is Part 1"). Right for the
--      team they lead; wrong one rung up. Danicko (lead of the Dispute
--      team) and Daniel (Dispute Department manager) were members of
--      nothing in the organization report, so their production could never
--      reach "Total Blessed Empire Services output".
--   3. COUNTED TWICE. A person in two teams of one unit (Aaron: Admin and
--      Management) had their units added once per membership in that
--      unit's row and in the summary by work type.
--
-- What changes, and nothing else:
--
--   A. eod_report(): a person is a row of every report ABOVE the rung they
--      file at (eod_scopes_led) — a team lead is a member of their
--      department, division and organization; a department manager of their
--      division and organization; an executive files the organization
--      report and is a row of nothing. At team level the rule is unchanged.
--      Units are counted once per person per unit.
--   B. eod_finalize_reports(): after the agency's cutoff, every lead
--      submission for that day is rebuilt — the day's snapshot and the
--      documents, with the whole day in them — marked report_final_at, and
--      ONE "final" email is queued (outbox kind 'final'; the unique index
--      on (eod_id, kind) makes a second impossible). It runs from the
--      existing 15-minute sweep, after the auto-submissions, which also
--      gives an auto-submitted lead report its document: built by cron it
--      had none, because eod_report gates on auth.uid() and cron has no
--      caller. The rebuild runs AS THE LEAD — their own claims, set for the
--      transaction — so it is exactly the document they could build
--      themselves; no visibility is widened.
--   C. eod_my_report(): while the day is still open, a lead who has
--      already submitted sees a live build, not the copy frozen at submit.
--      Bounded to the scopes they lead, as the pre-submission preview
--      already was.
--   D. The lead's "submitted" email, when filed before the cutoff, carries
--      report_stage = 'interim' so the mail can say its team figures are
--      as of that time and the final report follows (Edge Function).
--
-- Agents' own reports are untouched: no report, no rebuild, no extra mail.
--
-- Cost scales with: one rebuild per lead report per day (three or four at
-- BES) and one extra email per lead report per day.

begin;

/* ── A. Who is a row of which report ─────────────────────────────────── */

create or replace function public.eod_rung_rank(p_user uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  /* 4 organization, 3 division, 2 department, 1 team, 0 files for no scope. */
  select coalesce(max(case s.level when 'agency' then 4 when 'division' then 3
                                   when 'department' then 2 when 'team' then 1 else 0 end), 0)
    from public.eod_scopes_led(p_user) s
$$;
comment on function public.eod_rung_rank(uuid) is
  'The rung a person files their EOD report at: 4 organization, 3 division, 2 department, 1 team, 0 none. A person is a row of every report above their rung.';
revoke all on function public.eod_rung_rank(uuid) from public, anon;
grant execute on function public.eod_rung_rank(uuid) to authenticated;

create or replace function public.eod_report(
  p_level    text,     -- 'team' | 'department' | 'division' | 'agency'
  p_scope_id uuid,     -- team id / department id / division id / agency id
  p_date     date
)
returns jsonb
language plpgsql
/* VOLATILE, not STABLE, and on purpose: it builds two temporary tables for
   the scope, and Postgres refuses CREATE TABLE inside a non-volatile
   function. It writes nothing durable. The cost is only that the planner
   cannot inline it — irrelevant for a function never called in a hot path. */
security definer
set search_path to 'public'
as $$
declare
  v_agency     uuid;
  v_service    public.fulfillment_service;
  v_scope_name text;
  v_lead_id    uuid;
  v_lead_name  text;
  v_categories jsonb;
  v_rows       jsonb;
  v_groups     jsonb;
  v_totals     jsonb;
  v_attention  jsonb;
  v_children   jsonb;
  v_child_ids  uuid[];
  v_child_names text[];
begin
  if p_level not in ('team', 'department', 'division', 'agency') then
    raise exception 'eod_report: unknown level %', p_level using errcode = '22023';
  end if;

  /* ── Resolve the scope, its service, and who leads it ───────────────── */
  if p_level = 'team' then
    select t.agency_id, t.name, coalesce(d.division::text, dv.service::text)::public.fulfillment_service
      into v_agency, v_scope_name, v_service
      from public.teams t
      left join public.departments d on d.id = t.department_id
      left join public.divisions dv on dv.id = d.division_id
     where t.id = p_scope_id and t.archived_at is null;
    select tm.user_id into v_lead_id
      from public.team_memberships tm
     where tm.team_id = p_scope_id and tm.is_lead
     order by tm.user_id limit 1;
  elsif p_level = 'department' then
    select d.agency_id, d.name, coalesce(d.division::text, dv.service::text)::public.fulfillment_service
      into v_agency, v_scope_name, v_service
      from public.departments d
      left join public.divisions dv on dv.id = d.division_id
     where d.id = p_scope_id and d.archived_at is null;
    select s.user_id into v_lead_id
      from public.management_seats s
     where s.department_id = p_scope_id and s.seat = 'department_manager'
       and public.seat_is_live(s.effective_from, s.effective_to)
     order by s.effective_from desc limit 1;
  elsif p_level = 'division' then
    select dv.agency_id, dv.name, dv.service
      into v_agency, v_scope_name, v_service
      from public.divisions dv
     where dv.id = p_scope_id and dv.archived_at is null;
    select s.user_id into v_lead_id
      from public.management_seats s
     where s.division_id = p_scope_id and s.seat = 'division_manager'
       and public.seat_is_live(s.effective_from, s.effective_to)
     order by s.effective_from desc limit 1;
  else
    select a.id, a.name into v_agency, v_scope_name from public.agencies a where a.id = p_scope_id;
    v_service := null;
    select s.user_id into v_lead_id
      from public.management_seats s
     where s.agency_id = p_scope_id and s.seat in ('chief_operations', 'managing_partner')
       and public.seat_is_live(s.effective_from, s.effective_to)
     order by case s.seat when 'chief_operations' then 0 else 1 end limit 1;
  end if;

  if v_agency is null then
    raise exception 'eod_report: no live % with id %', p_level, p_scope_id using errcode = '22023';
  end if;

  select coalesce(p.full_name, p.email) into v_lead_name from public.profiles p where p.id = v_lead_id;

  /* ── The people in scope, and the gate ──────────────────────────────── */
  /* One temp set of (employee, team, department, division) for the whole
     scope. Built once; every level below reads it. */
  create temporary table if not exists eod_scope_people (
    user_id uuid, user_name text, role text,
    team_id uuid, team_name text,
    department_id uuid, department_name text,
    division_id uuid, division_name text
  ) on commit drop;
  truncate eod_scope_people;

  insert into eod_scope_people
  select distinct on (tm.user_id, t.id)
         tm.user_id, coalesce(p.full_name, p.email, 'Unknown'),
         coalesce(nullif(m.job_title, ''), d.name, t.name),
         t.id, t.name, d.id, d.name, dv.id, dv.name
    from public.team_memberships tm
    join public.teams t on t.id = tm.team_id and t.archived_at is null and not t.is_fixture
    join public.profiles p on p.id = tm.user_id and coalesce(p.is_fixture, false) = false
    join public.agency_memberships m on m.user_id = tm.user_id and m.status = 'active'
    left join public.departments d on d.id = t.department_id
    left join public.divisions dv on dv.id = d.division_id
   where t.agency_id = v_agency
     /* A person is a row of every report ABOVE the rung they file at: a team
        lead files the team report (their own day is its Part 1) and is a
        member of the department, division and organization; a department
        manager likewise one rung up; an executive files the organization
        report and is a row of nothing. Was "never a lead", which dropped
        every lead's production from every total above their team. */
     and public.eod_rung_rank(tm.user_id)
         < case p_level when 'team' then 1 when 'department' then 2 when 'division' then 3 else 4 end
     and case p_level
           when 'team'       then t.id = p_scope_id
           when 'department' then d.id = p_scope_id
           when 'division'   then dv.id = p_scope_id
           else true
         end;

  /* Default to deny: every person in the scope must be somebody the caller
     may see under the EOD ladder. Not "the caller holds a capability". */
  if exists (
    select 1 from eod_scope_people sp
     where sp.user_id not in (select employee_id from public.eod_visible_people())
  ) then
    raise exception 'eod_report: this scope includes people outside your EOD visibility'
      using errcode = '42501';
  end if;

  /* ── Dynamic categories: the production departments for this service ── */
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', pd.key, 'label', pd.label, 'position', pd.position)
           order by pd.position, pd.key), '[]'::jsonb)
    into v_categories
    from public.production_departments pd
   where v_service is null or pd.service = v_service;

  /* ── The numbers, per person per category, from production_logs only ── */
  create temporary table if not exists eod_scope_units (
    user_id uuid, category text, units int
  ) on commit drop;
  truncate eod_scope_units;

  insert into eod_scope_units
  select pl.employee_id, coalesce(pl.department_key, pl.production_unit_type),
         sum(pl.production_unit_quantity)::int
    from public.production_logs pl
   where pl.work_date = p_date and not pl.is_voided
     and pl.employee_id in (select user_id from eod_scope_people)
     and (v_service is null or pl.service = v_service)
   group by 1, 2;

  /* ── Rows ───────────────────────────────────────────────────────────── */
  if p_level = 'team' then
    /* One row per agent: name, role, each category, total, their own words. */
    select coalesce(jsonb_agg(row_doc order by (row_doc ->> 'name')), '[]'::jsonb)
      into v_rows
      from (
        select jsonb_build_object(
          'id',         sp.user_id,
          'name',       sp.user_name,
          'role',       sp.role,
          'submitted',  e.submitted_at is not null,
          'auto_submitted', coalesce(e.auto_submitted, false),
          'state',      coalesce(e.state::text, 'not_started'),
          'submitted_at', e.submitted_at,
          'categories', coalesce((select jsonb_object_agg(u.category, u.units)
                                    from eod_scope_units u where u.user_id = sp.user_id), '{}'::jsonb),
          'total',      coalesce((select sum(u.units) from eod_scope_units u where u.user_id = sp.user_id), 0),
          'notes',      e.additional_notes,
          'blockers',   e.blockers,
          'help_needed', e.escalations,
          'handoff',    e.next_workday_priority
        ) as row_doc
        from eod_scope_people sp
        left join public.eod_submissions e
               on e.employee_id = sp.user_id and e.work_date = p_date
      ) r;
  else
    /* One row per CHILD UNIT, each a total of the level below. */
    select coalesce(jsonb_agg(row_doc order by (row_doc ->> 'name')), '[]'::jsonb)
      into v_rows
      from (
        select jsonb_build_object(
          'id',   c.child_id,
          'name', c.child_name,
          'role', case p_level when 'department' then 'Team'
                               when 'division'   then 'Department'
                               else 'Division' end,
          'members',   (select count(distinct sp.user_id) from eod_scope_people sp
                         where case p_level when 'department' then sp.team_id
                                            when 'division'   then sp.department_id
                                            else sp.division_id end = c.child_id),
          'submitted', (select count(distinct sp.user_id) from eod_scope_people sp
                         join public.eod_submissions e on e.employee_id = sp.user_id
                          and e.work_date = p_date and e.submitted_at is not null
                         where case p_level when 'department' then sp.team_id
                                            when 'division'   then sp.department_id
                                            else sp.division_id end = c.child_id),
          /* A person in two teams of one unit (Aaron: Admin and Management)
             is counted once in that unit: membership in the set, not a join. */
          'categories', coalesce((select jsonb_object_agg(x.category, x.units) from (
                            select u.category, sum(u.units) as units
                              from eod_scope_units u
                             where u.user_id in (select sp.user_id from eod_scope_people sp
                                                  where case p_level when 'department' then sp.team_id
                                                                     when 'division'   then sp.department_id
                                                                     else sp.division_id end = c.child_id)
                             group by u.category) x), '{}'::jsonb),
          'total', coalesce((select sum(u.units)
                               from eod_scope_units u
                              where u.user_id in (select sp.user_id from eod_scope_people sp
                                                   where case p_level when 'department' then sp.team_id
                                                                      when 'division'   then sp.department_id
                                                                      else sp.division_id end = c.child_id)), 0)
        ) as row_doc
        from (
          select distinct
                 case p_level when 'department' then sp.team_id
                              when 'division'   then sp.department_id
                              else sp.division_id end as child_id,
                 case p_level when 'department' then sp.team_name
                              when 'division'   then sp.department_name
                              else sp.division_name end as child_name
            from eod_scope_people sp
        ) c
        where c.child_id is not null
      ) r;
  end if;

  /* ── Groups: the summary by work type, the way Dee's report reads ───── */
  /* "Processor Team — Alvaro completed 9 processes … Total: 27". Grouped by
     category, one line per person (team) or per unit (above), with the
     group's total. A category with no units that day is omitted rather than
     shown as a list of zeros. */
  select coalesce(jsonb_agg(g order by (g ->> 'position')::int, g ->> 'label'), '[]'::jsonb)
    into v_groups
    from (
      select jsonb_build_object(
        'key',      cat.key,
        'label',    cat.label,
        'position', cat.position,
        'lines',    (select jsonb_agg(jsonb_build_object('name', l.name, 'units', l.units)
                                      order by l.units desc, l.name)
                       from (
                         select sp.name, sum(u.units) as units
                           from eod_scope_units u
                           join (select distinct p.user_id,
                                        case when p_level = 'team' then p.user_name
                                             when p_level = 'department' then p.team_name
                                             when p_level = 'division'   then p.department_name
                                             else p.division_name end as name
                                   from eod_scope_people p) sp on sp.user_id = u.user_id
                          where u.category = cat.key
                          group by 1) l),
        'total',    (select coalesce(sum(u.units), 0) from eod_scope_units u where u.category = cat.key)
      ) as g
      from public.production_departments cat
     where (v_service is null or cat.service = v_service)
       and exists (select 1 from eod_scope_units u where u.category = cat.key)
    ) gg;

  /* ── Totals, and who needs attention ────────────────────────────────── */
  select jsonb_build_object(
    'categories', coalesce((select jsonb_object_agg(x.category, x.units)
                              from (select category, sum(units) as units from eod_scope_units group by 1) x), '{}'::jsonb),
    'total',      coalesce((select sum(units) from eod_scope_units), 0),
    'members',    (select count(distinct user_id) from eod_scope_people),
    'submitted',  (select count(distinct sp.user_id) from eod_scope_people sp
                    join public.eod_submissions e on e.employee_id = sp.user_id
                     and e.work_date = p_date and e.submitted_at is not null),
    'not_submitted', (select count(distinct sp.user_id) from eod_scope_people sp
                       where not exists (select 1 from public.eod_submissions e
                                          where e.employee_id = sp.user_id and e.work_date = p_date
                                            and e.submitted_at is not null))
  ) into v_totals;

  select coalesce(jsonb_agg(jsonb_build_object(
           'name', sp.user_name, 'unit', sp.team_name,
           'blockers', e.blockers, 'help_needed', e.escalations)
           order by sp.user_name), '[]'::jsonb)
    into v_attention
    from eod_scope_people sp
    join public.eod_submissions e on e.employee_id = sp.user_id and e.work_date = p_date
   where nullif(btrim(coalesce(e.blockers, '')), '') is not null
      or nullif(btrim(coalesce(e.escalations, '')), '') is not null;

  /* ── Children, for drill-down. One level down only. ─────────────────── */
  /* The level above never re-lists agents; it embeds the child documents, so
     a manager who wants Department → Team → Agent opens them in FullSuite.

     THE ORDER HERE IS THE FIX. The first version enumerated child ids with a
     query over `eod_scope_people` and called `eod_report` for each INSIDE that
     query — and each recursive call truncates the same temp table, which
     Postgres refuses while the outer scan is still reading it ("cannot
     TRUNCATE … being used by active queries"). So the child list is collected
     into arrays first, that scan completes, and only then does the loop
     recurse. */
  v_children := '[]'::jsonb;
  if p_level <> 'team' then
    select array_agg(c.child_id order by c.child_name), array_agg(c.child_name order by c.child_name)
      into v_child_ids, v_child_names
      from (
        select distinct
               case p_level when 'department' then sp.team_id
                            when 'division'   then sp.department_id
                            else sp.division_id end as child_id,
               case p_level when 'department' then sp.team_name
                            when 'division'   then sp.department_name
                            else sp.division_name end as child_name
          from eod_scope_people sp
      ) c
      where c.child_id is not null;

    if v_child_ids is not null then
      for i in 1 .. array_length(v_child_ids, 1) loop
        v_children := v_children || jsonb_build_array(public.eod_report(
          case p_level when 'department' then 'team'
                       when 'division'   then 'department'
                       else 'division' end,
          v_child_ids[i], p_date));
      end loop;
    end if;
  end if;

  return jsonb_build_object(
    'level',      p_level,
    'work_date',  p_date,
    'timezone',   'America/New_York',
    'scope',      jsonb_build_object('id', p_scope_id, 'name', v_scope_name, 'service', v_service),
    'lead',       jsonb_build_object('id', v_lead_id, 'name', v_lead_name),
    'categories', v_categories,
    'rows',       v_rows,
    'groups',     v_groups,
    'totals',     v_totals,
    'attention',  v_attention,
    'children',   v_children,
    'built_at',   now()
  );
end $$;

/* ── B. The email, callable for a row and a kind ─────────────────────── */

alter table public.eod_submissions
  add column if not exists report_final_at timestamptz;
comment on column public.eod_submissions.report_final_at is
  'When a lead''s documents were rebuilt after the cutoff with the whole day in them. Null until then; agents never have one.';

create or replace function public.eod_queue_email_for(e public.eod_submissions, p_kind text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_lead    record;
  v_name    text;
  v_subject text;
  v_scopes  text;
  v_count   int;
  v_stage   text;
  v_support constant text := 'support@blessedempireservices.com';
begin
  select coalesce(p.full_name, p.email, 'A team member') into v_name
    from public.profiles p where p.id = e.employee_id;

  select p.id, coalesce(p.full_name, p.email) as name, p.email into v_lead
    from public.profiles p where p.id = e.routed_to;

  select string_agg(d -> 'scope' ->> 'name', ', ' order by d -> 'scope' ->> 'name'), count(*)
    into v_scopes, v_count
    from jsonb_array_elements(
      case when e.report ? 'documents' then e.report -> 'documents'
           when e.report is null then '[]'::jsonb
           else jsonb_build_array(e.report) end) d;

  v_subject := case e.report_level
    when 'team'       then 'Team Lead EOD Report'
    when 'department' then 'Department EOD Report'
    when 'division'   then 'Division EOD Report'
    when 'agency'     then 'Organization EOD Report'
    else '' end
    || case when coalesce(v_count, 0) > 1 then 's' else '' end
    || ' - ' || coalesce(v_scopes, v_name)
    || ' - ' || to_char(e.work_date, 'FMMonth FMDD, YYYY');
  if e.report_level is null then
    v_subject := v_name || ' - EOD Report - ' || to_char(e.work_date, 'FMMonth FMDD, YYYY');
  end if;

  /* An agent's mail is their day. A lead's is interim until the cutoff has
     rebuilt it, then final — and the final one says so in the subject. */
  v_stage := case when e.report_level is null then null
                  when p_kind = 'final' or e.report_final_at is not null then 'final'
                  else 'interim' end;
  if p_kind = 'final' then
    v_subject := v_subject || ' (final)';
  end if;

  insert into public.eod_email_outbox (
    agency_id, eod_id, kind, to_email, to_name, cc_email, subject, payload, state)
  values (
    e.agency_id, e.id, p_kind,
    coalesce(v_lead.email, v_support),
    coalesce(v_lead.name, 'BES Support'),
    case when v_lead.email is null then null else v_support end,
    v_subject,
    jsonb_build_object(
      'employee_name',   v_name,
      'work_date',       e.work_date,
      'routing_reason',  e.routing_reason,
      'snapshot',        coalesce(e.snapshot, '{}'::jsonb),
      'accomplishments', e.unfinished_work,
      'blockers',        e.blockers,
      'help_needed',     e.escalations,
      'handoff',         e.next_workday_priority,
      'notes',           e.additional_notes,
      'report',          e.report,
      'report_level',    e.report_level,
      'report_error',    e.report_error,
      'report_stage',    v_stage,
      'built_at',        now()),
    'pending')
  on conflict (eod_id, kind) do nothing;
end $$;
revoke all on function public.eod_queue_email_for(public.eod_submissions, text) from public, anon, authenticated;

/* The trigger is now the thin wrapper: the same row, the 'submitted' kind. */
create or replace function public.eod_queue_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.submitted_at is null or (tg_op = 'UPDATE' and old.submitted_at is not null) then
    return new;
  end if;
  perform public.eod_queue_email_for(new, 'submitted');
  return new;
end $$;

/* ── B. The rebuild after the cutoff ─────────────────────────────────── */

create or replace function public.eod_finalize_reports()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  a       record;
  r       record;
  v_row   public.eod_submissions;
  v_out   jsonb;
  v_snap  jsonb;
  v_count int := 0;
begin
  for a in
    select id, eod_cutoff_local, coalesce(eod_timezone, 'America/New_York') as tz
      from public.agencies
     where eod_cutoff_local is not null
  loop
    for r in
      select e.id, e.employee_id, e.work_date
        from public.eod_submissions e
       where e.agency_id = a.id
         and e.submitted_at is not null
         and e.report_level is not null
         and e.report_final_at is null
         and e.work_date >= date '2026-10-15'      -- from the day the rule began
         and ((e.work_date + a.eod_cutoff_local) at time zone a.tz) < now()
       order by e.work_date, e.employee_id
    loop
      /* eod_report() gates on the caller's EOD visibility. The caller here is
         the lead whose report this is: their claims, for this transaction,
         build exactly the document they could build themselves. */
      perform set_config('request.jwt.claims',
                         json_build_object('sub', r.employee_id, 'role', 'authenticated')::text, true);
      begin
        v_snap := public.eod_day_activity(r.employee_id, r.work_date);
      exception when others then
        v_snap := null;
      end;
      begin
        v_out := public.eod_documents_for(r.employee_id, r.work_date);
        update public.eod_submissions
           set snapshot        = coalesce(v_snap, snapshot),
               report          = jsonb_build_object('documents', v_out -> 'documents'),
               report_error    = v_out ->> 'error',
               report_final_at = now()
         where id = r.id;
      exception when others then
        /* Reported once, through the email, rather than retried every
           fifteen minutes forever. */
        update public.eod_submissions
           set report_error = sqlerrm, report_final_at = now()
         where id = r.id;
      end;
      select * into v_row from public.eod_submissions where id = r.id;
      perform public.eod_queue_email_for(v_row, 'final');
      v_count := v_count + 1;
    end loop;
  end loop;
  perform set_config('request.jwt.claims', '', true);
  return v_count;
end $$;
revoke all on function public.eod_finalize_reports() from public, anon, authenticated;
comment on function public.eod_finalize_reports() is
  'Cron, after the auto-submissions: rebuilds every lead''s EOD documents for a day whose cutoff has passed, with the whole day in them, and queues the one final email. Idempotent through report_final_at.';

/* The sweep runs the auto-submissions first, then the rebuild, so an
   auto-submitted lead report is finalised in the same pass. */
create or replace function public.eod_auto_submit_sweep()
returns integer
language plpgsql security definer set search_path = public as $function$
declare
  a record;
  r record;
  v_count int := 0;
begin
  for a in
    select id, eod_cutoff_local, coalesce(eod_timezone, 'America/New_York') as tz
      from public.agencies
     where coalesce(eod_auto_submit, false) and eod_cutoff_local is not null
  loop
    for r in
      with due as (
        select e.id
          from public.eod_submissions e
         where e.agency_id = a.id
           and e.submitted_at is null
           and ((e.work_date + a.eod_cutoff_local) at time zone a.tz) < now()
           and e.work_date >= date '2026-10-15'
      ),
      done as (
        update public.eod_submissions e
           set state          = 'submitted',
               submitted_at   = now(),
               auto_submitted = true,
               submitted_by   = null
          from due
         where e.id = due.id
        returning e.id, e.employee_id, e.work_date
      )
      select * from done
    loop
      v_count := v_count + 1;

      insert into public.notifications
        (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
      values
        (r.employee_id, a.id, 'reminder', 'eod_day', r.work_date::text || ':auto_submitted', 'End of Day',
         'Your End of Day was auto-submitted',
         'Your EOD for ' || to_char(r.work_date, 'FMMon DD') || ' was not submitted by the midnight cutoff, so the system submitted it as it stood. It is marked Auto-submitted.',
         'bes_internal')
      on conflict do nothing;

      insert into public.notifications
        (recipient_id, agency_id, kind, entity_type, entity_id, entity_label, title, detail, visibility)
      select distinct lead_m.user_id, a.id, 'reminder', 'eod_day',
             r.work_date::text || ':auto_submitted:' || r.employee_id::text, 'End of Day',
             coalesce(p.full_name, 'A team member') || '''s End of Day was auto-submitted',
             'The EOD for ' || to_char(r.work_date, 'FMMon DD') || ' was not submitted by the midnight cutoff and was submitted by the system as it stood. It is marked Auto-submitted.',
             'bes_internal'::public.activity_visibility
        from public.team_memberships member_m
        join public.team_memberships lead_m on lead_m.team_id = member_m.team_id and lead_m.is_lead
        join public.teams t on t.id = member_m.team_id and t.archived_at is null
        left join public.profiles p on p.id = r.employee_id
       where member_m.user_id = r.employee_id
         and lead_m.user_id <> r.employee_id
      on conflict do nothing;
    end loop;
  end loop;

  perform public.eod_finalize_reports();
  return v_count;
end $function$;
revoke all on function public.eod_auto_submit_sweep() from public, anon, authenticated;

/* ── C. The lead's own view while the day is open ────────────────────── */

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
  v_open  boolean := false;
begin
  if v_me is null then
    raise exception 'eod_my_report: not signed in' using errcode = '42501';
  end if;

  select * into v_route from public.eod_route_up_for(v_me);
  if v_route.lead_id is not null then
    select coalesce(p.full_name, p.email) into v_lead from public.profiles p where p.id = v_route.lead_id;
  end if;

  select e.submitted_at, e.report, e.report_level, e.report_error, e.routing_reason, e.report_final_at,
         ((e.work_date + coalesce(a.eod_cutoff_local, time '24:00'))
            at time zone coalesce(a.eod_timezone, 'America/New_York')) > now() as day_open
    into v_row
    from public.eod_submissions e
    join public.agencies a on a.id = e.agency_id
   where e.employee_id = v_me and e.work_date = p_date;

  /* Stored and final: exactly what their manager received. Stored but the
     day still open: the copy frozen at submit is stale, so a lead sees the
     live build until the cutoff finalises it (Dee, 2026-10-15). */
  v_open := coalesce(v_row.day_open, false) and v_row.report_final_at is null;
  if v_row.report is not null and not v_open then
    return jsonb_build_object(
      'stored', true,
      'final_at', v_row.report_final_at,
      'level', v_row.report_level,
      'documents', case when v_row.report ? 'documents' then v_row.report -> 'documents'
                        else jsonb_build_array(v_row.report) end,
      'submitted_at', v_row.submitted_at,
      'error', v_row.report_error,
      'routing', jsonb_build_object('reason', coalesce(v_row.routing_reason, v_route.reason),
                                    'lead_id', v_route.lead_id, 'lead_name', v_lead));
  end if;

  if v_route.level is null then
    return jsonb_build_object(
      'stored', false, 'final_at', null, 'level', null, 'documents', '[]'::jsonb,
      'submitted_at', v_row.submitted_at, 'error', v_row.report_error,
      'routing', jsonb_build_object('reason', coalesce(v_row.routing_reason, v_route.reason),
                                    'lead_id', v_route.lead_id, 'lead_name', v_lead));
  end if;

  v_live := public.eod_documents_for(v_me, p_date);
  return jsonb_build_object(
    'stored', false,
    'final_at', null,
    'level', v_live ->> 'level',
    'documents', v_live -> 'documents',
    'submitted_at', v_row.submitted_at,
    'error', coalesce(v_row.report_error, v_live ->> 'error'),
    'routing', jsonb_build_object('reason', coalesce(v_row.routing_reason, v_route.reason),
                                  'lead_id', v_route.lead_id, 'lead_name', v_lead));
end $$;
revoke all on function public.eod_my_report(date) from public;
grant execute on function public.eod_my_report(date) to authenticated;

commit;
