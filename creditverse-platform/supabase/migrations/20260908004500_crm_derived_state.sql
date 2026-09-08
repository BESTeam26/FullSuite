-- 0222 — BES CRM: everything derived. Readiness, state, progress, health.
--
-- ===========================================================================
-- NOTHING HERE IS STORED
-- ===========================================================================
--
-- Dee §16: "Agent should not maintain project status." §35: "Do not require
-- Agents to update project health." §38: "These are derived."
--
-- A stored status is a second copy of a truth the work already carries, and it
-- is wrong the moment somebody forgets to update it. So every figure in this
-- migration is a function over `work_items`. The only stored values are the
-- deliberate manager OVERRIDES on `crm_projects`, which carry their reason and
-- their author.
--
-- ===========================================================================
-- PHASE IS NOT A DEPENDENCY ENGINE
-- ===========================================================================
--
-- `crm_work_unit_ready` never reads `crm_work_unit_templates.phase`. Readiness
-- is per-unit prerequisites only, which is exactly what makes §17 and §18
-- true: Website Structure completing can open Page Build AND Forms AND
-- Tracking at once, and a Fulfillment engine waiting on the client cannot
-- freeze the Website engine.
--
-- AND THE PART THAT MAKES A WEBSITE-ONLY BUILD WORK: a dependency whose engine
-- was not purchased has no live unit in the project, so it is not a blocker.
-- "Publish Website requires Website QA AND Domain Ready" holds inside the
-- Website engine; it does not make Sales Pipeline wait for anything.
-- ===========================================================================

----------------------------------------------------------------------
-- 1. Readiness (Dee §19, §20)
----------------------------------------------------------------------
create or replace function public.crm_work_unit_ready(p_unit uuid)
returns boolean
language sql stable security invoker set search_path = public as $function$
  with unit as (
    select w.id, w.stage, w.completed_at, w.crm_project_id, w.crm_work_unit_template_id,
           t.dependency_mode
      from public.work_items w
      left join public.crm_work_unit_templates t on t.id = w.crm_work_unit_template_id
     where w.id = p_unit
  ),
  /* The prerequisites that ACTUALLY EXIST in this project. A dependency on a
     unit from an engine the partner did not buy simply is not here. */
  deps as (
    select d.completed_at is not null as done
      from unit u
      join public.crm_work_unit_template_deps dep
        on dep.work_unit_template_id = u.crm_work_unit_template_id
      join public.work_items d
        on d.crm_project_id = u.crm_project_id
       and d.crm_work_unit_template_id = dep.depends_on_id
       and d.archived_at is null
  )
  select case
    when (select completed_at from unit) is not null then false
    when (select stage from unit) not in ('Queued', 'Assigned') then false
    when (select count(*) from deps) = 0 then true
    when (select dependency_mode from unit) = 'any_required' then exists (select 1 from deps where done)
    when (select dependency_mode from unit) = 'all_required' then not exists (select 1 from deps where not done)
    else true
  end
$function$;
revoke execute on function public.crm_work_unit_ready(uuid) from public, anon;
grant execute on function public.crm_work_unit_ready(uuid) to authenticated;

comment on function public.crm_work_unit_ready(uuid) is
  'Whether this work unit may be started. Per-unit prerequisites only — `phase` is never read (Dee §19/§40). A prerequisite from an engine the partner did not buy has no live unit and is therefore not a blocker, which is what makes a Website-only build work.';

----------------------------------------------------------------------
-- 2. Six display states from one stage column (Dee §15)
--
--    Ordering is deliberate. BLOCKED outranks WAITING because a blocker is an
--    EXCEPTION somebody must act on (§34) while waiting is an expected state
--    (§33); a unit that is both needs the louder label.
----------------------------------------------------------------------
create or replace function public.crm_work_unit_state(p_unit uuid)
returns text
language sql stable security invoker set search_path = public as $function$
  select case
    when w.completed_at is not null then 'COMPLETED'
    when w.stage in ('Blocked', 'Attention')
      or exists (select 1 from public.work_item_blockers b
                  where b.work_item_id = w.id and b.resolved_at is null) then 'BLOCKED'
    when w.waiting_on is not null then 'WAITING'
    when w.stage in ('Ready for QA', 'QA Review') then 'QA'
    when w.stage = 'In Processing' then 'IN PROGRESS'
    /* PLANNED and READY are the same STAGE and different facts (Dee §4, §23).
       A unit whose prerequisite is unfinished is PLANNED — it exists, it is
       nobody's next action, and showing it as Ready would fill My Work with
       work that cannot be done. READY means: pick this up now. */
    when public.crm_work_unit_ready(w.id) then 'READY'
    else 'PLANNED'
  end
    from public.work_items w where w.id = p_unit
