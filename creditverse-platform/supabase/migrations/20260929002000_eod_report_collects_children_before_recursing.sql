-- eod_report: children are collected before any recursive call.
--
-- 20260929001000 worked at team level and failed at department, division and
-- agency with "cannot TRUNCATE eod_scope_people because it is being used by
-- active queries in this session". The child list was enumerated by a query
-- over the shared temp table, and the recursive call for each child truncates
-- that same table while the enumerating scan is still open.
--
-- The fix is an ordering, not a redesign: gather the child ids and names into
-- arrays, let that scan finish, then loop. Everything else in the function is
-- unchanged and is restated here only because a migration cannot patch a
-- function in place.
--
-- Cost impact: none beyond 20260929001000.

begin;

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
     and not tm.is_lead                       -- the lead's own day is Part 1, not a row here
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
          'categories', coalesce((select jsonb_object_agg(x.category, x.units) from (
                            select u.category, sum(u.units) as units
                              from eod_scope_units u join eod_scope_people sp on sp.user_id = u.user_id
                             where case p_level when 'department' then sp.team_id
                                                when 'division'   then sp.department_id
                                                else sp.division_id end = c.child_id
                             group by u.category) x), '{}'::jsonb),
          'total', coalesce((select sum(u.units)
                               from eod_scope_units u join eod_scope_people sp on sp.user_id = u.user_id
                              where case p_level when 'department' then sp.team_id
                                                 when 'division'   then sp.department_id
                                                 else sp.division_id end = c.child_id), 0)
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
                         select case when p_level = 'team' then sp.user_name
                                     when p_level = 'department' then sp.team_name
                                     when p_level = 'division'   then sp.department_name
                                     else sp.division_name end as name,
                                sum(u.units) as units
                           from eod_scope_units u
                           join eod_scope_people sp on sp.user_id = u.user_id
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

comment on function public.eod_report(text, uuid, date) is
  'The one canonical EOD document for a team, department, division or agency '
  'on an Eastern work date. Numbers from production_logs only. The screen and '
  'the email both render this; the level above embeds it under children.';

commit;
