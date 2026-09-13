-- 0342 — the SERVICE decides which module a partner belongs in.
--
-- ---------------------------------------------------------------------------
-- A HARDCODED LIST I WROTE TWO MIGRATIONS AGO
--
-- 0339's `talentops_partners()` selected partners like this:
--
--     where ps.service_type in ('TALENTOPS', 'OPERATIONS_MANAGEMENT', 'CLIENT_SUPPORT')
--
-- which is the same anti-pattern Dee outlawed for people, applied to services:
-- a list typed into a function, that goes stale the moment somebody sells a
-- kind of work nobody thought of when it was written. Bizhub is exactly that
-- case — JM does executive-assistant work there and the partner was invisible
-- in TalentOps, not because the model was wrong but because the list was short.
--
-- `partner_service_types` already carries a `module` column for precisely this
-- job. Six Staffing services were simply left null:
--
--     CLIENT_SUCCESS · CLIENT_SUPPORT · DEDICATED_STAFF
--     EXECUTIVE_ASSISTANT · HOURLY_SUPPORT · OPERATIONS_MANAGEMENT
--
-- They are all human-delivered outsourcing outside CreditOps, which is Dee's
-- definition of TalentOps. So the catalogue is corrected and the function
-- reads it.
--
-- ── THE RULE THIS ENFORCES ─────────────────────────────────────────────────
--
--   SERVICE decides which MODULE a partner belongs in.
--   PARTNER ASSIGNMENT decides which EMPLOYEES may work that partner.
--
-- Those must never be confused. An employee being assigned somewhere can never
-- be what makes a partner "become TalentOps" — that reverses the architecture.
-- ---------------------------------------------------------------------------

-- ── 1. Staffing work is TalentOps work ──────────────────────────────────
--
-- Derived from the catalogue's own category rather than a list typed here, so
-- a Staffing service added next year lands in the right module by itself.
-- Nothing already claimed by a more specific module is touched: Appointment
-- Setting is categorised Marketing and stays with Sales & Marketing.
update public.partner_service_types
   set module = 'talentops'
 where category = 'Staffing'
   and module is null;

comment on column public.partner_service_types.module is
  'Which FullSuite module a partner holding this service belongs in. The single mapping — never a list inside a function, because a list goes stale the first time somebody sells work nobody anticipated (0342).';

-- ── 2. The partner list reads the catalogue ─────────────────────────────
create or replace function public.talentops_partners()
returns table (
  group_id uuid, partner_name text, workspace_id uuid,
  open_tasks integer, due_today integer, overdue integer, agents integer)
language sql stable security definer set search_path = public as $function$
  with mine as (
    /* A partner belongs in TalentOps when they hold a LIVE service whose
       catalogue entry says so. Narrowed by assignment, so the list is only
       ever the accounts this caller was made responsible for. */
    select distinct g.id, g.name
      from public.partner_services ps
      join public.partner_service_types st on st.code = ps.service_type
      join public.outsourcing_groups g on g.id = ps.group_id
     where st.module = 'talentops'
       and st.active
       and ps.status in ('active', 'onboarding')
       and g.archived_at is null
       and public.is_agency_staff()
       and public.can_see_partner(g.id)
  )
  select m.id, m.name, w.id,
         coalesce((select count(*)::int from public.work_items i
                    where i.workspace_id = w.id and i.archived_at is null and i.completed_at is null), 0),
         coalesce((select count(*)::int from public.work_items i
                    where i.workspace_id = w.id and i.archived_at is null and i.completed_at is null
                      and i.due_at::date = current_date), 0),
         coalesce((select count(*)::int from public.work_items i
                    where i.workspace_id = w.id and i.archived_at is null and i.completed_at is null
                      and i.due_at < now()), 0),
         coalesce((select count(distinct a.user_id)::int from public.partner_assignments a
                    where a.group_id = m.id and a.ended_on is null and a.user_id is not null), 0)
    from mine m
    left join public.workspaces w
      on w.partner_group_id = m.id and w.module = 'talentops' and w.archived_at is null
   order by m.name
$function$;

comment on function public.talentops_partners() is
  'The TalentOps partner list — A→Z, from LIVE services whose catalogue entry maps to this module, narrowed by assignment. Never hand-maintained, and never a list of service codes inside the function (0342).';

-- ── 3. Bizhub's actual engagement ───────────────────────────────────────
--
-- JM does executive-assistant work for Bizhub. `EXECUTIVE_ASSISTANT` already
-- describes that exactly, so nothing new is invented.
--
-- The existing BES_CRM service is KEPT. A partner may hold BES CRM and
-- TalentOps at once, and moving a service to make a screen work would be
-- falsifying the commercial record to fix a UI.
insert into public.partner_services (agency_id, group_id, name, service_type, status, started_on, created_by)
select g.agency_id, g.id, 'Executive Assistant', 'EXECUTIVE_ASSISTANT', 'active', current_date,
       (select m.user_id from public.agency_memberships m
         where m.is_owner and m.status = 'active' order by m.created_at limit 1)
  from public.outsourcing_groups g
 where g.name = 'Bizhub'
   and not exists (
     select 1 from public.partner_services ps
      where ps.group_id = g.id and ps.service_type = 'EXECUTIVE_ASSISTANT'
        and ps.status in ('active', 'onboarding'));