$function$;
revoke execute on function public.crm_work_unit_state(uuid) from public, anon;
grant execute on function public.crm_work_unit_state(uuid) to authenticated;

comment on function public.crm_work_unit_state(uuid) is
  'The seven states Dee locked: PLANNED, READY, IN PROGRESS, WAITING, BLOCKED, QA, COMPLETED. All derived from the canonical `work_stage` plus `waiting_on` and the dependency graph — no new status enum, and the work engine''s own `Assigned` and `Attention` are folded in rather than exposed as extras. BLOCKED outranks WAITING because a blocker is an exception somebody must act on (§18) while waiting is expected (§17).';

----------------------------------------------------------------------
-- 2b. Engine lifecycle (Dee §21, §14)
--
--    Each engine has its OWN state, so a project can show
--
--      Website     ACTIVE
--      Sales       QA
--      Fulfillment BUILDING
--
--    at the same time (§25). "ACTIVE FEATURE" from the old ClickUp template
--    lives here — it was never a project status, it is one engine being live
--    while another is still being built (§14).
----------------------------------------------------------------------
create or replace function public.crm_engine_state(p_project uuid, p_engine text)
returns text
language sql stable security invoker set search_path = public as $function$
  with u as (
    select w.id, w.completed_at, public.crm_work_unit_state(w.id) as state
      from public.work_items w
     where w.crm_project_id = p_project and w.crm_engine_key = p_engine
       and w.archived_at is null
  ),
  open_u as (select * from u where completed_at is null),
  live as (
    /* The engine is live when one of ITS activation milestones is complete —
       "Sales Engine Ready", "Feature Active", "Go-Live". An explicit event,
       never inferred from progress (§54), which is exactly where the old
       ClickUp "ACTIVE FEATURE" status belongs (§14). */
    select exists (
      select 1 from public.crm_milestones m
       where m.project_id = p_project
         and m.completed_at is not null
         and ((m.engine_key = p_engine and m.key like '%_ready')
              or (m.engine_key is null and m.key in ('feature_active', 'go_live')))) as yes
  ),
  supported as (
    select coalesce((select support_end_date >= current_date
                       from public.crm_projects where id = p_project), false) as yes
  )
  select case
    when (select count(*) from u) = 0 then 'PLANNED'
    /* LIVE outranks "nothing open" (§21, §27): an engine whose build is
       finished and which is running for the client is ACTIVE, and it becomes
       COMPLETE when the contracted obligation closes — Dee §10, "do not
       confuse Launch with Completed", applied at the engine level. */
    when (select yes from live) and (select yes from supported) then 'SUPPORT'
    when (select yes from live) then 'ACTIVE'
    when not exists (select 1 from open_u) then 'COMPLETE'
    when exists (select 1 from open_u where state = 'QA')
         and not exists (select 1 from open_u where state = 'IN PROGRESS') then 'QA'
    /* BUILDING means somebody is building. An engine whose only movement is a
       unit WAITING on the client has not started — the first version said
       BUILDING there, which would have reported a project as under way while
       it sat waiting for DNS access (§18, §33). */
    when exists (select 1 from u where state = 'IN PROGRESS' or state = 'COMPLETED') then 'BUILDING'
    else 'PLANNED'
  end
$function$;
revoke execute on function public.crm_engine_state(uuid, text) from public, anon;
grant execute on function public.crm_engine_state(uuid, text) to authenticated;

comment on function public.crm_engine_state(uuid, text) is
  'PLANNED / BUILDING / QA / ACTIVE / SUPPORT / COMPLETE for ONE engine (Dee §21), so a project can show Website ACTIVE, Sales QA and Fulfillment BUILDING at once (§25). ACTIVE comes from the engine''s own activation milestone — an explicit event, not a guess from progress (§54) — which is where the old "ACTIVE FEATURE" status belongs. BUILDING requires somebody actually building: an engine waiting on the client has not started.';

