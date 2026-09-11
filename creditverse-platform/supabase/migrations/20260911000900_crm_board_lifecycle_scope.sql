-- =============================================================================
-- The board learns about closed projects.
--
-- `crm_project_board()` hardcoded `where p.archived_at is null`, so an archived
-- project was not merely out of active work — it was unreachable. Dee needs
-- both: Active Projects, and Completed / Archived Projects on the same partner.
--
--   Xavier → BES CRM → GHL Build 2026    Completed
--                    → Website Redesign  Active
--
-- Same canonical partner, same engagement, two projects, both reachable.
--
-- One parameter rather than a second function: two board queries would drift,
-- and the drift would be a partner's history showing different figures from
-- their active work. Defaulted, so every existing caller keeps its behaviour.
-- =============================================================================

drop function if exists public.crm_project_board();

create or replace function public.crm_project_board(p_scope text default 'active')
returns table(id uuid, name text, partner_name text, business_name text,
              organization_id uuid, engines text[], progress integer, journey text,
              health text, next_milestone text, target_go_live date, lead_name text,
              open_units integer, waiting_client integer, blocked integer,
              in_qa integer, overdue integer,
              completed_at timestamptz, archived_at timestamptz,
              deletion_blockers text[])
language sql stable set search_path = public as $function$
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
         count(distinct w.id) filter (where w.completed_at is null and w.due_at is not null and w.due_at < now())::int,
         p.completed_at,
         p.archived_at,
         /* Computed here so the interface can EXPLAIN Delete before offering
            it, rather than attempting it and reporting a refusal. */
         public.crm_project_deletion_blockers(p.id)
    from public.crm_projects p
    left join public.outsourcing_groups g on g.id = p.partner_group_id
    left join public.organizations o      on o.id = p.organization_id
    left join public.profiles pr          on pr.id = p.lead_id
    left join public.crm_project_engines e on e.project_id = p.id
    left join public.work_items w on w.crm_project_id = p.id and w.archived_at is null
   where case p_scope
           when 'active' then p.archived_at is null and p.completed_at is null
           when 'closed' then p.archived_at is not null or p.completed_at is not null
           else true
         end
   group by p.id, p.name, g.name, o.name, p.business_name, p.organization_id,
            p.target_go_live, pr.full_name, pr.email, p.completed_at, p.archived_at
   order by coalesce(g.name, o.name), p.business_name nulls first, p.target_go_live nulls last, p.name
$function$;

comment on function public.crm_project_board(text) is
  'The BES CRM board. `active` (default) is work in progress; `closed` is completed and archived projects, which stay attached to their partner and keep every unit, file and record; `all` is both.';
