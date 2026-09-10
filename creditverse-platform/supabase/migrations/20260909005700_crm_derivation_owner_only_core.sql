-- =============================================================================
-- The CRM derivation chain gets an owner-only core, so a DEFINER caller never
-- has to reach through an INVOKER helper.
--
-- Phase 47's structural rule: NO SECURITY DEFINER function calls a helper
-- whose correctness depends on caller RLS. 0293 broke it three times —
-- `my_partner_projects()` and `due_date_sweep()` called crm_project_progress
-- and crm_project_journey, both INVOKER, both reading work_items under
-- whoever's RLS happens to apply. Under a DEFINER that is the owner's RLS,
-- which is none; the answer is right by accident, and the rule exists so
-- nothing is right by accident.
--
-- The fix keeps ONE body per rule (rule 6). Each helper in the chain —
-- crm_work_unit_ready → crm_work_unit_state → crm_project_progress /
-- crm_project_journey — moves its body into an `_unchecked` twin that is
-- SECURITY DEFINER and executable by nobody from a browser. The public name
-- becomes a wrapper: "if the caller can see the row, compute". Visibility is
-- decided once, by the caller's own RLS on the row, exactly as before; the
-- arithmetic runs once, as the owner, so it no longer changes with who asks.
--
-- due_date_sweep needs no DEFINER at all: cron runs it as the owner.
-- =============================================================================

-- ── readiness ───────────────────────────────────────────────────────────
create or replace function public.crm_work_unit_ready_unchecked(p_unit uuid)
returns boolean language sql stable security definer set search_path = public as $function$
  with unit as (
    select w.id, w.stage, w.completed_at, w.crm_project_id, w.crm_work_unit_template_id,
           t.dependency_mode
      from public.work_items w
      left join public.crm_work_unit_templates t on t.id = w.crm_work_unit_template_id
     where w.id = p_unit
  ),
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
revoke execute on function public.crm_work_unit_ready_unchecked(uuid) from public, anon, authenticated;

create or replace function public.crm_work_unit_ready(p_unit uuid)
returns boolean language sql stable security invoker set search_path = public as $function$
  select case when exists (select 1 from public.work_items w where w.id = p_unit)
              then public.crm_work_unit_ready_unchecked(p_unit) end
$function$;

-- ── unit state ──────────────────────────────────────────────────────────
create or replace function public.crm_work_unit_state_unchecked(p_unit uuid)
returns text language sql stable security definer set search_path = public as $function$
  select case
    when w.completed_at is not null then 'COMPLETED'
    when w.stage in ('Blocked', 'Attention')
      or exists (select 1 from public.work_item_blockers b
                  where b.work_item_id = w.id and b.resolved_at is null) then 'BLOCKED'
    when w.waiting_on is not null then 'WAITING'
    when w.stage in ('Ready for QA', 'QA Review') then 'QA'
    when w.stage = 'In Processing' then 'IN PROGRESS'
    when public.crm_work_unit_ready_unchecked(w.id) then 'READY'
    else 'PLANNED'
  end
    from public.work_items w where w.id = p_unit
$function$;
revoke execute on function public.crm_work_unit_state_unchecked(uuid) from public, anon, authenticated;

create or replace function public.crm_work_unit_state(p_unit uuid)
returns text language sql stable security invoker set search_path = public as $function$
  select case when exists (select 1 from public.work_items w where w.id = p_unit)
              then public.crm_work_unit_state_unchecked(p_unit) end
$function$;

-- ── progress ────────────────────────────────────────────────────────────
create or replace function public.crm_project_progress_unchecked(p_project uuid)
returns integer language sql stable security definer set search_path = public as $function$
  select case when count(*) = 0 then null
              else round(100.0 * count(*) filter (where w.completed_at is not null) / count(*))::int end
    from public.work_items w
    join public.crm_project_engines e
      on e.project_id = w.crm_project_id and e.engine_key = w.crm_engine_key and e.cancelled_at is null
   where w.crm_project_id = p_project and w.archived_at is null
$function$;
revoke execute on function public.crm_project_progress_unchecked(uuid) from public, anon, authenticated;

create or replace function public.crm_project_progress(p_project uuid)
returns integer language sql stable security invoker set search_path = public as $function$
  select case when exists (select 1 from public.crm_projects p where p.id = p_project)
              then public.crm_project_progress_unchecked(p_project) end
$function$;

-- ── journey ─────────────────────────────────────────────────────────────
create or replace function public.crm_project_journey_unchecked(p_project uuid)
returns text language sql stable security definer set search_path = public as $function$
  with p as (select * from public.crm_projects where id = p_project),
  u as (
    select w.id, w.completed_at, w.crm_engine_key, w.waiting_on,
           public.crm_work_unit_state_unchecked(w.id) as state
      from public.work_items w
      join public.crm_project_engines e
        on e.project_id = w.crm_project_id and e.engine_key = w.crm_engine_key
       and e.cancelled_at is null
     where w.crm_project_id = p_project and w.archived_at is null
  ),
  open_u as (select * from u where completed_at is null),
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
      when (select yes from launched)
           and (select support_end_date from p) is not null
           and (select support_end_date from p) >= current_date then 'support'
      when not exists (select 1 from open_u)
           and ((select support_end_date from p) is null
                or (select support_end_date from p) < current_date) then 'complete'
      when exists (select 1 from open_u where state in ('IN PROGRESS', 'QA')
                     and crm_engine_key = 'qa_launch') then 'launch'
      when exists (select 1 from open_u where state = 'QA')
           and not exists (select 1 from open_u where state = 'IN PROGRESS') then 'testing'
      when exists (select 1 from open_u where state = 'IN PROGRESS') and not (select active from planning) then 'building'
      when (select active from planning) then 'planning_designing'
      when exists (select 1 from open_u where waiting_on = 'client')
           and not exists (select 1 from u where state not in ('PLANNED', 'READY', 'WAITING')) then 'info_gathering'
      when not exists (select 1 from u where state not in ('PLANNED', 'READY')) then 'info_gathering'
      else 'building'
    end)
$function$;
revoke execute on function public.crm_project_journey_unchecked(uuid) from public, anon, authenticated;

create or replace function public.crm_project_journey(p_project uuid)
returns text language sql stable security invoker set search_path = public as $function$
  select case when exists (select 1 from public.crm_projects p where p.id = p_project)
              then public.crm_project_journey_unchecked(p_project) end
$function$;

comment on function public.crm_project_journey(uuid) is
  'The project''s overall stage (Dee''s seven). Wrapper: the caller''s RLS decides whether the project is theirs to ask about; the owner-only _unchecked twin holds the one body of the rule (0295).';

-- ── the two callers ─────────────────────────────────────────────────────
alter function public.due_date_sweep() security invoker;
comment on function public.due_date_sweep() is
  'Hourly, run by cron AS THE OWNER — so INVOKER, not DEFINER (0295). Agency work due within 24h → assignee once; overdue → assignee and team leads daily; a CRM go-live within 7 days or passed, not yet live → project lead and team leads daily.';

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
         public.crm_project_progress_unchecked(p.id),
         public.crm_project_journey_unchecked(p.id),
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