----------------------------------------------------------------------
-- 3. Engine progress — ONE call for a whole project (§38)
--
--    Per-engine in a loop would be an N+1 on the screen an owner opens most
--    (rule 14). This returns every engine of the project in one query.
----------------------------------------------------------------------
create or replace function public.crm_project_engine_progress(p_project uuid)
returns table (
  engine_key  text,
  label       text,
  units       integer,
  completed   integer,
  in_progress integer,
  waiting     integer,
  blocked     integer,
  qa          integer,
  ready       integer,
  planned     integer,
  percent     integer,
  state       text,
  cancelled   boolean
)
language sql stable security invoker set search_path = public as $function$
  select e.engine_key,
         en.label,
         count(w.id)::int,
         count(*) filter (where s.state = 'COMPLETED')::int,
         count(*) filter (where s.state = 'IN PROGRESS')::int,
         count(*) filter (where s.state = 'WAITING')::int,
         count(*) filter (where s.state = 'BLOCKED')::int,
         count(*) filter (where s.state = 'QA')::int,
         count(*) filter (where s.state = 'READY')::int,
         count(*) filter (where s.state = 'PLANNED')::int,
         /* NULL, not zero, when an engine holds no units: an engine with no
            work is a configuration question, and "0%" reads as "nothing done
            yet" which is a different fact. */
         case when count(w.id) = 0 then null
              else round(100.0 * count(*) filter (where s.state = 'COMPLETED') / count(w.id))::int
         end,
         public.crm_engine_state(p_project, e.engine_key),
         e.cancelled_at is not null
    from public.crm_project_engines e
    join public.crm_engines en on en.key = e.engine_key
    left join public.work_items w
      on w.crm_project_id = e.project_id
     and w.crm_engine_key = e.engine_key
     and w.archived_at is null
    left join lateral (select public.crm_work_unit_state(w.id) as state) s on true
   where e.project_id = p_project
   group by e.engine_key, en.label, en.sort, e.cancelled_at
   order by en.sort
$function$;
revoke execute on function public.crm_project_engine_progress(uuid) from public, anon;
grant execute on function public.crm_project_engine_progress(uuid) to authenticated;

comment on function public.crm_project_engine_progress(uuid) is
  'Every engine of a project with its unit counts by state and a percentage, in ONE query — a per-engine call would be an N+1 on the owner''s most-opened screen (rule 14). Percent is NULL for an engine with no units, because 0% and "no work configured" are different facts.';

create or replace function public.crm_project_progress(p_project uuid)
returns integer
language sql stable security invoker set search_path = public as $function$
  select case when count(*) = 0 then null
              else round(100.0 * count(*) filter (where w.completed_at is not null) / count(*))::int end
    from public.work_items w
    join public.crm_project_engines e
      on e.project_id = w.crm_project_id and e.engine_key = w.crm_engine_key and e.cancelled_at is null
   where w.crm_project_id = p_project and w.archived_at is null
$function$;
revoke execute on function public.crm_project_progress(uuid) from public, anon;
grant execute on function public.crm_project_progress(uuid) to authenticated;

