-- =============================================================================
-- BES CRM read the way Dee runs it: Partner → Business → Project. Due dates
-- that tell somebody. And the partner sees their own project and what BES
-- is waiting on them for.
--
-- Dee, 2026-09-09. Three pieces, none of them a new engine:
--
-- 1. BUSINESS. A partner may own several businesses and buy a build for each;
--    the board groups Partner → Business → Project the way the ClickUp
--    folders did. A business is a NAME on the project (data, not a table): a
--    partner's brands are not a canonical record anywhere else in BES yet,
--    and inventing an entity for a grouping label is the rule-2 mistake.
--    When it becomes one, this column is the migration path.
--
-- 2. DUE DATES. Nothing told anyone that work was due or a go-live date had
--    passed: `work_items.due_at` and `crm_projects.target_go_live` were read
--    by the board's "overdue" count and by nothing else. `due_date_sweep()`
--    runs hourly and writes notifications through the SAME table and policy
--    the rest of the platform reads (rule 2, Dee's notification doctrine:
--    "Overdue/SLA → responsible user plus authorized escalation recipient").
--    Deterministic only: a date is a fact; whether the work is late is
--    arithmetic; the sweep infers nothing (rule 9).
--
-- 3. THE PARTNER'S VIEW. `my_partner_projects()` and
--    `my_partner_requirements()` follow `my_partner_clients()` exactly:
--    SECURITY DEFINER, gated entirely by `partner_group_of_user()`, partner-
--    safe columns only. A partner sees their build's scope, progress, journey
--    and go-live, and the list of what BES is waiting on THEM for — never who
--    at BES is building it, never internal notes, never another partner.
-- =============================================================================

-- ── 1 · Business ────────────────────────────────────────────────────────
alter table public.crm_projects
  add column if not exists business_name text
    check (business_name is null or length(trim(business_name)) between 1 and 160);

comment on column public.crm_projects.business_name is
  'The partner''s business or brand this build is for (Dee: Partner → Business → Project). A grouping label, not a record; null means the partner itself.';

/* The board returns one more column, so the return type changes and the
   function must be dropped, not replaced. Body otherwise identical to 0222. */
drop function if exists public.crm_project_board();
create function public.crm_project_board()
returns table (
  id              uuid,
  name            text,
  partner_name    text,
  business_name   text,
  organization_id uuid,
  engines         text[],
  progress        integer,
  journey         text,
  health          text,
  next_milestone  text,
  target_go_live  date,
  lead_name       text,
  open_units      integer,
  waiting_client  integer,
  blocked         integer,
  in_qa           integer,
  overdue         integer
)
language sql stable security invoker set search_path = public as $function$
  select p.id, p.name,
         coalesce(g.name, o.name, '—'),
         p.business_name,
         p.organization_id,
         coalesce(array_agg(distinct e.engine_key) filter (where e.cancelled_at is null), '{}'),
         public.crm_project_progress(p.id),
         public.crm_project_journey(p.id),
         public.crm_project_health(p.id),
         (select m.label from public.crm_milestones m
           where m.project_id = p.id and m.completed_at is null
           order by m.scheduled_at nulls last, m.sort limit 1),
         p.target_go_live,
         coalesce(nullif(trim(pr.full_name), ''), pr.email),
         count(distinct w.id) filter (where w.completed_at is null)::int,
         count(distinct w.id) filter (where w.completed_at is null and w.waiting_on = 'client')::int,
         count(distinct w.id) filter (where w.completed_at is null and w.stage in ('Blocked', 'Attention'))::int,
         count(distinct w.id) filter (where w.completed_at is null and w.stage in ('Ready for QA', 'QA Review'))::int,
         count(distinct w.id) filter (where w.completed_at is null and w.due_at is not null and w.due_at < now())::int
    from public.crm_projects p
    left join public.outsourcing_groups g on g.id = p.partner_group_id
    left join public.organizations o      on o.id = p.organization_id
    left join public.profiles pr          on pr.id = p.lead_id
    left join public.crm_project_engines e on e.project_id = p.id
    left join public.work_items w on w.crm_project_id = p.id and w.archived_at is null
   where p.archived_at is null
   group by p.id, p.name, g.name, o.name, p.business_name, p.organization_id, p.target_go_live, pr.full_name, pr.email
   order by coalesce(g.name, o.name), p.business_name nulls first, p.target_go_live nulls last, p.name
