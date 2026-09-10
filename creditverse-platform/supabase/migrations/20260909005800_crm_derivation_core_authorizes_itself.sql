-- =============================================================================
-- The owner-only derivation cores authorize themselves, so the public wrappers
-- work for the people who may ask.
--
-- 0295 moved the CRM derivation bodies into `_unchecked` SECURITY DEFINER
-- twins and revoked them from every browser role. Correct on paper, broken in
-- the browser: the public wrappers are SECURITY INVOKER, EXECUTE is checked
-- against the CURRENT user, and so the wrapper's own call to the core was
-- refused for every signed-in person. The board came back empty for Dee.
--
-- The fix is the one rule 1 asks for anyway: the core decides, itself, from
-- DEFINER-safe helpers, whether the caller may ask about this project —
--   BES staff in BES CRM scope (exactly crm_projects_select's staff branch),
--   or the customer organization's admin with the CRM entitlement (its other
--   branch), or a contact of the partner the project is for (the portal, 0293).
-- `crm_project_readable()` is that predicate, once. The cores call it, are
-- granted to authenticated, and are now safe to call directly: an unseen
-- project's id yields NULL, never a number. No INVOKER helper is involved
-- (phase 47's rule), and the arithmetic still runs once, as the owner.
-- =============================================================================

create or replace function public.crm_project_readable(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $function$
  select coalesce((
    select (public.is_staff_of(p.agency_id)
              and public.in_scope(p.agency_id, 'bes_crm'::public.fulfillment_service,
                                  p.team_id, p.lead_id, p.created_by))
        or (p.organization_id is not null
              and public.is_org_admin(p.organization_id)
              and public.org_entitled(p.organization_id, 'crm'))
        or (p.partner_group_id is not null
              and p.partner_group_id = public.partner_group_of_user())
      from public.crm_projects p
     where p.id = p_project), false)
$function$;
revoke execute on function public.crm_project_readable(uuid) from public, anon;
grant execute on function public.crm_project_readable(uuid) to authenticated;
comment on function public.crm_project_readable(uuid) is
  'May the caller ask about this project? crm_projects_select''s two branches plus the partner''s own contact. DEFINER-safe helpers only — usable inside other DEFINER functions (phase 47).';

-- Unit-level cores: readable exactly when the unit's project is.
create or replace function public.crm_work_unit_ready_unchecked(p_unit uuid)
returns boolean language sql stable security definer set search_path = public as $function$
  with unit as (
    select w.id, w.stage, w.completed_at, w.crm_project_id, w.crm_work_unit_template_id,
           t.dependency_mode
      from public.work_items w
      left join public.crm_work_unit_templates t on t.id = w.crm_work_unit_template_id
     where w.id = p_unit
       and public.crm_project_readable(w.crm_project_id)
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
    when not exists (select 1 from unit) then null
    when (select completed_at from unit) is not null then false
    when (select stage from unit) not in ('Queued', 'Assigned') then false
    when (select count(*) from deps) = 0 then true
    when (select dependency_mode from unit) = 'any_required' then exists (select 1 from deps where done)
    when (select dependency_mode from unit) = 'all_required' then not exists (select 1 from deps where not done)
    else true
  end
$function$;

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
    from public.work_items w
   where w.id = p_unit
     and public.crm_project_readable(w.crm_project_id)
$function$;

create or replace function public.crm_project_progress_unchecked(p_project uuid)
returns integer language sql stable security definer set search_path = public as $function$
  select case when count(*) = 0 then null
              else round(100.0 * count(*) filter (where w.completed_at is not null) / count(*))::int end
    from public.work_items w
    join public.crm_project_engines e
      on e.project_id = w.crm_project_id and e.engine_key = w.crm_engine_key and e.cancelled_at is null
   where w.crm_project_id = p_project and w.archived_at is null
     and public.crm_project_readable(p_project)
$function$;

create or replace function public.crm_project_journey_unchecked(p_project uuid)
returns text language sql stable security definer set search_path = public as $function$
  with p as (select * from public.crm_projects where id = p_project and public.crm_project_readable(p_project)),
  u as (
    select w.id, w.completed_at, w.crm_engine_key, w.waiting_on,
           public.crm_work_unit_state_unchecked(w.id) as state
      from public.work_items w
      join public.crm_project_engines e
        on e.project_id = w.crm_project_id and e.engine_key = w.crm_engine_key
       and e.cancelled_at is null
     where w.crm_project_id = p_project and w.archived_at is null
       and exists (select 1 from p)
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
  select case when not exists (select 1 from p) then null else coalesce(
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
    end) end
$function$;

grant execute on function public.crm_work_unit_ready_unchecked(uuid),
                          public.crm_work_unit_state_unchecked(uuid),
                          public.crm_project_progress_unchecked(uuid),
                          public.crm_project_journey_unchecked(uuid) to authenticated;
revoke execute on function public.crm_work_unit_ready_unchecked(uuid),
                           public.crm_work_unit_state_unchecked(uuid),
                           public.crm_project_progress_unchecked(uuid),
                           public.crm_project_journey_unchecked(uuid) from public, anon;