----------------------------------------------------------------------
-- 4. THE PROJECT JOURNEY (Dee's locked model)
--
--    INFO GATHERING → PLANNING & DESIGNING → BUILDING → TESTING → LAUNCH
--    → SUPPORT → COMPLETE
--
--    The seven stages Dee already recognises from ClickUp, derived rather
--    than maintained (§3, §26). Deterministic and in a fixed order, so two
--    people reading the same project get the same word.
--
--    Two of the old ClickUp statuses are deliberately NOT reachable here:
--    NOT STARTED (§4 — "Info Gathering is more useful") and FOR REVISION
--    (§9 — a QA failure is a result on one unit; one page needing a fix must
--    never relabel the whole project).
----------------------------------------------------------------------
create or replace function public.crm_project_journey(p_project uuid)
returns text
language sql stable security invoker set search_path = public as $function$
  with p as (select * from public.crm_projects where id = p_project),
  u as (
    select w.id, w.completed_at, w.crm_engine_key, w.waiting_on,
           public.crm_work_unit_state(w.id) as state
      from public.work_items w
      join public.crm_project_engines e
        on e.project_id = w.crm_project_id and e.engine_key = w.crm_engine_key
       and e.cancelled_at is null
     where w.crm_project_id = p_project and w.archived_at is null
  ),
  open_u as (select * from u where completed_at is null),
  /* "Planning & designing" work is the architecture: the map, the plan, the
     field design. Recognised by the units Dee's own brief names, so the rule
     reads the template rather than a keyword nobody declared. */
  planning as (
    select exists (
      select 1 from open_u o join public.work_items w on w.id = o.id
        where o.state = 'IN PROGRESS'
          and (w.title ilike '%process map%' or w.title ilike '%page plan%'
               or w.title ilike '%architecture%' or w.title ilike '%offer map%'
               or w.title ilike '%scope confirmation%' or w.title ilike '%structure%')) as active
  ),
  launched as (select (select went_live_at from p) is not null as yes)
  select coalesce(
    (select journey_override from p),
    case
      when (select count(*) from u) = 0 then 'info_gathering'
      /* SUPPORT: gone live, inside the contracted window, still supported. */
      when (select yes from launched)
           and (select support_end_date from p) is not null
           and (select support_end_date from p) >= current_date then 'support'
      /* COMPLETE: nothing open, and any support window has closed (§15). */
      when not exists (select 1 from open_u)
           and ((select support_end_date from p) is null
                or (select support_end_date from p) < current_date) then 'complete'
      /* LAUNCH: the go-live work is what is active (§10). */
      when exists (select 1 from open_u where state in ('IN PROGRESS', 'QA')
                     and crm_engine_key = 'qa_launch') then 'launch'
      /* TESTING: QA is the active work and no build work is running (§8). */
      when exists (select 1 from open_u where state = 'QA')
           and not exists (select 1 from open_u where state = 'IN PROGRESS') then 'testing'
      /* BUILDING: implementation is under way — in ANY engine (§7). */
      when exists (select 1 from open_u where state = 'IN PROGRESS') and not (select active from planning) then 'building'
      when (select active from planning) then 'planning_designing'
      /* Nothing started, and the client still owes things (§5). */
      when exists (select 1 from open_u where waiting_on = 'client')
           and not exists (select 1 from u where state not in ('PLANNED', 'READY', 'WAITING')) then 'info_gathering'
      when not exists (select 1 from u where state not in ('PLANNED', 'READY')) then 'info_gathering'
      else 'building'
    end)
$function$;
revoke execute on function public.crm_project_journey(uuid) from public, anon;
grant execute on function public.crm_project_journey(uuid) to authenticated;

comment on function public.crm_project_journey(uuid) is
  'The seven-stage delivery journey Dee locked on 2026-09-08, derived from the project''s own work — an agent never maintains it (§3, §26). NOT STARTED and FOR REVISION are deliberately unreachable: the first says nothing true (§4), and the second would relabel a whole project because one page needs a fix (§9).';

----------------------------------------------------------------------
-- 5. Project health (Dee §35)
--
--    A QA failure counts as at-risk, and it is read from the ACTIVITY the
--    failure wrote rather than from a new column — the event is already
--    canonical, append-only and attributable.
----------------------------------------------------------------------
create or replace function public.crm_project_health(p_project uuid)
returns text
language sql stable security invoker set search_path = public as $function$
  with p as (select * from public.crm_projects where id = p_project),
  units as (
    select w.id, w.completed_at, w.due_at, w.waiting_on,
           public.crm_work_unit_state(w.id) as state
      from public.work_items w
      join public.crm_project_engines e
        on e.project_id = w.crm_project_id and e.engine_key = w.crm_engine_key and e.cancelled_at is null
     where w.crm_project_id = p_project and w.archived_at is null
  ),
  open_units as (select * from units where completed_at is null)
  select coalesce(
    (select health_override from p),
    case
      when exists (select 1 from open_units where state = 'BLOCKED') then 'blocked'
      when exists (select 1 from open_units)
           and not exists (select 1 from open_units where state <> 'WAITING') then 'waiting'
      when exists (select 1 from open_units where due_at is not null and due_at < now()) then 'at_risk'
      when (select target_go_live from p) is not null
           and (select target_go_live from p) < current_date
           and exists (select 1 from open_units) then 'at_risk'
      /* A unit QA sent back, still open. The activity IS the record. */
      when exists (
        select 1 from public.activity_events a
          join open_units ou on ou.id::text = a.entity_id
         where a.entity_type = 'work_item' and a.action = 'QA returned') then 'at_risk'
      when exists (select 1 from open_units where state = 'QA')
           and not exists (select 1 from open_units where state = 'IN PROGRESS') then 'qa'
      when public.crm_project_journey(p_project) = 'support' then 'support'
      else 'on_track'
    end)
$function$;
revoke execute on function public.crm_project_health(uuid) from public, anon;
grant execute on function public.crm_project_health(uuid) to authenticated;

comment on function public.crm_project_health(uuid) is
  'On track / at risk / blocked / waiting / QA / support, derived from blockers, waiting units, overdue work, the target go-live and QA returns (Dee §35). A QA return is read from the activity event the failure wrote — append-only and attributable — rather than from a status column somebody could forget to clear.';

----------------------------------------------------------------------
-- 6. The project list an owner opens (Dee §43)
--
--    One call. Progress, state, health, waiting, blockers and QA for every
--    project the caller may see — because thirteen projects times five
--    functions is sixty-five round trips, and rule 14 forbids that shape.
----------------------------------------------------------------------
create or replace function public.crm_project_board()
returns table (
  id              uuid,
  name            text,
  partner_name    text,
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
   group by p.id, p.name, g.name, o.name, p.organization_id, p.target_go_live, pr.full_name, pr.email
   order by p.target_go_live nulls last, p.name
$function$;
revoke execute on function public.crm_project_board() from public, anon;
grant execute on function public.crm_project_board() to authenticated;

comment on function public.crm_project_board() is
  'The whole CRM project board in one call (Dee §43). SECURITY INVOKER, so `crm_projects_select` decides which projects come back — a CreditOps-only agent gets none, and a customer gets its own.';