$function$;
revoke execute on function public.crm_project_board() from public, anon;
grant execute on function public.crm_project_board() to authenticated;
comment on function public.crm_project_board() is
  'The whole CRM project board in one call (Dee §43), ordered Partner → Business → Project. SECURITY INVOKER, so `crm_projects_select` decides which projects come back.';

/* crm_create_project learns the business. A new trailing parameter would
   create a second overload beside the old one, so the old signature goes. */
drop function if exists public.crm_create_project(text, text[], uuid, uuid, text, date, date, uuid, uuid, uuid);
create function public.crm_create_project(
  p_name             text,
  p_engines          text[],
  p_partner_group    uuid    default null,
  p_organization     uuid    default null,
  p_preset           text    default null,
  p_started_on       date    default current_date,
  p_target_go_live   date    default null,
  p_lead             uuid    default null,
  p_team             uuid    default null,
  p_partner_service  uuid    default null,
  p_business         text    default null)
returns uuid
language plpgsql security invoker set search_path = public as $function$
declare
  v_agency  uuid := public.my_agency_id();
  v_project uuid;
  v_engine  text;
  v_tmpl    uuid;
begin
  if v_agency is null then
    raise exception 'not BES staff' using errcode = '42501';
  end if;
  if p_engines is null or array_length(p_engines, 1) is null then
    raise exception 'A project needs at least one build engine' using errcode = '22023';
  end if;
  if not public.in_scope(v_agency, 'bes_crm'::public.fulfillment_service,
                         p_team, p_lead, auth.uid()) then
    raise exception 'Your scope does not include BES CRM' using errcode = '42501';
  end if;

  insert into public.crm_projects
    (agency_id, partner_group_id, organization_id, partner_service_id, name, business_name,
     preset, started_on, target_go_live, lead_id, team_id)
  values
    (v_agency, p_partner_group, p_organization, p_partner_service, p_name, nullif(trim(p_business), ''),
     p_preset, p_started_on, p_target_go_live, p_lead, p_team)
  returning id into v_project;

  foreach v_engine in array p_engines loop
    select id into v_tmpl
      from public.crm_engine_templates
     where agency_id = v_agency and engine_key = v_engine and status = 'published'
     order by version desc limit 1;
    if v_tmpl is null then
      raise exception 'No published template for the % engine', v_engine using errcode = '22023';
    end if;
    insert into public.crm_project_engines (project_id, engine_key, template_id)
    values (v_project, v_engine, v_tmpl);
    perform public.crm_instantiate_engine(v_project, v_engine, v_tmpl);
  end loop;

  perform public.crm_instantiate_milestones(v_project, p_engines);
  return v_project;
end $function$;
revoke execute on function public.crm_create_project(text, text[], uuid, uuid, text, date, date, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.crm_create_project(text, text[], uuid, uuid, text, date, date, uuid, uuid, uuid, text) to authenticated;
comment on function public.crm_create_project(text, text[], uuid, uuid, text, date, date, uuid, uuid, uuid, text) is
  'Opens a build for a partner from the engines they bought (Dee §11). 0293 adds the business the build is for.';

-- ── 2 · Due dates that tell somebody ────────────────────────────────────
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('assigned', 'unassigned', 'note', 'status', 'mention', 'dm',
                  'handoff', 'announcement', 'attention', 'timer', 'leave', 'payroll',
                  'due_soon', 'overdue'));

/* Sweep recipients read the same dedupe: a person is told a thing is due
   soon ONCE, and told it is overdue at most once a day. Query-side, because
   the once-per-event index keys on activity_id and a sweep has no activity. */
create index if not exists notifications_due_dedupe_idx
  on public.notifications (recipient_id, entity_type, entity_id, kind, created_at desc)
  where kind in ('due_soon', 'overdue');

create or replace function public.due_date_sweep()
returns integer
language plpgsql security definer set search_path = public as $function$
declare
  v_n integer := 0;
  v_c integer;
begin
  /* ── A. Agency work due within 24 hours → the assignee, once. ──────────
     Agency-scoped work only (the BES team, the live-operations P0):
     notifications.agency_id is NOT NULL and an organization's own work
     carries no agency, so it is out of this sweep by construction. */
  insert into public.notifications
    (recipient_id, agency_id, organization_id, kind, entity_type, entity_id, entity_label, visibility, title, detail)
  select w.assigned_to, w.agency_id, null, 'due_soon', 'work_item', w.id::text, w.title, 'bes_internal',
         'Due soon',
         w.title || ' is due ' || to_char(w.due_at, 'Mon FMDD') || '.'
    from public.work_items w
   where w.scope = 'AGENCY' and w.agency_id is not null
     and w.completed_at is null and w.archived_at is null
     and w.assigned_to is not null
     and w.due_at > now() and w.due_at <= now() + interval '24 hours'
     and not exists (select 1 from public.notifications n
                      where n.recipient_id = w.assigned_to and n.entity_type = 'work_item'
                        and n.entity_id = w.id::text and n.kind = 'due_soon');
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  /* ── B. Agency work overdue → the assignee, at most once a day. ──────── */
  insert into public.notifications
    (recipient_id, agency_id, organization_id, kind, entity_type, entity_id, entity_label, visibility, title, detail)
  select w.assigned_to, w.agency_id, null, 'overdue', 'work_item', w.id::text, w.title, 'bes_internal',
         'Overdue',
         w.title || ' was due ' || to_char(w.due_at, 'Mon FMDD') || '.'
    from public.work_items w
   where w.scope = 'AGENCY' and w.agency_id is not null
     and w.completed_at is null and w.archived_at is null
     and w.assigned_to is not null
     and w.due_at < now()
     and not exists (select 1 from public.notifications n
                      where n.recipient_id = w.assigned_to and n.entity_type = 'work_item'
                        and n.entity_id = w.id::text and n.kind = 'overdue'
                        and n.created_at > now() - interval '23 hours');
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  /* ── C. …and its team's leads, the authorized escalation recipient. ──── */
  insert into public.notifications
    (recipient_id, agency_id, organization_id, kind, entity_type, entity_id, entity_label, visibility, title, detail)
  select tm.user_id, w.agency_id, null, 'overdue', 'work_item', w.id::text, w.title, 'bes_internal',
         'Overdue on your team',
         w.title || ' was due ' || to_char(w.due_at, 'Mon FMDD')
           || coalesce(' — ' || nullif(trim(pr.full_name), ''), '') || '.'
    from public.work_items w
    join public.team_memberships tm on tm.team_id = w.team_id and tm.is_lead
    left join public.profiles pr on pr.id = w.assigned_to
   where w.scope = 'AGENCY' and w.agency_id is not null
     and w.completed_at is null and w.archived_at is null
     and w.due_at < now()
     and tm.user_id is distinct from w.assigned_to
     and not exists (select 1 from public.notifications n
                      where n.recipient_id = tm.user_id and n.entity_type = 'work_item'
                        and n.entity_id = w.id::text and n.kind = 'overdue'
                        and n.created_at > now() - interval '23 hours');
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  /* ── D. A CRM go-live inside seven days, or passed, while the project is
         still being built → the project lead and the team's leads, daily.
         Launch, support and complete are past the date by definition. ── */
  insert into public.notifications
    (recipient_id, agency_id, organization_id, kind, entity_type, entity_id, entity_label, visibility, title, detail)
  select r.recipient, p.agency_id, null,
         case when p.target_go_live < current_date then 'overdue' else 'due_soon' end,
         'crm_project', p.id::text, p.name, 'bes_internal',
         case when p.target_go_live < current_date then 'Go-live date passed'
              else 'Go-live in ' || (p.target_go_live - current_date) || ' day'
                   || case when p.target_go_live - current_date = 1 then '' else 's' end end,
         p.name || coalesce(' — ' || p.business_name, '') || ' targets ' || to_char(p.target_go_live, 'Mon FMDD') || '.'
    from public.crm_projects p
    cross join lateral (
      select p.lead_id as recipient where p.lead_id is not null
      union
      select tm.user_id from public.team_memberships tm where tm.team_id = p.team_id and tm.is_lead
    ) r
   where p.archived_at is null
     and p.target_go_live is not null
     and p.target_go_live <= current_date + 7
     and public.crm_project_journey(p.id) not in ('launch', 'support', 'complete')
     and not exists (select 1 from public.notifications n
                      where n.recipient_id = r.recipient and n.entity_type = 'crm_project'
                        and n.entity_id = p.id::text and n.kind in ('due_soon', 'overdue')
                        and n.created_at > now() - interval '23 hours');
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  return v_n;
end $function$;

/* Internal: cron runs it as the owner. Nobody forges "overdue" from a browser
   (the 0284 lesson — PUBLIC gets execute by default). */
revoke execute on function public.due_date_sweep() from public, anon, authenticated;

comment on function public.due_date_sweep() is
  'Hourly. Agency work due within 24h → assignee once; overdue → assignee and team leads daily; a CRM go-live within 7 days or passed → project lead and team leads daily. Reads dates, infers nothing.';

select cron.schedule('due-date-sweep', '5 * * * *', $$select public.due_date_sweep()$$)
 where not exists (select 1 from cron.job where jobname = 'due-date-sweep');

-- ── 3 · The partner sees their own build, and what BES needs from them ──
create or replace function public.my_partner_projects()
returns table (
  id                uuid,
  name              text,
  business_name     text,
  engines           text[],
  progress          integer,
  journey           text,
  target_go_live    date,
  went_live_at      timestamptz,
  open_requirements integer
)
language sql stable security definer set search_path = public as $function$
  select p.id, p.name, p.business_name,
         coalesce((select array_agg(e.engine_key order by e.engine_key)
                     from public.crm_project_engines e
                    where e.project_id = p.id and e.cancelled_at is null), '{}'),
         public.crm_project_progress(p.id),
         public.crm_project_journey(p.id),
         p.target_go_live,
         p.went_live_at,
         (select count(*)::int from public.crm_client_requirements r
           where r.project_id = p.id and r.satisfied_at is null)
    from public.crm_projects p
   where p.partner_group_id = public.partner_group_of_user()
     and p.archived_at is null
   order by p.business_name nulls first, p.target_go_live nulls last, p.name
$function$;
revoke execute on function public.my_partner_projects() from public, anon;
grant execute on function public.my_partner_projects() to authenticated;
comment on function public.my_partner_projects() is
  'The calling partner contact''s own BES CRM builds: scope, progress, journey, go-live. partner_group_of_user() is the whole gate. No lead, no team, no health reason, no internal detail — ever.';

create or replace function public.my_partner_requirements()
returns table (
  id           uuid,
  project_id   uuid,
  project_name text,
  label        text,
  detail       text,
  requested_on timestamptz
)
language sql stable security definer set search_path = public as $function$
  select r.id, p.id, p.name, r.label, r.detail, r.created_at
    from public.crm_client_requirements r
    join public.crm_projects p on p.id = r.project_id
   where p.partner_group_id = public.partner_group_of_user()
     and p.archived_at is null
     and r.satisfied_at is null
   order by r.created_at
$function$;
revoke execute on function public.my_partner_requirements() from public, anon;
grant execute on function public.my_partner_requirements() to authenticated;
comment on function public.my_partner_requirements() is
  'What BES is waiting on the calling partner for: the outstanding client requirements on their own projects. Satisfying one stays a BES act (crm_satisfy_client_requirement) — the partner sees the ask, BES records the receipt.';
